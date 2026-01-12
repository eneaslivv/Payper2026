-- =============================================
-- FINANCE v2 IMPROVEMENTS
-- Mejora endpoints de gráficos y agrega Top Products
-- =============================================

-- 1. MEJORAR CHART DATA (Add 'name' field for Recharts)
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
        'name', to_char(ts.bucket, 'HH24:MI'), -- Recharts XAxis key
        'time', ts.bucket,
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
    )) INTO v_result
    FROM time_series ts
    LEFT JOIN order_data od ON ts.bucket = od.bucket
    LEFT JOIN ledger_data ld ON ts.bucket = ld.bucket
    ORDER BY ts.bucket;

    RETURN v_result;
END;
$$;

-- 2. TOP PRODUCTS ENDPOINT
-- Devuelve los 5 productos más vendidos en el rango
CREATE OR REPLACE FUNCTION public.get_top_products(
    p_store_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_agg(sub) INTO v_result
    FROM (
        SELECT 
            p.name,
            SUM(oi.quantity) as quantity,
            SUM(oi.quantity * oi.unit_price) as total_sales
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        JOIN orders o ON oi.order_id = o.id
        WHERE o.store_id = p_store_id
          AND o.created_at BETWEEN p_start_date AND p_end_date
          AND o.status NOT IN ('cancelled', 'rejected')
        GROUP BY p.name
        ORDER BY total_sales DESC
        LIMIT 5
    ) sub;
    
    RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;
