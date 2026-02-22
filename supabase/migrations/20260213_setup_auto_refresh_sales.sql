-- Setup automatic refresh for daily_sales_summary materialized view
-- This ensures financial metrics stay up-to-date automatically

-- First, install pg_cron extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to safely refresh the materialized view
CREATE OR REPLACE FUNCTION public.refresh_daily_sales_summary()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Use CONCURRENTLY to avoid blocking reads
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_sales_summary;
    
    -- Log the refresh for monitoring
    INSERT INTO public.system_logs (
        level,
        category,
        message,
        metadata,
        created_at
    ) VALUES (
        'INFO',
        'CRON_JOB',
        'Daily sales summary refreshed successfully',
        jsonb_build_object(
            'view_name', 'daily_sales_summary',
            'refresh_type', 'CONCURRENTLY',
            'triggered_by', 'cron'
        ),
        NOW()
    );
    
    RETURN 'SUCCESS: daily_sales_summary refreshed at ' || NOW()::text;
    
EXCEPTION
    WHEN OTHERS THEN
        -- Log errors for debugging
        INSERT INTO public.system_logs (
            level,
            category,
            message,
            metadata,
            created_at
        ) VALUES (
            'ERROR',
            'CRON_JOB',
            'Failed to refresh daily_sales_summary: ' || SQLERRM,
            jsonb_build_object(
                'view_name', 'daily_sales_summary',
                'error_code', SQLSTATE,
                'error_message', SQLERRM
            ),
            NOW()
        );
        
        RETURN 'ERROR: ' || SQLERRM;
END;
$$;

-- Grant execute permission to postgres role (required for cron)
GRANT EXECUTE ON FUNCTION public.refresh_daily_sales_summary() TO postgres;

-- Schedule automatic refresh every 15 minutes
-- This balances freshness with performance
SELECT cron.schedule(
    'refresh-daily-sales-summary',
    '*/15 * * * *',  -- Every 15 minutes
    'SELECT public.refresh_daily_sales_summary();'
);

-- Optional: Create trigger for immediate refresh on critical order changes
-- This ensures real-time accuracy for recent orders
CREATE OR REPLACE FUNCTION public.trigger_sales_summary_refresh()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Only refresh for today's orders to avoid unnecessary work
    IF DATE(COALESCE(NEW.created_at, OLD.created_at)) = CURRENT_DATE THEN
        -- Use pg_notify to trigger async refresh
        PERFORM pg_notify('refresh_sales_summary', 
            jsonb_build_object(
                'order_id', COALESCE(NEW.id, OLD.id),
                'action', TG_OP,
                'timestamp', NOW()
            )::text
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on orders table for payment status changes
DROP TRIGGER IF EXISTS trg_orders_refresh_sales_summary ON orders;
CREATE TRIGGER trg_orders_refresh_sales_summary
    AFTER UPDATE OF payment_status, status, total_amount
    ON orders
    FOR EACH ROW
    WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status 
          OR OLD.status IS DISTINCT FROM NEW.status 
          OR OLD.total_amount IS DISTINCT FROM NEW.total_amount)
    EXECUTE FUNCTION trigger_sales_summary_refresh();

-- Also trigger on INSERT of new orders
CREATE TRIGGER trg_orders_insert_refresh_sales_summary
    AFTER INSERT
    ON orders
    FOR EACH ROW
    EXECUTE FUNCTION trigger_sales_summary_refresh();

-- Create monitoring view for cron job status
CREATE OR REPLACE VIEW public.monitoring_cron_jobs AS
SELECT 
    jobname,
    schedule,
    command,
    active,
    created_at as job_created_at,
    CASE 
        WHEN active THEN 'ACTIVE'
        ELSE 'INACTIVE'
    END as status
FROM cron.job
WHERE jobname LIKE '%refresh%' OR jobname LIKE '%sales%'
ORDER BY created_at DESC;

-- Create view for sales summary refresh logs
CREATE OR REPLACE VIEW public.monitoring_sales_refresh_logs AS
SELECT 
    created_at,
    level,
    message,
    metadata->>'refresh_type' as refresh_type,
    metadata->>'error_code' as error_code,
    metadata->>'error_message' as error_message
FROM system_logs 
WHERE category = 'CRON_JOB' 
  AND message ILIKE '%daily_sales_summary%'
ORDER BY created_at DESC
LIMIT 100;

-- Manual refresh function for immediate updates (accessible via RPC)
CREATE OR REPLACE FUNCTION public.manual_refresh_sales_summary()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result_text text;
BEGIN
    -- Check if user has permission (store owner or super admin)
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND role IN ('store_owner', 'super_admin')
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Only store owners and admins can refresh sales summary';
    END IF;
    
    -- Perform refresh
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.daily_sales_summary;
    
    result_text := 'Manual refresh completed successfully at ' || NOW()::text;
    
    -- Log manual refresh
    INSERT INTO public.system_logs (
        level,
        category,
        message,
        metadata,
        created_at
    ) VALUES (
        'INFO',
        'MANUAL_REFRESH',
        result_text,
        jsonb_build_object(
            'view_name', 'daily_sales_summary',
            'user_id', auth.uid(),
            'refresh_type', 'MANUAL'
        ),
        NOW()
    );
    
    RETURN result_text;
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN 'ERROR: ' || SQLERRM;
END;
$$;

-- Test the setup
DO $$
DECLARE
    refresh_result text;
BEGIN
    -- Test manual refresh
    SELECT public.refresh_daily_sales_summary() INTO refresh_result;
    RAISE NOTICE 'Initial refresh result: %', refresh_result;
    
    -- Verify cron job was created
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-daily-sales-summary') THEN
        RAISE NOTICE 'Cron job created successfully';
    ELSE
        RAISE WARNING 'Cron job creation may have failed';
    END IF;
END;
$$;

COMMENT ON FUNCTION public.refresh_daily_sales_summary() IS 
'Automatically refreshes daily_sales_summary materialized view. Scheduled to run every 15 minutes via pg_cron.';

COMMENT ON FUNCTION public.manual_refresh_sales_summary() IS 
'Manual refresh function for daily_sales_summary. Can be called via RPC by store owners and admins.';

COMMENT ON VIEW public.monitoring_cron_jobs IS 
'Monitoring view for tracking cron job status and configuration.';

COMMENT ON VIEW public.monitoring_sales_refresh_logs IS 
'Monitoring view for tracking sales summary refresh operations and any errors.';