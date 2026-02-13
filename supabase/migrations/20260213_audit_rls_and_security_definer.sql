-- =============================================
-- AUDIT #10: RLS & SECURITY DEFINER VALIDATION
-- Fecha: 2026-02-13
-- Propósito:
--   Auditar seguridad multi-tenant en:
--   1. Todas las funciones SECURITY DEFINER
--   2. Políticas RLS en tablas de negocio
--   3. Verificar que TODAS validan store_id
-- =============================================

-- 1. VIEW: All SECURITY DEFINER Functions
CREATE OR REPLACE VIEW security_definer_functions_audit AS
SELECT
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition,
    -- Check if function validates store_id
    CASE
        WHEN pg_get_functiondef(p.oid) LIKE '%store_id%' THEN TRUE
        ELSE FALSE
    END as validates_store_id,
    -- Check if function validates auth.uid()
    CASE
        WHEN pg_get_functiondef(p.oid) LIKE '%auth.uid%' THEN TRUE
        ELSE FALSE
    END as validates_auth_uid,
    -- Check if function has permission check
    CASE
        WHEN pg_get_functiondef(p.oid) LIKE '%PERMISSION_DENIED%'
             OR pg_get_functiondef(p.oid) LIKE '%profiles%'
             OR pg_get_functiondef(p.oid) LIKE '%auth.get_user_store_id%' THEN TRUE
        ELSE FALSE
    END as has_permission_check
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.prosecdef = TRUE  -- SECURITY DEFINER
  AND n.nspname = 'public'
ORDER BY p.proname;

-- 2. VIEW: Tables Without store_id Column
CREATE OR REPLACE VIEW tables_without_store_id_audit AS
SELECT
    table_name,
    -- Check if RLS is enabled
    (SELECT relrowsecurity
     FROM pg_class
     WHERE relname = table_name
     AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) as rls_enabled,
    -- Get table type (base table, view, etc)
    table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
  AND table_name NOT IN (
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'store_id'
  )
  -- Exclude system tables
  AND table_name NOT LIKE 'pg_%'
  AND table_name NOT LIKE 'sql_%'
  AND table_name NOT LIKE '_prisma%'
  -- Include only business tables (heuristic: has created_at or id)
  AND table_name IN (
      SELECT table_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (column_name = 'created_at' OR column_name = 'id')
  )
ORDER BY table_name;

-- 3. VIEW: RLS Policies Audit
CREATE OR REPLACE VIEW rls_policies_audit AS
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd, -- SELECT, INSERT, UPDATE, DELETE
    qual, -- USING clause
    with_check, -- WITH CHECK clause
    -- Check if policy validates store_id
    CASE
        WHEN qual LIKE '%store_id%' OR with_check LIKE '%store_id%' THEN TRUE
        ELSE FALSE
    END as validates_store_id
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4. CRITICAL TABLES CHECKLIST
-- These tables MUST have store_id and proper RLS
DO $$
DECLARE
    v_critical_tables TEXT[] := ARRAY[
        'orders',
        'order_items',
        'products',
        'inventory_items',
        'cash_sessions',
        'clients',
        'loyalty_transactions',
        'wallet_ledger',
        'venue_nodes',
        'stock_movements',
        'menu_items',
        'categories'
    ];
    v_table TEXT;
    v_has_store_id BOOLEAN;
    v_has_rls BOOLEAN;
    v_policy_count INTEGER;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CRITICAL TABLES SECURITY AUDIT';
    RAISE NOTICE '========================================';

    FOREACH v_table IN ARRAY v_critical_tables
    LOOP
        -- Check if table has store_id
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = v_table
              AND column_name = 'store_id'
        ) INTO v_has_store_id;

        -- Check if RLS is enabled
        SELECT relrowsecurity
        INTO v_has_rls
        FROM pg_class
        WHERE relname = v_table
          AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

        -- Count policies
        SELECT COUNT(*)
        INTO v_policy_count
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = v_table;

        -- Report
        IF v_has_store_id AND v_has_rls AND v_policy_count > 0 THEN
            RAISE NOTICE '✅ %: store_id=%, RLS=%, policies=%', v_table, v_has_store_id, v_has_rls, v_policy_count;
        ELSE
            RAISE WARNING '⚠️  %: store_id=%, RLS=%, policies=% [SECURITY RISK]', v_table, v_has_store_id, v_has_rls, v_policy_count;
        END IF;
    END LOOP;

    RAISE NOTICE '========================================';
