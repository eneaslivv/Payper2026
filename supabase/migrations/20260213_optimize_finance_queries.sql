-- =============================================
-- MIGRATION: Optimize Finance Queries
-- Date: 2026-02-13
-- Issue: P1-5 - Potential N+1 queries in Finance.tsx, no pagination
-- Solution: Create optimized views + pagination-ready RPCs
-- =============================================

-- PART 1: Create Materialized View for Daily Sales Summary
-- =============================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.daily_sales_summary AS
SELECT
    o.store_id,
    DATE(o.created_at AT TIME ZONE s.timezone) AS sale_date,
    COUNT(DISTINCT o.id) AS total_orders,
    COUNT(DISTINCT o.client_id) AS unique_customers,
    SUM(o.total_amount) AS total_revenue,
    SUM(CASE WHEN o.is_paid THEN o.total_amount ELSE 0 END) AS paid_revenue,
    SUM(CASE WHEN NOT o.is_paid THEN o.total_amount ELSE 0 END) AS unpaid_revenue,
    AVG(o.total_amount) AS average_order_value,

    -- Payment method breakdown
    jsonb_object_agg(
        COALESCE(o.payment_method, 'pending'),
        o.total_amount
    ) FILTER (WHERE o.payment_method IS NOT NULL) AS payment_methods,

    -- Status breakdown
    COUNT(*) FILTER (WHERE o.status = 'pending') AS pending_orders,
    COUNT(*) FILTER (WHERE o.status = 'preparing') AS preparing_orders,
    COUNT(*) FILTER (WHERE o.status = 'ready') AS ready_orders,
    COUNT(*) FILTER (WHERE o.status = 'delivered') AS delivered_orders,
    COUNT(*) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders

FROM orders o
JOIN stores s ON s.id = o.store_id
GROUP BY o.store_id, DATE(o.created_at AT TIME ZONE s.timezone);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_sales_summary_unique
ON daily_sales_summary(store_id, sale_date);

CREATE INDEX IF NOT EXISTS idx_daily_sales_summary_date
ON daily_sales_summary(sale_date DESC);

COMMENT ON MATERIALIZED VIEW public.daily_sales_summary IS
'Pre-aggregated daily sales metrics. Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales_summary;';

-- PART 2: Create Function to Get Financial Metrics (Paginated)
-- =============================================

