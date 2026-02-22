-- ============================================================================
-- Fix: BUG-C2 — RLS DELETE habilitada en stock_movements (riesgo latente)
-- Date: 2026-02-18
-- Approved by: user (2026-02-18)
-- Tracked in: known-bugs.md → BUG-C2, pending-decisions.md → PD-001 (L2)
--
-- Diagnóstico:
--   Existe política RLS `stock_movements_delete_by_store` que permite a
--   cualquier usuario `authenticated` de la tienda hacer DELETE en el ledger
--   de stock. Esto contradice el principio append-only de SSSMA.
--
--   Actualmente el trigger `trg_protect_stock_movements` (BEFORE DELETE OR UPDATE)
--   intercepta y rechaza el DELETE antes de ejecutarse. Sin embargo:
--
--   1. Si el trigger fuera eliminado por una migración futura, la RLS
--      abriría el ledger sin fricción adicional.
--   2. La existencia de la policy comunica intención incorrecta: que usuarios
--      autenticados "deberían poder" borrar movimientos de stock.
--   3. Defensa en profundidad requiere que ambas capas protejan, no solo una.
--
-- Fix:
--   DROP de la política DELETE. Sin policy = deny by default para authenticated.
--   El trigger sigue existiendo como segunda capa de protección.
--
-- Resultado arquitectónico:
--   authenticated user DELETE →
--     Layer 1: RLS deny (sin policy = denegado por defecto) ← NUEVO
--     Layer 2: trg_protect_stock_movements BEFORE DELETE   ← EXISTENTE
--
--   service_role / owner DELETE →
--     Layer 1: RLS bypasada (relforcerowsecurity=false)
--     Layer 2: trg_protect_stock_movements BEFORE DELETE   ← SIGUE PROTEGIENDO
--
-- No se modifica:
--   - trg_protect_stock_movements (se mantiene activo)
--   - Políticas SELECT, INSERT, UPDATE (sin cambios)
--   - Ninguna función, trigger o tabla adicional
--
-- Reversibilidad:
--   CREATE POLICY stock_movements_delete_by_store ON stock_movements
--     FOR DELETE TO authenticated
--     USING (store_id = get_user_store_id());
-- ============================================================================

BEGIN;

-- Verificar estado previo
DO $$
DECLARE
    v_policy_exists BOOLEAN;
    v_trigger_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_policies
        WHERE tablename = 'stock_movements'
          AND cmd = 'DELETE'
          AND policyname = 'stock_movements_delete_by_store'
    ) INTO v_policy_exists;

    SELECT EXISTS(
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'stock_movements'::regclass
          AND tgname = 'trg_protect_stock_movements'
    ) INTO v_trigger_exists;

    IF NOT v_policy_exists THEN
        RAISE NOTICE 'SKIP: stock_movements_delete_by_store no existe (ya eliminada o nunca creada)';
    ELSE
        RAISE NOTICE 'PRE-CHECK: policy DELETE existe — procediendo a eliminar';
    END IF;

    IF NOT v_trigger_exists THEN
        RAISE EXCEPTION 'CRITICAL: trg_protect_stock_movements NO EXISTE — no se puede proceder sin el guardián de segunda capa';
    ELSE
        RAISE NOTICE 'PRE-CHECK: trg_protect_stock_movements presente — segunda capa activa';
    END IF;
END $$;

-- ============================================================================
-- THE FIX: Eliminar política RLS DELETE del ledger
-- ============================================================================

DROP POLICY IF EXISTS stock_movements_delete_by_store ON stock_movements;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_delete_policy_exists BOOLEAN;
    v_trigger_exists BOOLEAN;
    v_remaining_policies INT;
BEGIN
    -- Verificar que no existe ninguna policy DELETE
    SELECT EXISTS(
        SELECT 1 FROM pg_policies
        WHERE tablename = 'stock_movements'
          AND cmd = 'DELETE'
    ) INTO v_delete_policy_exists;

    -- Verificar que el trigger guardián sigue activo
    SELECT EXISTS(
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'stock_movements'::regclass
          AND tgname = 'trg_protect_stock_movements'
    ) INTO v_trigger_exists;

    -- Contar policies restantes
    SELECT COUNT(*) INTO v_remaining_policies
    FROM pg_policies
    WHERE tablename = 'stock_movements';

    IF v_delete_policy_exists THEN
        RAISE EXCEPTION 'CRITICAL: Todavía existe una policy DELETE en stock_movements después del DROP';
    END IF;

    IF NOT v_trigger_exists THEN
        RAISE EXCEPTION 'CRITICAL: trg_protect_stock_movements no existe — ledger sin guardián';
    END IF;

    RAISE NOTICE '=== BUG-C2 Fix Applied ===';
    RAISE NOTICE 'stock_movements_delete_by_store: DROPPED';
    RAISE NOTICE 'Políticas restantes en stock_movements: % (esperado: 3 — SELECT, INSERT, UPDATE)', v_remaining_policies;
    RAISE NOTICE 'trg_protect_stock_movements: ACTIVE (BEFORE DELETE OR UPDATE)';
    RAISE NOTICE '';
    RAISE NOTICE 'Defensa en profundidad activa:';
    RAISE NOTICE '  Layer 1: RLS deny by default (sin policy DELETE)';
    RAISE NOTICE '  Layer 2: trg_protect_stock_movements BEFORE DELETE';
    RAISE NOTICE '';
    RAISE NOTICE 'Post-deploy verification requerida:';
    RAISE NOTICE '  1. SELECT policyname, cmd FROM pg_policies WHERE tablename = ''stock_movements'';';
    RAISE NOTICE '     → No debe existir cmd = DELETE';
    RAISE NOTICE '  2. Intentar DELETE como authenticated → debe fallar por RLS';
    RAISE NOTICE '  3. SELECT tgname FROM pg_trigger WHERE tgrelid = ''stock_movements''::regclass';
    RAISE NOTICE '     → trg_protect_stock_movements debe seguir presente';
END $$;

COMMIT;
