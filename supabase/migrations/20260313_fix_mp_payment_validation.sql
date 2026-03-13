-- ============================================================
-- FIX: Mercado Pago payments counted as revenue before confirmation
--
-- PROBLEM: close_cash_session() and financial functions counted
-- MP orders in revenue even when is_paid = false (payment never
-- confirmed by MP webhook). This allowed unconfirmed MP attempts
-- to inflate cash register totals.
--
-- SOLUTION: Add "AND is_paid = TRUE" filter to all revenue queries.
-- ============================================================


-- ============================================================
-- 1. FIX close_cash_session() — CRITICAL
-- by_payment_method and total_orders now require is_paid = TRUE
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_cash_session(p_session_id uuid, p_real_cash numeric, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_session_store_id UUID;
    v_expected_cash NUMERIC;
    v_difference NUMERIC;
    v_statistics JSONB;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'UNAUTHORIZED', 'message', 'Usuario no autenticado');
    END IF;

    SELECT store_id INTO v_store_id FROM profiles WHERE id = v_user_id;
    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'NO_STORE', 'message', 'Usuario no tiene tienda asignada');
    END IF;

    SELECT store_id, expected_cash INTO v_session_store_id, v_expected_cash
    FROM cash_sessions WHERE id = p_session_id;

    IF v_session_store_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'SESSION_NOT_FOUND', 'message', 'Sesión de caja no encontrada');
    END IF;

    IF v_session_store_id != v_store_id THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'PERMISSION_DENIED', 'message', 'No tienes permiso para esta operación');
    END IF;

    v_difference := p_real_cash - COALESCE(v_expected_cash, 0);

    UPDATE cash_sessions
    SET
        status = 'closed',
        real_cash = p_real_cash,
        difference = v_difference,
        closed_at = NOW(),
        closed_by = v_user_id,
        closing_notes = p_notes
    WHERE id = p_session_id;

    -- FIX: Added is_paid = TRUE to both total_orders and by_payment_method
    SELECT jsonb_build_object(
        'total_orders', COALESCE(COUNT(*) FILTER (WHERE o.status NOT IN ('cancelled', 'refunded') AND o.is_paid = TRUE), 0),
        'cancelled_orders', COALESCE(COUNT(*) FILTER (WHERE o.status IN ('cancelled', 'refunded')), 0),
        'start_amount', cs.start_amount,
        'expected_cash', COALESCE(v_expected_cash, 0),
        'real_cash', p_real_cash,
        'difference', v_difference,
        'by_payment_method', COALESCE(
            (SELECT jsonb_object_agg(pm, pm_total) FROM (
                SELECT COALESCE(o2.payment_method, 'cash') as pm, SUM(o2.total_amount) as pm_total
                FROM orders o2
                WHERE o2.cash_session_id = p_session_id
                  AND o2.status NOT IN ('cancelled', 'refunded', 'draft')
                  AND o2.is_paid = TRUE
                GROUP BY COALESCE(o2.payment_method, 'cash')
            ) sub),
            '{}'::jsonb
        ),
        'withdrawals', COALESCE((SELECT SUM(amount) FROM cash_movements WHERE cash_session_id = p_session_id AND movement_type = 'withdrawal'), 0),
        'adjustments', COALESCE((SELECT SUM(amount) FROM cash_movements WHERE cash_session_id = p_session_id AND movement_type = 'adjustment'), 0),
        'cash_topups', COALESCE((SELECT SUM(amount) FROM cash_movements WHERE cash_session_id = p_session_id AND movement_type = 'topup'), 0)
    ) INTO v_statistics
    FROM cash_sessions cs
    LEFT JOIN orders o ON o.cash_session_id = cs.id
    WHERE cs.id = p_session_id
    GROUP BY cs.start_amount;

    RETURN jsonb_build_object(
        'success', TRUE,
        'difference', v_difference,
        'message', 'Sesión de caja cerrada correctamente',
        'statistics', v_statistics
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$function$;


-- ============================================================
-- 2. FIX get_financial_chart_data() — defense-in-depth
-- Added is_paid = TRUE alongside is_revenue_order()
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
          AND is_revenue_order(status::TEXT)
          AND is_paid = TRUE
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
-- 3. FIX get_financial_metrics(3-param) — defense-in-depth
-- Added is_paid = TRUE to all revenue/COGS queries
-- ============================================================
DROP FUNCTION IF EXISTS public.get_financial_metrics(TIMESTAMPTZ, TIMESTAMPTZ, UUID);

CREATE OR REPLACE FUNCTION public.get_financial_metrics(p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ, p_store_id UUID)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_gross_revenue numeric := 0;
    v_net_cash_flow numeric := 0;
    v_total_orders integer := 0;
    v_revenue_by_method jsonb;

    v_variable_expenses numeric := 0;
    v_marketing_loss numeric := 0;
    v_internal_loss numeric := 0;
    v_operational_loss numeric := 0;

    v_fixed_expenses_total numeric := 0;
    v_cogs_estimated numeric := 0;
    v_loyalty_cost numeric := 0;

    v_topups_total numeric := 0;
    v_wallet_usage numeric := 0;
BEGIN
    -- 1. REVENUE & ORDERS
    SELECT
        COALESCE(SUM(total_amount), 0),
        COUNT(*)
    INTO v_gross_revenue, v_total_orders
    FROM public.orders
    WHERE store_id = p_store_id
    AND created_at BETWEEN p_start_date AND p_end_date
    AND status::text IN ('completed', 'confirmed', 'ready', 'delivered', 'served', 'paid')
    AND is_paid = TRUE;

    -- 2. REVENUE BY PAYMENT METHOD
    SELECT json_agg(json_build_object('method', method, 'total', total))
    INTO v_revenue_by_method
    FROM (
        SELECT payment_method as method, SUM(total_amount) as total
        FROM public.orders
        WHERE store_id = p_store_id
        AND created_at BETWEEN p_start_date AND p_end_date
        AND status::text IN ('completed', 'confirmed', 'ready', 'delivered', 'served', 'paid')
        AND is_paid = TRUE
        GROUP BY payment_method
    ) t;

    -- 3. WALLET TOPUPS
    SELECT COALESCE(SUM(amount), 0)
    INTO v_topups_total
    FROM public.wallet_transactions
    WHERE amount > 0
    AND created_at BETWEEN p_start_date AND p_end_date;

    -- 4. CASH FLOW
    DECLARE
        v_sales_non_wallet numeric := 0;
    BEGIN
        SELECT COALESCE(SUM(total_amount), 0)
        INTO v_sales_non_wallet
        FROM public.orders
        WHERE store_id = p_store_id
        AND created_at BETWEEN p_start_date AND p_end_date
        AND status::text IN ('completed', 'confirmed', 'ready', 'delivered', 'served', 'paid')
        AND is_paid = TRUE
        AND payment_method != 'wallet';

        v_net_cash_flow := v_sales_non_wallet + v_topups_total;
    END;

    -- 5. VARIABLE EXPENSES (INVENTORY LOSSES)
    SELECT COALESCE(SUM(ABS(quantity_delta) * COALESCE(unit_cost, (SELECT cost FROM public.inventory_items WHERE id = item_id), 0)), 0)
    INTO v_marketing_loss
    FROM public.inventory_audit_logs
    WHERE store_id = p_store_id
    AND created_at BETWEEN p_start_date AND p_end_date
    AND action_type = 'gift';

    SELECT COALESCE(SUM(ABS(quantity_delta) * COALESCE(unit_cost, (SELECT cost FROM public.inventory_items WHERE id = item_id), 0)), 0)
    INTO v_internal_loss
    FROM public.inventory_audit_logs
    WHERE store_id = p_store_id
    AND created_at BETWEEN p_start_date AND p_end_date
    AND action_type = 'internal_use';

    SELECT COALESCE(SUM(ABS(quantity_delta) * COALESCE(unit_cost, (SELECT cost FROM public.inventory_items WHERE id = item_id), 0)), 0)
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

    -- 7. COGS
    SELECT COALESCE(SUM(oi.quantity * ii.cost), 0)
    INTO v_cogs_estimated
    FROM public.order_items oi
    JOIN public.inventory_items ii ON oi.product_id = ii.id
    JOIN public.orders o ON oi.order_id = o.id
    WHERE o.store_id = p_store_id
    AND o.created_at BETWEEN p_start_date AND p_end_date
    AND o.status::text IN ('completed', 'confirmed', 'ready', 'delivered', 'served', 'paid')
    AND o.is_paid = TRUE;

    -- 8. LOYALTY COST
    SELECT COALESCE(SUM(monetary_cost), 0)
    INTO v_loyalty_cost
    FROM public.loyalty_transactions
    WHERE store_id = p_store_id
    AND created_at BETWEEN p_start_date AND p_end_date
    AND type = 'burn'
    AND is_rolled_back = false;

    -- 9. NET PROFIT
    DECLARE
        v_gross_profit numeric;
        v_net_profit numeric;
    BEGIN
        v_gross_profit := v_gross_revenue - v_cogs_estimated;
        v_net_profit := v_gross_profit - v_variable_expenses - v_fixed_expenses_total - v_loyalty_cost;

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
                'cogs_estimated', v_cogs_estimated,
                'loyalty_cost', v_loyalty_cost
            ),
            'profitability', json_build_object(
                'gross_profit', v_gross_profit,
                'net_profit', v_net_profit,
                'margin_percent', CASE WHEN v_gross_revenue > 0 THEN ROUND((v_net_profit / v_gross_revenue) * 100, 2) ELSE 0 END
            )
        );
    END;
END;
$function$;
