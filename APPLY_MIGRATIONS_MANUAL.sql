-- =============================================
-- SCRIPT DE DEPLOYMENT MANUAL - SUPABASE
-- Fecha: 2026-02-13
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================

-- PARTE 1: MONITORING VIEWS
-- =============================================

-- 1. WALLET INTEGRITY VIEW
CREATE OR REPLACE VIEW monitoring_wallet_integrity AS
SELECT
    c.id as client_id,
    c.email,
    c.wallet_balance as cached_balance,
    COALESCE(SUM(wl.amount), 0) AS ledger_sum,
    c.wallet_balance - COALESCE(SUM(wl.amount), 0) as discrepancy,
    c.store_id,
    s.name as store_name
FROM clients c
LEFT JOIN wallet_ledger wl ON wl.wallet_id = c.id
JOIN stores s ON c.store_id = s.id
GROUP BY c.id, c.email, c.wallet_balance, c.store_id, s.name
HAVING ABS(c.wallet_balance - COALESCE(SUM(wl.amount), 0)) > 0.01
ORDER BY ABS(c.wallet_balance - COALESCE(SUM(wl.amount), 0)) DESC;

-- 2. CASH SESSION RECONCILIATION VIEW
CREATE OR REPLACE VIEW monitoring_cash_session_reconciliation AS
SELECT
    cs.id as session_id,
    p.full_name as staff_name,
    s.name as store_name,
    cs.start_amount,
    cs.expected_cash,
    cs.real_cash,
    cs.difference,
    cs.status,
    (cs.real_cash - cs.expected_cash) as calculated_diff,
    ABS(cs.difference - (cs.real_cash - cs.expected_cash)) as formula_error,
    CASE
        WHEN cs.status = 'open' THEN 'Sesión abierta'
        WHEN ABS(cs.difference) = 0 THEN 'Cuadrada perfecta'
        WHEN ABS(cs.difference) <= 10 THEN 'Diferencia menor'
        WHEN ABS(cs.difference) <= 100 THEN 'Diferencia notable'
        ELSE 'CRÍTICO: Diferencia > $100'
    END as audit_status,
    cs.opened_at,
    cs.closed_at
FROM cash_sessions cs
JOIN profiles p ON cs.staff_id = p.id
JOIN stores s ON cs.store_id = s.id
ORDER BY cs.opened_at DESC;

-- 3. STOCK ROLLBACK AUDIT
CREATE OR REPLACE VIEW monitoring_stock_rollback_audit AS
SELECT
    o.id as order_id,
    o.order_number,
    o.status,
    o.stock_deducted,
    s.name as store_name,
    (SELECT COALESCE(SUM(sm.qty_delta), 0)
     FROM stock_movements sm
     WHERE sm.order_id = o.id) as net_delta,
    CASE
        WHEN o.status = 'cancelled' AND o.stock_deducted = TRUE AND ABS((
            SELECT COALESCE(SUM(sm.qty_delta), 0)
            FROM stock_movements sm
            WHERE sm.order_id = o.id
        )) > 0.01 THEN 'ROLLBACK INCOMPLETO'
        WHEN o.status = 'cancelled' AND o.stock_deducted = TRUE THEN 'Rollback correcto'
        ELSE 'Orden activa'
    END as audit_status,
    o.updated_at
FROM orders o
JOIN stores s ON o.store_id = s.id
WHERE o.status = 'cancelled'
  AND o.created_at > NOW() - INTERVAL '30 days'
ORDER BY o.updated_at DESC;

