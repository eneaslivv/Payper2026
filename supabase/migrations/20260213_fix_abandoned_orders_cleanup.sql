-- =============================================
-- FIX #1: ABANDONED ORDERS CLEANUP
-- Fecha: 2026-02-13
-- Problema:
--   Órdenes pending sin pagar quedan "zombies" indefinidamente
--   Cliente abandona Mercado Pago pero orden no se limpia
-- Solución:
--   1. Función de limpieza automática (cron/manual)
--   2. Cancelar MP preferences expiradas vía webhook
-- =============================================

-- 1. FUNCTION: Clean Abandoned Orders
CREATE OR REPLACE FUNCTION cleanup_abandoned_orders(
    p_timeout_hours INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_abandoned_orders UUID[];
    v_count INTEGER := 0;
BEGIN
    -- Find abandoned orders
    SELECT array_agg(id) INTO v_abandoned_orders
    FROM orders
    WHERE status = 'pending'
      AND is_paid = FALSE
      AND (payment_method IS NULL OR payment_method = 'qr' OR payment_provider = 'mercadopago')
      AND created_at < NOW() - (p_timeout_hours || ' hours')::INTERVAL
      AND archived_at IS NULL;

    -- Cancel abandoned orders
    UPDATE orders
    SET status = 'cancelled',
        cancelled_reason = 'Payment timeout - abandoned after ' || p_timeout_hours || ' hours',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = ANY(v_abandoned_orders);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RAISE NOTICE 'Cleaned up % abandoned orders (timeout: % hours)',
        v_count, p_timeout_hours;

    RETURN jsonb_build_object(
        'success', TRUE,
        'cancelled_count', v_count,
        'cancelled_orders', v_abandoned_orders,
        'timeout_hours', p_timeout_hours
    );
END;
$$;

-- 2. FUNCTION: Schedule Cleanup (Call from pg_cron or Edge Function)
CREATE OR REPLACE FUNCTION schedule_cleanup_abandoned_orders()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Call cleanup with 2-hour timeout
    PERFORM cleanup_abandoned_orders(2);

    -- Also cleanup very old draft orders (24 hours)
    UPDATE orders
    SET status = 'cancelled',
        cancelled_reason = 'Draft timeout - no activity for 24 hours',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE status = 'draft'
      AND created_at < NOW() - INTERVAL '24 hours'
      AND archived_at IS NULL;
END;
$$;

-- 3. TABLE: Abandoned Order Alerts
CREATE TABLE IF NOT EXISTS abandoned_order_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    alert_time TIMESTAMPTZ DEFAULT NOW(),
    hours_pending INTEGER,
    total_amount NUMERIC,
    payment_provider TEXT,
    auto_cancelled BOOLEAN DEFAULT FALSE,
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES profiles(id),
    acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_abandoned_alerts_unacknowledged
ON abandoned_order_alerts(store_id, acknowledged)
WHERE acknowledged = FALSE;

-- 4. FUNCTION: Alert Before Auto-Cancel (30 min warning)
CREATE OR REPLACE FUNCTION alert_pending_abandonment()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Find orders that will be auto-cancelled in 30 min
    FOR v_order IN
        SELECT
            o.id,
            o.store_id,
            o.total_amount,
            o.payment_provider,
            EXTRACT(EPOCH FROM (NOW() - o.created_at))/3600 as hours_pending
        FROM orders o
        WHERE o.status = 'pending'
          AND o.is_paid = FALSE
          AND o.created_at < NOW() - INTERVAL '1.5 hours'  -- 1.5h = 30min before 2h timeout
          AND o.created_at > NOW() - INTERVAL '2 hours'    -- Not yet expired
          AND NOT EXISTS (
              SELECT 1 FROM abandoned_order_alerts aoa
              WHERE aoa.order_id = o.id
          )
    LOOP
        -- Create alert
        INSERT INTO abandoned_order_alerts (
            order_id,
            store_id,
            hours_pending,
            total_amount,
            payment_provider,
            auto_cancelled
        ) VALUES (
            v_order.id,
            v_order.store_id,
            v_order.hours_pending::INTEGER,
            v_order.total_amount,
            v_order.payment_provider,
            FALSE
        );

        -- Notify via pg_notify
        PERFORM pg_notify(
            'order_alert',
            json_build_object(
                'type', 'pending_abandonment',
                'order_id', v_order.id,
                'store_id', v_order.store_id,
                'hours_pending', v_order.hours_pending,
                'message', 'Orden será cancelada automáticamente en 30 minutos'
            )::text
        );
    END LOOP;
END;
$$;

-- 5. CRON JOB SETUP (Manual - requires pg_cron extension)
-- Run this manually in Supabase SQL Editor if pg_cron is available:
/*
-- Enable extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup every hour
SELECT cron.schedule(
    'cleanup-abandoned-orders',
    '0 * * * *',  -- Every hour at :00
    $$SELECT cleanup_abandoned_orders(2);$$
);

-- Schedule alerts every 15 minutes
SELECT cron.schedule(
    'alert-pending-abandonment',
    '*/15 * * * *',  -- Every 15 minutes
    $$SELECT alert_pending_abandonment();$$
);
*/

