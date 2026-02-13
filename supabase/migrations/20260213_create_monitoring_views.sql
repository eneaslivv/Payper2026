-- =============================================
-- MONITORING VIEWS - PRODUCTION READINESS
-- Fecha: 2026-02-13
-- Propósito: Crear views de monitoreo para queries diarias
-- =============================================

-- 1. WALLET INTEGRITY VIEW (para cuando se implemente ledger)
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

COMMENT ON VIEW monitoring_wallet_integrity IS
'Detecta discrepancias entre wallet_balance (cached) y suma de wallet_ledger.
ALERTA si retorna rows: investigar inmediatamente.
Expected: 0 rows siempre (después de implementar ledger).
Actualmente: discrepancias esperadas (ledger no implementado).';

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
    -- Verificar fórmula
    (cs.real_cash - cs.expected_cash) as calculated_diff,
    ABS(cs.difference - (cs.real_cash - cs.expected_cash)) as formula_error,
    -- Audit status
    CASE
        WHEN cs.status = 'open' THEN '🟢 Sesión abierta'
        WHEN ABS(cs.difference) = 0 THEN '✅ Cuadrada perfecta'
        WHEN ABS(cs.difference) <= 10 THEN '⚠️ Diferencia menor ($' || ABS(cs.difference) || ')'
        WHEN ABS(cs.difference) <= 100 THEN '🟠 Diferencia notable ($' || ABS(cs.difference) || ')'
        ELSE '❌ CRÍTICO: Diferencia > $100 ($' || ABS(cs.difference) || ')'
    END as audit_status,
    cs.opened_at,
    cs.closed_at,
    -- Ventas cash del período
    (
        SELECT COUNT(*)
        FROM orders o
        WHERE o.payment_method = 'cash'
          AND o.is_paid = TRUE
          AND o.created_at BETWEEN cs.opened_at AND COALESCE(cs.closed_at, NOW())
          AND o.store_id = cs.store_id
    ) as cash_orders_count,
    (
        SELECT COALESCE(SUM(o.total_amount), 0)
        FROM orders o
        WHERE o.payment_method = 'cash'
          AND o.is_paid = TRUE
          AND o.created_at BETWEEN cs.opened_at AND COALESCE(cs.closed_at, NOW())
          AND o.store_id = cs.store_id
    ) as cash_sales_total
FROM cash_sessions cs
JOIN profiles p ON cs.staff_id = p.id
JOIN stores s ON cs.store_id = s.id
ORDER BY cs.opened_at DESC;

COMMENT ON VIEW monitoring_cash_session_reconciliation IS
'Monitorea integridad de sesiones de caja.
ALERTA si audit_status contiene ❌ (diferencia > $100).
Verifica que formula_error = 0 (expected_cash calculado correcto).
Query diaria recomendada.';

-- 3. STOCK ROLLBACK AUDIT (verificar cancelaciones)
CREATE OR REPLACE VIEW monitoring_stock_rollback_audit AS
SELECT
    o.id as order_id,
    o.order_number,
    o.status,
    o.stock_deducted,
    o.stock_rolled_back,
    s.name as store_name,
    -- Movimientos de stock para esta orden
    (
        SELECT COUNT(*)
        FROM stock_movements sm
        WHERE sm.order_id = o.id
          AND sm.qty_delta < 0
          AND sm.reason IN ('recipe_ingredient', 'direct_sale', 'order_fulfillment')
    ) as deduction_movements,
    (
        SELECT COUNT(*)
        FROM stock_movements sm
        WHERE sm.order_id = o.id
          AND sm.qty_delta > 0
          AND sm.reason = 'order_cancelled_restock'
    ) as rollback_movements,
    -- Balance neto (debe ser 0 si está cancelada)
    (
        SELECT COALESCE(SUM(sm.qty_delta), 0)
        FROM stock_movements sm
        WHERE sm.order_id = o.id
    ) as net_delta,
    -- Audit status
    CASE
        WHEN o.status = 'cancelled' AND o.stock_deducted = TRUE AND ABS((
            SELECT COALESCE(SUM(sm.qty_delta), 0)
            FROM stock_movements sm
            WHERE sm.order_id = o.id
        )) > 0.01 THEN '❌ ROLLBACK INCOMPLETO'
        WHEN o.status = 'cancelled' AND o.stock_deducted = TRUE THEN '✅ Rollback correcto'
        WHEN o.status = 'cancelled' AND o.stock_deducted = FALSE THEN '🟢 No requiere rollback'
        ELSE '🟢 Orden activa'
    END as audit_status,
    o.cancelled_at,
    o.updated_at
FROM orders o
JOIN stores s ON o.store_id = s.id
WHERE o.status = 'cancelled'
  AND o.created_at > NOW() - INTERVAL '30 days'
ORDER BY o.cancelled_at DESC NULLS LAST;

COMMENT ON VIEW monitoring_stock_rollback_audit IS
'Verifica que órdenes canceladas tengan rollback correcto de stock.
ALERTA si audit_status = ❌ ROLLBACK INCOMPLETO.
Expected: todos con ✅ o 🟢.
Query semanal recomendada.';

-- 4. ACTIVE ORDERS INTEGRITY (multi-order por mesa)
CREATE OR REPLACE VIEW monitoring_active_orders_integrity AS
WITH orphaned_orders AS (
    -- Órdenes en active_order_ids pero no existen o están cerradas
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
),
missing_orders AS (
    -- Órdenes activas que NO están en active_order_ids
    SELECT
        o.id as order_id,
        o.order_number,
        o.status,
        vn.id as node_id,
        vn.label
    FROM orders o
    JOIN venue_nodes vn ON o.node_id = vn.id
    WHERE o.status IN ('pending','paid','preparing','ready','bill_requested')
      AND NOT (o.id = ANY(COALESCE(vn.active_order_ids, '{}')))
)
SELECT
    'orphaned' as issue_type,
    node_id,
    label,
    order_id::text as order_ref,
    NULL::text as order_number,
    NULL::text as status,
    '❌ Order en array pero no existe o está cerrada' as description