-- 4. ACTIVE ORDERS INTEGRITY
CREATE OR REPLACE VIEW monitoring_active_orders_integrity AS
WITH orphaned_orders AS (
    SELECT
        vn.id AS node_id,
        vn.label,
        unnest(vn.active_order_ids) AS order_id
    FROM venue_nodes vn
    WHERE vn.active_order_ids IS NOT NULL
      AND array_length(vn.active_order_ids, 1) > 0
    EXCEPT
    SELECT
        vn.id,
        vn.label,
        o.id
    FROM venue_nodes vn
    JOIN orders o ON o.node_id = vn.id
    WHERE o.status IN ('pending','paid','preparing','ready','bill_requested')
)
SELECT
    'orphaned' as issue_type,
    node_id,
    label,
    order_id::text as order_ref,
    'Order en array pero no existe o está cerrada' as description
FROM orphaned_orders;

-- 5. IDEMPOTENCY VIOLATIONS
CREATE OR REPLACE VIEW monitoring_idempotency_violations AS
WITH stock_duplicates AS (
    SELECT
        'stock_movements' as table_name,
        idempotency_key,
        COUNT(*) as duplicate_count,
        ARRAY_AGG(id ORDER BY created_at) as record_ids,
        MIN(created_at) as first_created,
        MAX(created_at) as last_created
    FROM stock_movements
    WHERE idempotency_key IS NOT NULL
    GROUP BY idempotency_key
    HAVING COUNT(*) > 1
)
SELECT * FROM stock_duplicates;

-- 6. GRANT PERMISSIONS
GRANT SELECT ON monitoring_wallet_integrity TO authenticated;
GRANT SELECT ON monitoring_cash_session_reconciliation TO authenticated;
GRANT SELECT ON monitoring_stock_rollback_audit TO authenticated;
GRANT SELECT ON monitoring_active_orders_integrity TO authenticated;
GRANT SELECT ON monitoring_idempotency_violations TO authenticated;

-- =============================================
-- PARTE 2: RETRY METRICS TABLE
-- =============================================

-- 1. CREATE TABLE
CREATE TABLE IF NOT EXISTS retry_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    rpc_name TEXT NOT NULL,
    attempts INT NOT NULL CHECK (attempts > 0 AND attempts <= 10),
    final_status TEXT NOT NULL CHECK (final_status IN ('success', 'failed')),
    duration_ms INT NOT NULL CHECK (duration_ms >= 0),
    error_code TEXT,
    client_info JSONB DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. INDEXES
