-- =============================================
-- FINANCIAL CHARTS & BALANCE MANAGEMENT
-- =============================================

-- 1. ADMIN ADD BALANCE V2
-- Ensures explicit payment method tracking in wallet_ledger
-- =============================================
CREATE OR REPLACE FUNCTION public.admin_add_balance_v2(
    p_user_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT, -- 'cash', 'transfer', 'card'
    p_description TEXT DEFAULT 'Carga manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_new_balance NUMERIC;
    v_store_id UUID;
BEGIN
    -- Get client & store
    SELECT * INTO v_client FROM public.clients WHERE id = p_user_id;
    IF v_client IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
    END IF;
    v_store_id := v_client.store_id;

    -- Update Client Balance
    UPDATE public.clients 
    SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount 
    WHERE id = p_user_id
    RETURNING wallet_balance INTO v_new_balance;

    -- Insert VALID Ledger Entry
    INSERT INTO public.wallet_ledger (
        wallet_id,
        store_id,
        amount,
        entry_type, -- 'topup'
        payment_method, -- 'cash', 'transfer'
        description,
        source
    ) VALUES (
        p_user_id,
        v_store_id,
        p_amount,
        'topup',
        p_payment_method,
        p_description,
        'admin_panel'
    );

    RETURN jsonb_build_object(
        'success', true, 
        'new_balance', v_new_balance,
        'message', 'Saldo agregado correctamente'
    );
END;
$$;


-- 2. GET FINANCIAL CHART DATA
-- Aggregates Orders & Wallet Topups for Chart
-- =============================================
CREATE OR REPLACE FUNCTION public.get_financial_chart_data(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ,
    p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    WITH time_series AS (
        -- Generate hourly buckets for the range
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
            SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END) as cash_sales,
            SUM(CASE WHEN payment_method = 'wallet' THEN total_amount ELSE 0 END) as wallet_sales,
            SUM(CASE WHEN payment_method IS DISTINCT FROM 'mercadopago' AND payment_method IS DISTINCT FROM 'cash' AND payment_method IS DISTINCT FROM 'wallet' THEN total_amount ELSE 0 END) as other_sales
        FROM orders
        WHERE store_id = p_store_id
          AND created_at BETWEEN p_start_date AND p_end_date
          AND status NOT IN ('cancelled', 'rejected') 
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
        'wallet_sales', COALESCE(od.wallet_sales, 0), -- Internal money flow
        'cash_topups', COALESCE(ld.cash_topups, 0), -- Real money in
        'transfer_topups', COALESCE(ld.transfer_topups, 0), -- Real money in
        'total_revenue', (
            COALESCE(od.mp_sales, 0) + 
            COALESCE(od.cash_sales, 0) + 
            -- Wallet sales aren't "new revenue" if we count topups, but for "sales" chart we might want them. 
            -- However, for Cash Flow, we want Topups. 
            COALESCE(ld.cash_topups, 0) + 
            COALESCE(ld.transfer_topups, 0)
        )
    )) INTO v_result
    FROM time_series ts
    LEFT JOIN order_data od ON ts.bucket = od.bucket
    LEFT JOIN ledger_data ld ON ts.bucket = ld.bucket
    ORDER BY ts.bucket;

    RETURN v_result;
END;
$$;
