-- =============================================
-- RETRY METRICS TABLE - ANALYTICS BACKEND
-- Fecha: 2026-02-13
-- Propósito: Capturar telemetría de retry logic para medir success rates reales
-- =============================================

-- 1. CREATE TABLE
CREATE TABLE IF NOT EXISTS retry_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Metadata
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

    -- Retry details
    rpc_name TEXT NOT NULL,
    attempts INT NOT NULL CHECK (attempts > 0 AND attempts <= 10),
    final_status TEXT NOT NULL CHECK (final_status IN ('success', 'failed')),
    duration_ms INT NOT NULL CHECK (duration_ms >= 0),
    error_code TEXT,  -- NULL si success, código de error si failed

    -- Context
    client_info JSONB DEFAULT '{}'::JSONB,  -- Browser, OS, etc. (opcional)

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. INDEXES FOR PERFORMANCE
CREATE INDEX idx_retry_metrics_created ON retry_metrics(created_at DESC);
CREATE INDEX idx_retry_metrics_store ON retry_metrics(store_id, created_at DESC);
CREATE INDEX idx_retry_metrics_rpc ON retry_metrics(rpc_name, created_at DESC);
CREATE INDEX idx_retry_metrics_status ON retry_metrics(final_status, created_at DESC);

-- 3. RLS POLICIES
ALTER TABLE retry_metrics ENABLE ROW LEVEL SECURITY;

-- Staff pueden insertar métricas de su store
CREATE POLICY "Staff can insert retry metrics"
ON retry_metrics FOR INSERT
WITH CHECK (
    store_id = (SELECT store_id FROM profiles WHERE id = auth.uid())
);

-- Staff pueden leer métricas de su store
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

-- Superadmin puede leer todo
CREATE POLICY "Superadmin can read all metrics"
ON retry_metrics FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role = 'superadmin'
    )
);

-- 4. RPC PARA INSERTAR MÉTRICAS (desde frontend)
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
    -- Get store_id from current user
    SELECT id, store_id INTO v_user_id, v_store_id
    FROM profiles
    WHERE id = auth.uid();

    -- Insert metric
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

COMMENT ON FUNCTION log_retry_metric IS
'Inserta métrica de retry desde frontend.
Uso: SELECT log_retry_metric(''transfer_stock'', 2, ''success'', 450, NULL);';

-- 5. ANALYTICS VIEWS

-- View: Daily Success Rate
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

COMMENT ON VIEW analytics_retry_success_rate_daily IS
'Success rate diario de retries por store.
ALERTA si success_rate < 95% por más de 1 día.
Dashboard recomendado: gráfico de línea por fecha.';

-- View: RPC Performance
CREATE OR REPLACE VIEW analytics_retry_by_rpc AS
SELECT
    rpc_name,
    COUNT(*) as total_calls,
    SUM(CASE WHEN final_status = 'success' THEN 1 ELSE 0 END) as successful,
    ROUND(100.0 * SUM(CASE WHEN final_status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
    ROUND(AVG(duration_ms), 2) as avg_duration_ms,
    ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY duration_ms), 2) as p50_duration_ms,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 2) as p95_duration_ms,
    ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms), 2) as p99_duration_ms,
    ROUND(AVG(attempts), 2) as avg_attempts,
    MAX(attempts) as max_attempts,
    -- Top error codes
    (
        SELECT json_agg(
            json_build_object(
                'error_code', error_code,
                'count', count
            )
            ORDER BY count DESC
        )
        FROM (
            SELECT error_code, COUNT(*) as count
            FROM retry_metrics rm2
            WHERE rm2.rpc_name = rm.rpc_name
              AND rm2.final_status = 'failed'
              AND rm2.created_at > NOW() - INTERVAL '7 days'
            GROUP BY error_code
            LIMIT 5
        ) errors
    ) as top_errors
FROM retry_metrics rm
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY rpc_name
ORDER BY total_calls DESC;

GRANT SELECT ON analytics_retry_by_rpc TO authenticated;

COMMENT ON VIEW analytics_retry_by_rpc IS
'Performance por RPC en últimos 7 días.
Identifica RPCs problemáticos (success_rate bajo, p95 alto).
Dashboard recomendado: tabla ordenada por total_calls.';

-- View: Error Analysis
CREATE OR REPLACE VIEW analytics_retry_errors AS
SELECT
    error_code,
    COUNT(*) as occurrence_count,
    ARRAY_AGG(DISTINCT rpc_name ORDER BY rpc_name) as affected_rpcs,
    MIN(created_at) as first_seen,
    MAX(created_at) as last_seen,
    ROUND(AVG(attempts), 2) as avg_attempts_before_fail,
    -- Sample recent errors
    (
        SELECT json_agg(
            json_build_object(
                'rpc_name', rpc_name,
                'attempts', attempts,
                'duration_ms', duration_ms,
                'created_at', created_at
            )
            ORDER BY created_at DESC
        )
        FROM (
            SELECT rpc_name, attempts, duration_ms, created_at
            FROM retry_metrics rm2
            WHERE rm2.error_code = rm.error_code
              AND rm2.final_status = 'failed'
            ORDER BY created_at DESC
            LIMIT 5
        ) samples
    ) as recent_samples
FROM retry_metrics rm
WHERE final_status = 'failed'
  AND error_code IS NOT NULL
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY error_code
ORDER BY occurrence_count DESC;

GRANT SELECT ON analytics_retry_errors TO authenticated;

COMMENT ON VIEW analytics_retry_errors IS
'Análisis de errores frecuentes en últimos 7 días.
ALERTA si LOCK_TIMEOUT aparece > 100 veces/día.
Dashboard recomendado: tabla con drill-down a recent_samples.';

-- 6. HELPER FUNCTION: Cleanup Old Metrics
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

COMMENT ON FUNCTION cleanup_old_retry_metrics IS
'Limpia métricas antiguas (default: > 90 días).
Ejecutar mensualmente vía cron job.
Uso: SELECT cleanup_old_retry_metrics(90);';

-- 7. SAMPLE QUERY PARA DASHBOARD
COMMENT ON TABLE retry_metrics IS
'Almacena telemetría de retry logic para analytics.

QUERIES RECOMENDADOS:

-- Success rate últimas 24h:
SELECT
    ROUND(100.0 * SUM(CASE WHEN final_status = ''success'' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM retry_metrics
WHERE created_at > NOW() - INTERVAL ''24 hours'';

-- Top RPCs más lentos (p95):
SELECT
    rpc_name,
    ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms), 2) as p95_ms
FROM retry_metrics
WHERE created_at > NOW() - INTERVAL ''7 days''
GROUP BY rpc_name
ORDER BY p95_ms DESC
LIMIT 10;

-- Alerts: Success rate < 95%
SELECT * FROM analytics_retry_success_rate_daily
WHERE success_rate < 95
ORDER BY date DESC;
';