CREATE OR REPLACE FUNCTION public.get_financial_metrics_paginated(
    p_store_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_limit INTEGER DEFAULT 30,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    sale_date DATE,
    total_orders BIGINT,
    unique_customers BIGINT,
    total_revenue NUMERIC,
    paid_revenue NUMERIC,
    unpaid_revenue NUMERIC,
    average_order_value NUMERIC,
    payment_methods JSONB,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_total_count BIGINT;
BEGIN
    -- Get total count (for pagination)
    SELECT COUNT(*)
    INTO v_total_count
    FROM daily_sales_summary
    WHERE store_id = p_store_id
    AND sale_date BETWEEN p_start_date AND p_end_date;

    -- Return paginated results
    RETURN QUERY
    SELECT
        dss.sale_date,
        dss.total_orders,
        dss.unique_customers,
        dss.total_revenue,
        dss.paid_revenue,
        dss.unpaid_revenue,
        dss.average_order_value,
        dss.payment_methods,
        v_total_count AS total_count
    FROM daily_sales_summary dss
    WHERE dss.store_id = p_store_id
    AND dss.sale_date BETWEEN p_start_date AND p_end_date
    ORDER BY dss.sale_date DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_financial_metrics_paginated IS
'Returns paginated daily sales metrics. Includes total_count for pagination UI.';

-- PART 3: Create Function to Get Top Products (Optimized)
-- =============================================

CREATE OR REPLACE FUNCTION public.get_top_products(
    p_store_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    category_name TEXT,
    total_quantity BIGINT,
    total_revenue NUMERIC,
    order_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id AS product_id,
        p.name AS product_name,
        c.name AS category_name,
        SUM(oi.quantity)::BIGINT AS total_quantity,
        SUM(oi.quantity * oi.unit_price) AS total_revenue,
        COUNT(DISTINCT oi.order_id)::BIGINT AS order_count
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE o.store_id = p_store_id
    AND DATE(o.created_at) BETWEEN p_start_date AND p_end_date
    AND o.status != 'cancelled'
    GROUP BY p.id, p.name, c.name
    ORDER BY total_revenue DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_top_products IS
'Returns top selling products by revenue for a date range. No N+1 queries.';

-- PART 4: Create Function to Refresh Daily Sales Summary
-- =============================================

CREATE OR REPLACE FUNCTION public.refresh_daily_sales_summary()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY daily_sales_summary;
    RAISE NOTICE 'Daily sales summary refreshed at %', NOW();
END;
$$;

COMMENT ON FUNCTION public.refresh_daily_sales_summary IS
'Refreshes the daily_sales_summary materialized view. Run this nightly or after bulk order changes.';

-- PART 5: Create Scheduled Job (Using pg_cron if available)
-- =============================================

-- Note: pg_cron must be enabled by Supabase project owner
-- This is just documentation of the recommended schedule

COMMENT ON FUNCTION public.refresh_daily_sales_summary IS
'Recommended schedule (via pg_cron):
SELECT cron.schedule(
  ''refresh-daily-sales'',
  ''0 2 * * *'',  -- Every day at 2 AM
  $$SELECT refresh_daily_sales_summary()$$
);';

-- PART 6: Create Indexes for Finance Queries
-- =============================================

-- Index for orders by date range
CREATE INDEX IF NOT EXISTS idx_orders_created_at_store
ON orders(store_id, created_at DESC)
WHERE status != 'cancelled';

-- Index for order_items with product lookup
CREATE INDEX IF NOT EXISTS idx_order_items_product
ON order_items(product_id, order_id);

-- Index for orders payment method
CREATE INDEX IF NOT EXISTS idx_orders_payment_method
ON orders(store_id, payment_method)
WHERE payment_method IS NOT NULL;

-- PART 7: Create View for Recent Orders (Optimized)
-- =============================================

CREATE OR REPLACE VIEW public.recent_orders_optimized AS
SELECT
    o.id,
    o.store_id,
    o.order_number,
    o.total_amount,
    o.status,
    o.payment_method,
    o.is_paid,
    o.created_at,

    -- Client info (single join)
    jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'email', c.email
    ) AS client_info,

    -- Items count (aggregated)
    (
        SELECT COUNT(*)
        FROM order_items oi
        WHERE oi.order_id = o.id
    ) AS items_count,

    -- Total items quantity
    (
        SELECT SUM(oi.quantity)
        FROM order_items oi
        WHERE oi.order_id = o.id
    ) AS total_items

FROM orders o
LEFT JOIN clients c ON c.id = o.client_id
WHERE o.created_at >= NOW() - INTERVAL '30 days'
ORDER BY o.created_at DESC;

COMMENT ON VIEW public.recent_orders_optimized IS
'Optimized view for recent orders. Includes aggregated items data to avoid N+1 queries.';

-- PART 8: Grant Permissions
-- =============================================

GRANT SELECT ON daily_sales_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_financial_metrics_paginated TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_products TO authenticated;
GRANT SELECT ON recent_orders_optimized TO authenticated;

-- PART 9: Initial Materialized View Refresh
-- =============================================

REFRESH MATERIALIZED VIEW daily_sales_summary;

-- PART 10: Verification
-- =============================================

-- Test paginated query
SELECT * FROM get_financial_metrics_paginated(
    (SELECT id FROM stores LIMIT 1),
    CURRENT_DATE - INTERVAL '30 days',
    CURRENT_DATE,
    10,  -- limit
    0    -- offset
);

-- Test top products
SELECT * FROM get_top_products(
    (SELECT id FROM stores LIMIT 1),
    CURRENT_DATE - INTERVAL '7 days',
    CURRENT_DATE,
    5
);

-- Show performance improvement
EXPLAIN ANALYZE
SELECT * FROM recent_orders_optimized LIMIT 20;

RAISE NOTICE '✅ P1-5 COMPLETED: Finance queries optimized';
RAISE NOTICE 'Materialized view: daily_sales_summary (refresh nightly)';
RAISE NOTICE 'Paginated RPC: get_financial_metrics_paginated()';
RAISE NOTICE 'Top products: get_top_products()';
RAISE NOTICE 'Optimized view: recent_orders_optimized';
