-- ============================================================
-- P2 REVENUE CONSISTENCY & ANALYTICS MIGRATION
-- Applied: 2026-02-17
--
-- Fixes:
--   1. Single source of truth for "revenue-eligible" order statuses
--   2. Standardize all financial RPCs to use the same filter
--   3. Recreate daily_sales_summary MV with proper WHERE clause
--   4. Wallet balance reconciliation function
--   5. Per-bar revenue RPC (strategic)
--   6. Improve SmartInsights RPC (server-side aggregation)
-- ============================================================


-- ============================================================
-- 1. CANONICAL REVENUE STATUS HELPER
-- ============================================================
-- Single immutable function that defines which order statuses count as revenue.
-- ALL financial queries MUST use this function for consistency.
--
-- Revenue = order has been accepted/confirmed (kitchen working or beyond).
-- NOT revenue = draft, pending (awaiting confirmation), cancelled, refunded, rejected.

-- Drop any existing overloads to avoid ambiguity
DO $$
BEGIN
    -- Drop enum overload if exists
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_enum') THEN
        EXECUTE 'DROP FUNCTION IF EXISTS public.is_revenue_order(order_status_enum)';
    END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DROP FUNCTION IF EXISTS public.is_revenue_order(TEXT);

CREATE FUNCTION public.is_revenue_order(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT p_status NOT IN ('draft', 'pending', 'cancelled', 'refunded', 'rejected')
$$;

COMMENT ON FUNCTION public.is_revenue_order IS
'Canonical filter: returns TRUE if order status qualifies as revenue.
Excludes: draft, pending, cancelled, refunded, rejected.
Includes: preparing, confirmed, ready, served, delivered, paid, completed.
ALL financial queries must use this function for consistency.';


-- ============================================================
-- 2. UPDATE get_financial_chart_data() - use canonical filter
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_financial_chart_data(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH time_series AS (
        SELECT generate_series(
            date_trunc('hour', p_start_date),
            date_trunc('hour', p_end_date),
            '1 hour'::interval
        ) AS bucket
    ),
    order_data AS (
        SELECT
            date_trunc('hour', created_at) AS bucket,
            SUM(CASE WHEN payment_method = 'mercadopago' THEN total_amount ELSE 0 END) as mp_sales,
            SUM(CASE WHEN payment_method ILIKE '%efectivo%' OR payment_method = 'cash' THEN total_amount ELSE 0 END) as cash_sales,
            SUM(CASE WHEN payment_method = 'wallet' THEN total_amount ELSE 0 END) as wallet_sales,
            SUM(CASE WHEN payment_method IS DISTINCT FROM 'mercadopago'
                      AND payment_method IS DISTINCT FROM 'cash'
                      AND payment_method NOT ILIKE '%efectivo%'
                      AND payment_method IS DISTINCT FROM 'wallet'
                 THEN total_amount ELSE 0 END) as other_sales
        FROM orders
        WHERE store_id = p_store_id
          AND created_at BETWEEN p_start_date AND p_end_date
          AND is_revenue_order(status::TEXT)  -- STANDARDIZED
        GROUP BY 1
    ),
    ledger_data AS (
        SELECT
            date_trunc('hour', created_at) AS bucket,
            SUM(CASE WHEN payment_method = 'cash' THEN amount ELSE 0 END) as cash_topups,
            SUM(CASE WHEN payment_method = 'transfer' THEN amount ELSE 0 END) as transfer_topups
        FROM wallet_ledger
        WHERE store_id = p_store_id
          AND created_at BETWEEN p_start_date AND p_end_date
          AND entry_type = 'topup'
          AND amount > 0
        GROUP BY 1
    )
    SELECT jsonb_agg(jsonb_build_object(
        'time', ts.bucket,
        'hour_label', to_char(ts.bucket, 'HH24:MI'),
        'mercadopago', COALESCE(od.mp_sales, 0),
        'cash_sales', COALESCE(od.cash_sales, 0),
        'wallet_sales', COALESCE(od.wallet_sales, 0),
        'cash_topups', COALESCE(ld.cash_topups, 0),
        'transfer_topups', COALESCE(ld.transfer_topups, 0),
        'total_revenue', (
            COALESCE(od.mp_sales, 0) +
            COALESCE(od.cash_sales, 0) +
            COALESCE(ld.cash_topups, 0) +
            COALESCE(ld.transfer_topups, 0)
        )
    ) ORDER BY ts.bucket) INTO v_result
    FROM time_series ts
    LEFT JOIN order_data od ON ts.bucket = od.bucket
    LEFT JOIN ledger_data ld ON ts.bucket = ld.bucket;

    RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ============================================================
-- 3. UPDATE get_financial_metrics() - use canonical filter
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_financial_metrics(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_store_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_gross_revenue NUMERIC := 0;
    v_net_cash_flow NUMERIC := 0;
    v_total_orders INTEGER := 0;
    v_revenue_by_method JSONB;

    v_variable_expenses NUMERIC := 0;
    v_marketing_loss NUMERIC := 0;
    v_internal_loss NUMERIC := 0;
    v_operational_loss NUMERIC := 0;

    v_fixed_expenses_total NUMERIC := 0;
    v_cogs_estimated NUMERIC := 0;

    v_topups_total NUMERIC := 0;
    v_sales_non_wallet NUMERIC := 0;
    v_gross_profit NUMERIC;
    v_net_profit NUMERIC;
BEGIN
    -- 1. REVENUE - using canonical status filter
    SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_gross_revenue, v_total_orders
    FROM public.orders
    WHERE store_id = p_store_id
      AND created_at BETWEEN p_start_date AND p_end_date
      AND is_revenue_order(status::TEXT);  -- STANDARDIZED

    -- 2. REVENUE BY PAYMENT METHOD
    SELECT json_agg(json_build_object('method', method, 'total', total))
    INTO v_revenue_by_method
    FROM (
        SELECT payment_method AS method, SUM(total_amount) AS total
        FROM public.orders
        WHERE store_id = p_store_id
          AND created_at BETWEEN p_start_date AND p_end_date
          AND is_revenue_order(status::TEXT)  -- STANDARDIZED
        GROUP BY payment_method
    ) t;

    -- 3. WALLET TOPUPS (Real Cash In)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_topups_total
    FROM public.wallet_ledger
    WHERE store_id = p_store_id
      AND amount > 0
      AND entry_type = 'topup'
      AND created_at BETWEEN p_start_date AND p_end_date;

    -- 4. CASH FLOW (non-wallet sales + topups)
    SELECT COALESCE(SUM(total_amount), 0)
    INTO v_sales_non_wallet
    FROM public.orders
    WHERE store_id = p_store_id
      AND created_at BETWEEN p_start_date AND p_end_date
      AND is_revenue_order(status)  -- STANDARDIZED
      AND payment_method != 'wallet';

    v_net_cash_flow := v_sales_non_wallet + v_topups_total;

    -- 5. VARIABLE EXPENSES (inventory losses at cost)
    SELECT COALESCE(SUM(ABS(quantity_delta) * COALESCE(unit_cost, 0)), 0)
    INTO v_marketing_loss
    FROM public.inventory_audit_logs
    WHERE store_id = p_store_id
      AND created_at BETWEEN p_start_date AND p_end_date
      AND action_type = 'gift';

    SELECT COALESCE(SUM(ABS(quantity_delta) * COALESCE(unit_cost, 0)), 0)
    INTO v_internal_loss
    FROM public.inventory_audit_logs
    WHERE store_id = p_store_id
      AND created_at BETWEEN p_start_date AND p_end_date
      AND action_type = 'internal_use';

    SELECT COALESCE(SUM(ABS(quantity_delta) * COALESCE(unit_cost, 0)), 0)
    INTO v_operational_loss
    FROM public.inventory_audit_logs
    WHERE store_id = p_store_id
      AND created_at BETWEEN p_start_date AND p_end_date
      AND action_type IN ('loss', 'loss_expired', 'loss_damaged', 'loss_theft');

    v_variable_expenses := v_marketing_loss + v_internal_loss + v_operational_loss;

    -- 6. FIXED EXPENSES
    SELECT COALESCE(SUM(amount), 0)
    INTO v_fixed_expenses_total
    FROM public.fixed_expenses
    WHERE store_id = p_store_id
      AND expense_date BETWEEN p_start_date::date AND p_end_date::date;

    -- 7. ESTIMATED COGS
    SELECT COALESCE(SUM(oi.quantity * COALESCE(ii.cost, 0)), 0)
    INTO v_cogs_estimated
    FROM public.order_items oi
    JOIN public.orders o ON oi.order_id = o.id
    LEFT JOIN public.inventory_items ii ON oi.product_id = ii.id
    WHERE o.store_id = p_store_id
      AND o.created_at BETWEEN p_start_date AND p_end_date
      AND is_revenue_order(o.status::TEXT);  -- STANDARDIZED

    -- 8. PROFIT
    v_gross_profit := v_gross_revenue - v_cogs_estimated;
    v_net_profit := v_gross_profit - v_variable_expenses - v_fixed_expenses_total;

    RETURN json_build_object(
        'gross_revenue', v_gross_revenue,
        'net_cash_flow', v_net_cash_flow,
        'total_orders', v_total_orders,
        'revenue_by_method', COALESCE(v_revenue_by_method, '[]'::jsonb),
        'expenses', json_build_object(
            'variable_total', v_variable_expenses,
            'marketing', v_marketing_loss,
            'internal', v_internal_loss,
            'operational_loss', v_operational_loss,
            'fixed_total', v_fixed_expenses_total,
            'cogs_estimated', v_cogs_estimated
        ),
        'profitability', json_build_object(
            'gross_profit', v_gross_profit,
            'net_profit', v_net_profit,
            'margin_percent', CASE WHEN v_gross_revenue > 0
                THEN ROUND((v_net_profit / v_gross_revenue) * 100, 2) ELSE 0 END
        )
    );
END;
$$;


-- ============================================================
-- 4. UPDATE get_top_products() - use canonical filter
-- ============================================================
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
SET search_path = public
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
      AND is_revenue_order(o.status)  -- STANDARDIZED (was: status != 'cancelled')
    GROUP BY p.id, p.name, c.name
    ORDER BY total_revenue DESC
    LIMIT p_limit;
END;
$$;


-- ============================================================
-- 5. RECREATE daily_sales_summary MV with revenue filter
-- ============================================================
-- Drop dependent function first
DROP FUNCTION IF EXISTS public.get_financial_metrics_paginated(UUID, DATE, DATE, INTEGER, INTEGER);

-- Drop old MV
DROP MATERIALIZED VIEW IF EXISTS public.daily_sales_summary;

-- Recreate with proper WHERE clause (exclude non-revenue orders)
CREATE MATERIALIZED VIEW public.daily_sales_summary AS
SELECT
    o.store_id,
    DATE(o.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires') AS sale_date,
    COUNT(DISTINCT o.id) AS total_orders,
    COUNT(DISTINCT o.client_id) AS unique_customers,
    SUM(o.total_amount) AS total_revenue,
    SUM(CASE WHEN o.is_paid THEN o.total_amount ELSE 0 END) AS paid_revenue,
    SUM(CASE WHEN NOT COALESCE(o.is_paid, false) THEN o.total_amount ELSE 0 END) AS unpaid_revenue,
    AVG(o.total_amount) AS average_order_value,

    -- Payment method breakdown
    jsonb_object_agg(
        COALESCE(o.payment_method, 'unknown'),
        o.total_amount
    ) FILTER (WHERE o.payment_method IS NOT NULL) AS payment_methods,

    -- Status breakdown (within revenue-eligible orders, using valid enum values)
    COUNT(*) FILTER (WHERE o.status = 'preparing') AS preparing_orders,
    COUNT(*) FILTER (WHERE o.status = 'ready') AS ready_orders,
    COUNT(*) FILTER (WHERE o.status = 'served') AS served_orders,
    COUNT(*) FILTER (WHERE o.status = 'paid') AS paid_orders

FROM orders o
WHERE is_revenue_order(o.status::TEXT)  -- STANDARDIZED: only revenue-eligible orders
GROUP BY o.store_id, DATE(o.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires');

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_sales_summary_unique
ON daily_sales_summary(store_id, sale_date);

CREATE INDEX IF NOT EXISTS idx_daily_sales_summary_date
ON daily_sales_summary(sale_date DESC);

GRANT SELECT ON daily_sales_summary TO authenticated;

-- Recreate paginated function
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
SET search_path = public
AS $$
DECLARE
    v_total_count BIGINT;
BEGIN
    SELECT COUNT(*)
    INTO v_total_count
    FROM daily_sales_summary
    WHERE store_id = p_store_id
      AND sale_date BETWEEN p_start_date AND p_end_date;

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

GRANT EXECUTE ON FUNCTION get_financial_metrics_paginated TO authenticated;

-- Refresh the new MV
REFRESH MATERIALIZED VIEW daily_sales_summary;


-- ============================================================
-- 6. WALLET BALANCE RECONCILIATION
-- ============================================================
-- Reconciles clients.wallet_balance with actual wallet_ledger sum.
-- Goes through the ledger (inserts corrective entry) to maintain audit trail.

CREATE OR REPLACE FUNCTION public.reconcile_wallet_balances(p_store_id UUID)
RETURNS TABLE (
    client_id UUID,
    client_name TEXT,
    cached_balance NUMERIC,
    ledger_balance NUMERIC,
    discrepancy NUMERIC,
    corrected BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_rec RECORD;
    v_corrected INTEGER := 0;
BEGIN
    FOR v_rec IN
        SELECT
            c.id AS client_id,
            c.name AS client_name,
            COALESCE(c.wallet_balance, 0) AS cached_balance,
            COALESCE(SUM(wl.amount), 0) AS ledger_sum
        FROM clients c
        LEFT JOIN wallet_ledger wl ON wl.wallet_id = c.id AND wl.store_id = c.store_id
        WHERE c.store_id = p_store_id
        GROUP BY c.id, c.name, c.wallet_balance
        HAVING ABS(COALESCE(c.wallet_balance, 0) - COALESCE(SUM(wl.amount), 0)) > 0.01
    LOOP
        -- Insert corrective ledger entry (goes through the trigger to update cached balance)
        INSERT INTO wallet_ledger (
            wallet_id, store_id, amount, balance_after,
            entry_type, description, source, idempotency_key
        ) VALUES (
            v_rec.client_id,
            p_store_id,
            v_rec.ledger_sum - v_rec.cached_balance,  -- corrective amount
            v_rec.ledger_sum,                          -- correct balance
            'reconciliation',
            format('Auto-reconciliation: cached=%s, ledger=%s', v_rec.cached_balance, v_rec.ledger_sum),
            'system',
            'reconcile_' || v_rec.client_id || '_' || NOW()::TEXT
        );

        v_corrected := v_corrected + 1;

        client_id := v_rec.client_id;
        client_name := v_rec.client_name;
        cached_balance := v_rec.cached_balance;
        ledger_balance := v_rec.ledger_sum;
        discrepancy := v_rec.ledger_sum - v_rec.cached_balance;
        corrected := true;
        RETURN NEXT;
    END LOOP;

    -- Also return clients with no discrepancy? No - only return discrepancies.
    RETURN;
END;
$$;

-- Allow 'reconciliation' as a valid source in wallet_ledger
-- Update the CHECK constraint to include it
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'wallet_ledger_source_check'
    ) THEN
        ALTER TABLE public.wallet_ledger DROP CONSTRAINT wallet_ledger_source_check;
    END IF;

    ALTER TABLE public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_source_check
    CHECK (source IN ('manual', 'system', 'admin_panel', 'mercadopago', 'refund', 'bonus', 'cash', 'transfer', 'gift', 'reconciliation', 'atomic_order'));
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not update wallet_ledger_source_check: %', SQLERRM;
END $$;

-- Allow 'reconciliation' as entry_type
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'wallet_ledger_entry_type_check'
    ) THEN
        ALTER TABLE public.wallet_ledger DROP CONSTRAINT wallet_ledger_entry_type_check;
    END IF;

    ALTER TABLE public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_entry_type_check
    CHECK (entry_type IN ('topup', 'payment', 'refund', 'adjustment', 'bonus', 'reconciliation'));
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not update wallet_ledger_entry_type_check: %', SQLERRM;
END $$;


-- ============================================================
-- 7. PER-BAR REVENUE RPC (Strategic)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_revenue_by_bar(
    p_store_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
    bar_id UUID,
    bar_name TEXT,
    zone_name TEXT,
    order_count BIGINT,
    total_revenue NUMERIC,
    avg_ticket NUMERIC,
    payment_breakdown JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        vn.id AS bar_id,
        vn.label AS bar_name,
        vz.name AS zone_name,
        COUNT(DISTINCT o.id)::BIGINT AS order_count,
        COALESCE(SUM(o.total_amount), 0) AS total_revenue,
        CASE WHEN COUNT(DISTINCT o.id) > 0
             THEN ROUND(SUM(o.total_amount) / COUNT(DISTINCT o.id), 2)
             ELSE 0 END AS avg_ticket,
        jsonb_object_agg(
            COALESCE(o.payment_method, 'unknown'),
            sub.method_total
        ) FILTER (WHERE o.payment_method IS NOT NULL) AS payment_breakdown
    FROM orders o
    JOIN venue_nodes vn ON vn.id = o.node_id
    LEFT JOIN venue_zones vz ON vz.id = vn.zone_id
    LEFT JOIN LATERAL (
        SELECT o2.payment_method, SUM(o2.total_amount) AS method_total
        FROM orders o2
        WHERE o2.node_id = vn.id
          AND o2.store_id = p_store_id
          AND o2.created_at BETWEEN p_start_date AND p_end_date
          AND is_revenue_order(o2.status::TEXT)
        GROUP BY o2.payment_method
    ) sub ON sub.payment_method = o.payment_method
    WHERE o.store_id = p_store_id
      AND o.created_at BETWEEN p_start_date AND p_end_date
      AND is_revenue_order(o.status)  -- STANDARDIZED
    GROUP BY vn.id, vn.label, vz.name
    ORDER BY total_revenue DESC;
END;
$$;


-- ============================================================
-- 8. SERVER-SIDE INSIGHTS RPC (replaces client-side aggregation)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_smart_insights(
    p_store_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_start_date TIMESTAMPTZ;
    v_peak_hours JSON;
    v_top_products JSON;
    v_total_revenue NUMERIC;
    v_total_orders INTEGER;
BEGIN
    v_start_date := NOW() - (p_days || ' days')::INTERVAL;

    -- Peak hours (order count + revenue by hour)
    SELECT json_agg(row_to_json(h)) INTO v_peak_hours
    FROM (
        SELECT
            EXTRACT(HOUR FROM o.created_at) AS hour,
            COUNT(*)::INTEGER AS count,
            COALESCE(SUM(o.total_amount), 0) AS revenue
        FROM orders o
        WHERE o.store_id = p_store_id
          AND o.created_at >= v_start_date
          AND is_revenue_order(o.status)  -- STANDARDIZED
        GROUP BY EXTRACT(HOUR FROM o.created_at)
        ORDER BY count DESC
    ) h;

    -- Top products
    SELECT json_agg(row_to_json(p)) INTO v_top_products
    FROM (
        SELECT
            oi.name,
            SUM(oi.quantity)::INTEGER AS quantity,
            COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.store_id = p_store_id
          AND o.created_at >= v_start_date
          AND is_revenue_order(o.status)  -- STANDARDIZED
        GROUP BY oi.name
        ORDER BY quantity DESC
        LIMIT 10
    ) p;

    -- Totals
    SELECT COALESCE(SUM(total_amount), 0), COUNT(*)
    INTO v_total_revenue, v_total_orders
    FROM orders
    WHERE store_id = p_store_id
      AND created_at >= v_start_date
      AND is_revenue_order(status::TEXT);  -- STANDARDIZED

    RETURN json_build_object(
        'peakHours', COALESCE(v_peak_hours, '[]'::json),
        'starProducts', COALESCE(v_top_products, '[]'::json),
        'totalRevenue', v_total_revenue,
        'totalOrders', v_total_orders,
        'averageTicket', CASE WHEN v_total_orders > 0
            THEN ROUND(v_total_revenue / v_total_orders, 2) ELSE 0 END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_smart_insights TO authenticated;
GRANT EXECUTE ON FUNCTION get_revenue_by_bar TO authenticated;
GRANT EXECUTE ON FUNCTION reconcile_wallet_balances TO authenticated;
