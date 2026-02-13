-- =============================================
-- MIGRATION: Extend Financial Metrics RPC
-- Date: 2026-02-13
-- Purpose: Add topups, liability, and loyalty cost to financial metrics
-- =============================================

-- Extended version of get_financial_metrics_paginated
-- Includes topups, wallet liability, and loyalty redemption costs
CREATE OR REPLACE FUNCTION public.get_financial_metrics_extended(
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
    topups_today NUMERIC,
    total_liability NUMERIC,
    loyalty_cost NUMERIC,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_total_count BIGINT;
    v_total_liability NUMERIC;
BEGIN
    -- Get count for pagination
    SELECT COUNT(*) INTO v_total_count
    FROM daily_sales_summary
    WHERE store_id = p_store_id
    AND sale_date BETWEEN p_start_date AND p_end_date;

    -- Get current total liability (same for all dates)
    SELECT COALESCE(SUM(wallet_balance), 0) INTO v_total_liability
    FROM clients
    WHERE store_id = p_store_id;

    RETURN QUERY
    SELECT
        dss.sale_date,
        dss.total_orders,
        dss.unique_customers,
        dss.total_revenue,
        -- Topups for this specific date
        COALESCE((
            SELECT SUM(amount)
            FROM wallet_ledger
            WHERE store_id = p_store_id
            AND DATE(created_at) = dss.sale_date
            AND entry_type = 'topup'
        ), 0) AS topups_today,
        -- Total liability (current total, not date-specific)
        v_total_liability AS total_liability,
        -- Loyalty cost for this specific date
        COALESCE((
            SELECT SUM(monetary_cost)
            FROM loyalty_transactions
            WHERE store_id = p_store_id
            AND DATE(created_at) = dss.sale_date
            AND type = 'burn'
            AND is_rolled_back = FALSE
        ), 0) AS loyalty_cost,
        v_total_count
    FROM daily_sales_summary dss
    WHERE dss.store_id = p_store_id
    AND dss.sale_date BETWEEN p_start_date AND p_end_date
    ORDER BY dss.sale_date DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_financial_metrics_extended IS 'Extended financial metrics including topups, wallet liability, and loyalty costs';

GRANT EXECUTE ON FUNCTION public.get_financial_metrics_extended TO authenticated;

-- Verification query
SELECT
    'Extended metrics function created' as status,
    COUNT(*) as test_count
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'get_financial_metrics_extended';