END $$;

-- 5. SECURITY DEFINER FUNCTIONS AUDIT
DO $$
DECLARE
    v_func RECORD;
    v_has_validation BOOLEAN;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SECURITY DEFINER FUNCTIONS AUDIT';
    RAISE NOTICE '========================================';

    FOR v_func IN
        SELECT
            proname as function_name,
            pg_get_functiondef(oid) as function_def
        FROM pg_proc
        WHERE prosecdef = TRUE
          AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        -- Check if function validates store_id or auth.uid
        v_has_validation := (
            v_func.function_def LIKE '%store_id%'
            OR v_func.function_def LIKE '%auth.uid%'
            OR v_func.function_def LIKE '%auth.get_user_store_id%'
            OR v_func.function_def LIKE '%profiles%'
        );

        IF v_has_validation THEN
            RAISE NOTICE '✅ %: Has validation', v_func.function_name;
        ELSE
            RAISE WARNING '⚠️  %: NO VALIDATION [SECURITY RISK]', v_func.function_name;
        END IF;
    END LOOP;

    RAISE NOTICE '========================================';
END $$;

-- 6. RECOMMENDATIONS
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'SECURITY RECOMMENDATIONS';
    RAISE NOTICE '========================================';
    RAISE NOTICE '1. All SECURITY DEFINER functions MUST validate:';
    RAISE NOTICE '   - auth.uid() (caller identity)';
    RAISE NOTICE '   - store_id (multi-tenant isolation)';
    RAISE NOTICE '';
    RAISE NOTICE '2. All business tables MUST have:';
    RAISE NOTICE '   - store_id column';
    RAISE NOTICE '   - RLS enabled';
    RAISE NOTICE '   - Policies that check store_id';
    RAISE NOTICE '';
    RAISE NOTICE '3. Review security_definer_functions_audit view:';
    RAISE NOTICE '   SELECT * FROM security_definer_functions_audit';
    RAISE NOTICE '   WHERE has_permission_check = FALSE;';
    RAISE NOTICE '';
    RAISE NOTICE '4. Review tables_without_store_id_audit view:';
    RAISE NOTICE '   SELECT * FROM tables_without_store_id_audit;';
    RAISE NOTICE '';
    RAISE NOTICE '5. Review rls_policies_audit view:';
    RAISE NOTICE '   SELECT * FROM rls_policies_audit';
    RAISE NOTICE '   WHERE validates_store_id = FALSE;';
    RAISE NOTICE '========================================';
END $$;

-- 7. GRANT PERMISSIONS (read-only audit views)
GRANT SELECT ON security_definer_functions_audit TO authenticated;
GRANT SELECT ON tables_without_store_id_audit TO authenticated;
GRANT SELECT ON rls_policies_audit TO authenticated;

-- 8. COMMENT
COMMENT ON VIEW security_definer_functions_audit IS
'Audit view of all SECURITY DEFINER functions.
Shows which functions validate store_id, auth.uid, and have permission checks.
Functions without validation are potential security risks.
Review regularly and ensure all functions validate multi-tenant access.';

COMMENT ON VIEW tables_without_store_id_audit IS
'Audit view of business tables without store_id column.
These tables may leak data between stores.
Review each table to determine if it needs multi-tenant isolation.';

COMMENT ON VIEW rls_policies_audit IS
'Audit view of all RLS policies.
Shows which policies validate store_id.
Policies without store_id validation may allow cross-tenant access.';