-- 6. ALTERNATIVE: Manual Trigger via Edge Function
-- Create this Edge Function to call via scheduled webhook (Supabase Cron alternative)

-- 7. VIEW: Abandonable Orders (For Dashboard)
CREATE OR REPLACE VIEW abandonable_orders AS
SELECT
    o.id,
    o.order_number,
    o.store_id,
    s.name as store_name,
    o.status,
    o.total_amount,
    o.payment_method,
    o.payment_provider,
    o.created_at,
    EXTRACT(EPOCH FROM (NOW() - o.created_at))/60 as minutes_pending,
    CASE
        WHEN o.created_at < NOW() - INTERVAL '2 hours' THEN 'expired'
        WHEN o.created_at < NOW() - INTERVAL '1.5 hours' THEN 'warning'
        ELSE 'pending'
    END as abandonment_status
FROM orders o
JOIN stores s ON o.store_id = s.id
WHERE o.status = 'pending'
  AND o.is_paid = FALSE
  AND o.archived_at IS NULL
ORDER BY o.created_at ASC;

-- 8. RPC: Manual Cleanup (For Dashboard Button)
CREATE OR REPLACE FUNCTION manual_cleanup_abandoned_orders(
    p_store_id UUID,
    p_timeout_hours INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Only cleanup for specific store
    WITH cancelled AS (
        UPDATE orders
        SET status = 'cancelled',
            cancelled_reason = 'Manual cleanup - payment timeout',
            cancelled_at = NOW(),
            updated_at = NOW()
        WHERE store_id = p_store_id
          AND status = 'pending'
          AND is_paid = FALSE
          AND created_at < NOW() - (p_timeout_hours || ' hours')::INTERVAL
          AND archived_at IS NULL
        RETURNING id, order_number, total_amount
    )
    SELECT json_agg(c.*) INTO v_result
    FROM cancelled c;

    RETURN jsonb_build_object(
        'success', TRUE,
        'cancelled_orders', COALESCE(v_result, '[]'::jsonb)
    );
END;
$$;

-- 9. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION cleanup_abandoned_orders(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION schedule_cleanup_abandoned_orders() TO service_role;
GRANT EXECUTE ON FUNCTION alert_pending_abandonment() TO service_role;
GRANT EXECUTE ON FUNCTION manual_cleanup_abandoned_orders(UUID, INTEGER) TO authenticated;
GRANT SELECT ON abandonable_orders TO authenticated;
GRANT ALL ON abandoned_order_alerts TO authenticated;

-- 10. COMMENT
COMMENT ON FUNCTION cleanup_abandoned_orders IS
'Automatically cancels orders that have been pending for X hours without payment.
Default timeout: 2 hours.
Returns list of cancelled order IDs.
Should be called via cron job or scheduled Edge Function.';

COMMENT ON VIEW abandonable_orders IS
'Shows all pending unpaid orders with their age and abandonment status.
Used by dashboard to show at-risk orders before auto-cancellation.';

COMMENT ON TABLE abandoned_order_alerts IS
'Alerts for orders approaching auto-cancellation timeout.
Allows staff to be notified 30min before automatic cleanup.';