FROM orphaned_orders
UNION ALL
SELECT
    'missing' as issue_type,
    node_id,
    label,
    order_id::text,
    order_number,
    status,
    '❌ Order activa pero NO en array' as description
FROM missing_orders
ORDER BY issue_type, node_id;

COMMENT ON VIEW monitoring_active_orders_integrity IS
'Verifica integridad de venue_nodes.active_order_ids.
ALERTA si retorna rows: triggers no están funcionando.
Expected: 0 rows siempre.
Query diaria recomendada.';

-- 5. IDEMPOTENCY VIOLATIONS (duplicados)
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
),
wallet_duplicates AS (
    SELECT
        'wallet_ledger' as table_name,
        wallet_id::text || '|' || COALESCE(reference_id::text, 'null') || '|' || entry_type as idempotency_key,
        COUNT(*) as duplicate_count,
        ARRAY_AGG(id ORDER BY created_at) as record_ids,
        MIN(created_at) as first_created,
        MAX(created_at) as last_created
    FROM wallet_ledger
    WHERE reference_id IS NOT NULL
    GROUP BY wallet_id, reference_id, entry_type
    HAVING COUNT(*) > 1
),
loyalty_duplicates AS (
    SELECT
        'loyalty_transactions' as table_name,
        client_id::text || '|' || COALESCE(order_id::text, 'null') || '|' || type as idempotency_key,
        COUNT(*) as duplicate_count,
        ARRAY_AGG(id ORDER BY created_at) as record_ids,
        MIN(created_at) as first_created,
        MAX(created_at) as last_created
    FROM loyalty_transactions
    WHERE order_id IS NOT NULL
    GROUP BY client_id, order_id, type
    HAVING COUNT(*) > 1
)
SELECT * FROM stock_duplicates
UNION ALL
SELECT * FROM wallet_duplicates
UNION ALL
SELECT * FROM loyalty_duplicates
ORDER BY table_name, last_created DESC;

COMMENT ON VIEW monitoring_idempotency_violations IS
'Detecta violaciones de constraints de idempotencia (duplicados).
ALERTA CRÍTICA si retorna rows: constraint no está funcionando.
Expected: 0 rows siempre.
Query diaria recomendada.';

-- 6. RLS POLICY COVERAGE (tablas sin RLS)
CREATE OR REPLACE VIEW monitoring_rls_coverage AS
SELECT
    t.schemaname,
    t.tablename,
    CASE
        WHEN EXISTS (
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = t.schemaname
              AND c.relname = t.tablename
              AND c.relrowsecurity = true
        ) THEN '✅ RLS enabled'
        ELSE '❌ RLS MISSING'
    END as rls_status,
    -- Check if table has store_id column
    CASE
        WHEN EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = t.schemaname
              AND table_name = t.tablename
              AND column_name = 'store_id'
        ) THEN '✅ Has store_id'
        ELSE '⚠️ No store_id'
    END as multi_tenant_status
FROM pg_tables t
WHERE t.schemaname = 'public'
  AND t.tablename NOT LIKE 'pg_%'
  AND t.tablename NOT LIKE 'sql_%'
  -- Tablas críticas que DEBEN tener RLS
  AND t.tablename IN (
    'orders', 'clients', 'products', 'inventory_items',
    'stock_movements', 'cash_sessions', 'venue_nodes',
    'wallet_ledger', 'loyalty_transactions', 'profiles',
    'order_items', 'product_recipes', 'stock_alerts',
    'storage_locations', 'packages', 'cash_movements',
    'invitations', 'audit_logs'
  )
ORDER BY
    CASE WHEN rls_status LIKE '%MISSING%' THEN 0 ELSE 1 END,
    t.tablename;

COMMENT ON VIEW monitoring_rls_coverage IS
'Verifica que todas las tablas críticas tengan RLS habilitado.
ALERTA CRÍTICA si rls_status = ❌ RLS MISSING.
Expected: todos con ✅ RLS enabled.
Query semanal recomendada.';

-- 7. GRANT PERMISSIONS
GRANT SELECT ON monitoring_wallet_integrity TO authenticated;
GRANT SELECT ON monitoring_cash_session_reconciliation TO authenticated;
GRANT SELECT ON monitoring_stock_rollback_audit TO authenticated;
GRANT SELECT ON monitoring_active_orders_integrity TO authenticated;
GRANT SELECT ON monitoring_idempotency_violations TO authenticated;
GRANT SELECT ON monitoring_rls_coverage TO authenticated;

-- 8. INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_orders_cancelled_recent
ON orders(cancelled_at DESC)
WHERE status = 'cancelled' AND cancelled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cash_sessions_recent
ON cash_sessions(opened_at DESC)
WHERE opened_at > NOW() - INTERVAL '90 days';

CREATE INDEX IF NOT EXISTS idx_stock_movements_recent
ON stock_movements(created_at DESC)
WHERE created_at > NOW() - INTERVAL '90 days';

COMMENT ON INDEX idx_orders_cancelled_recent IS 'Performance para monitoring_stock_rollback_audit';
COMMENT ON INDEX idx_cash_sessions_recent IS 'Performance para monitoring_cash_session_reconciliation';
COMMENT ON INDEX idx_stock_movements_recent IS 'Performance para monitoring_idempotency_violations';