CREATE INDEX IF NOT EXISTS idx_retry_metrics_created ON retry_metrics(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retry_metrics_store ON retry_metrics(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retry_metrics_rpc ON retry_metrics(rpc_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retry_metrics_status ON retry_metrics(final_status, created_at DESC);

-- 3. RLS POLICIES
ALTER TABLE retry_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can insert retry metrics" ON retry_metrics;
CREATE POLICY "Staff can insert retry metrics"
ON retry_metrics FOR INSERT
WITH CHECK (
    store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "Staff can read own store metrics" ON retry_metrics;
CREATE POLICY "Staff can read own store metrics"
ON retry_metrics FOR SELECT
USING (
    store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
    OR
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('superadmin', 'owner')
    )
);

-- 4. RPC PARA INSERTAR MÉTRICAS
CREATE OR REPLACE FUNCTION log_retry_metric(
    p_rpc_name TEXT,
    p_attempts INT,
    p_final_status TEXT,
    p_duration_ms INT,
    p_error_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_metric_id UUID;
    v_store_id UUID;
    v_user_id UUID;
BEGIN
    SELECT id, store_id INTO v_user_id, v_store_id
    FROM profiles
    WHERE id = auth.uid();

    INSERT INTO retry_metrics (
        store_id,
        user_id,
        rpc_name,
        attempts,
        final_status,
        duration_ms,
        error_code
    ) VALUES (
        v_store_id,
        v_user_id,
        p_rpc_name,
        p_attempts,
        p_final_status,
        p_duration_ms,
        p_error_code
    ) RETURNING id INTO v_metric_id;

    RETURN v_metric_id;
END;
$$;

GRANT EXECUTE ON FUNCTION log_retry_metric TO authenticated;

-- 5. ANALYTICS VIEWS

-- Daily Success Rate
CREATE OR REPLACE VIEW analytics_retry_success_rate_daily AS
SELECT
    DATE(created_at) as date,
    store_id,
    s.name as store_name,
    COUNT(*) as total_retries,
    SUM(CASE WHEN final_status = 'success' THEN 1 ELSE 0 END) as successful,
    SUM(CASE WHEN final_status = 'failed' THEN 1 ELSE 0 END) as failed,
    ROUND(100.0 * SUM(CASE WHEN final_status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
    ROUND(AVG(duration_ms), 2) as avg_duration_ms,
    ROUND(AVG(attempts), 2) as avg_attempts
FROM retry_metrics rm
JOIN stores s ON rm.store_id = s.id
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at), store_id, s.name
ORDER BY date DESC, store_id;

GRANT SELECT ON analytics_retry_success_rate_daily TO authenticated;

-- RPC Performance
CREATE OR REPLACE VIEW analytics_retry_by_rpc AS
SELECT
    rpc_name,
    COUNT(*) as total_calls,
    SUM(CASE WHEN final_status = 'success' THEN 1 ELSE 0 END) as successful,
    ROUND(100.0 * SUM(CASE WHEN final_status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
    ROUND(AVG(duration_ms), 2) as avg_duration_ms,
    ROUND(AVG(attempts), 2) as avg_attempts,
    MAX(attempts) as max_attempts
FROM retry_metrics rm
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY rpc_name
ORDER BY total_calls DESC;

GRANT SELECT ON analytics_retry_by_rpc TO authenticated;

-- Error Analysis
CREATE OR REPLACE VIEW analytics_retry_errors AS
SELECT
    error_code,
    COUNT(*) as occurrence_count,
    ARRAY_AGG(DISTINCT rpc_name ORDER BY rpc_name) as affected_rpcs,
    MIN(created_at) as first_seen,
    MAX(created_at) as last_seen,
    ROUND(AVG(attempts), 2) as avg_attempts_before_fail
FROM retry_metrics rm
WHERE final_status = 'failed'
  AND error_code IS NOT NULL
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY error_code
ORDER BY occurrence_count DESC;

GRANT SELECT ON analytics_retry_errors TO authenticated;

-- 6. CLEANUP FUNCTION
CREATE OR REPLACE FUNCTION cleanup_old_retry_metrics(
    p_retention_days INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deleted_count INT;
BEGIN
    DELETE FROM retry_metrics
    WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', TRUE,
        'deleted_count', v_deleted_count,
        'retention_days', p_retention_days
    );
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_old_retry_metrics TO authenticated;

-- =============================================
-- VERIFICACIÓN POST-APLICACIÓN
-- =============================================

-- Verificar que las views se crearon correctamente
SELECT 'monitoring_wallet_integrity' as view_name, COUNT(*) as row_count FROM monitoring_wallet_integrity
UNION ALL
SELECT 'monitoring_cash_session_reconciliation', COUNT(*) FROM monitoring_cash_session_reconciliation
UNION ALL
SELECT 'monitoring_stock_rollback_audit', COUNT(*) FROM monitoring_stock_rollback_audit
UNION ALL
SELECT 'monitoring_active_orders_integrity', COUNT(*) FROM monitoring_active_orders_integrity
UNION ALL
SELECT 'monitoring_idempotency_violations', COUNT(*) FROM monitoring_idempotency_violations;

-- Verificar tabla retry_metrics
SELECT
    'retry_metrics table exists' as check_name,
    CASE WHEN COUNT(*) >= 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM retry_metrics;

-- Verificar función log_retry_metric
SELECT
    'log_retry_metric function exists' as check_name,
    CASE WHEN COUNT(*) > 0 THEN 'PASS' ELSE 'FAIL' END as status
FROM pg_proc
WHERE proname = 'log_retry_metric';

-- =============================================
-- FIN DEL SCRIPT
-- Expected: Todas las verificaciones en PASS
-- =============================================
