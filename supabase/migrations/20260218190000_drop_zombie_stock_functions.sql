-- ============================================================================
-- Fix: BUG-M4 — DROP funciones zombie pre-SSSMA
-- Date: 2026-02-18
-- Approved by: user (2026-02-18) — Opción A: DROP directo
-- Tracked in: known-bugs.md → BUG-M4
--
-- Funciones eliminadas:
--
--   1. decrease_stock_atomic(uuid, uuid, uuid, numeric, text)
--      SECURITY DEFINER. RPC pública (authenticated).
--      RIESGO ACTIVO: bypass total de stock_movements ledger.
--      Mutaba inventory_location_stock.open_packages JSONB directamente.
--      Cualquier invocación creaba drift silencioso e irreconciliable.
--      No referenciada por triggers, funciones, ni frontend.
--
--   2. handle_new_order_inventory()
--      NOT SECURITY DEFINER. RPC pública (authenticated).
--      ROTA: referencia tabla 'inventory' que no existe en producción.
--      Referencia 'order_items' (existe pero lógica obsoleta).
--      No referenciada por triggers, funciones, ni frontend.
--
--   3. deduct_order_stock_unified(uuid, text)
--      SECURITY DEFINER. RPC pública (authenticated).
--      ZOMBIE: reemplazada por finalize_order_stock() (trigger activo).
--      En práctica: loop sobre order_items devuelve 0 rows (datos en JSONB).
--      No referenciada por triggers, funciones, ni frontend.
--
-- Verificación de no-uso antes del DROP:
--   - pg_trigger: 0 triggers → ninguna de las 3
--   - pg_proc callers: 0 funciones → ninguna llama a las 3
--   - Frontend .rpc(): 0 llamadas reales (solo database.types.ts generado)
--
-- Post-drop:
--   El módulo stock queda 100% SSSMA-compliant:
--   - Sin funciones que bypaseen stock_movements ledger
--   - Sin RPCs legacy expuestas a authenticated
--   - validate_stock_integrity() cubre toda la superficie
-- ============================================================================

BEGIN;

-- ============================================================================
-- PRE-CHECK: Confirmar que no hay triggers activos usando estas funciones
-- ============================================================================

DO $$
DECLARE
    v_trigger_count INTEGER;
    v_caller_count  INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_trigger_count
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE p.proname IN (
        'handle_new_order_inventory',
        'decrease_stock_atomic',
        'deduct_order_stock_unified'
    )
    AND t.tgenabled != 'D';  -- Solo triggers activos (no disabled)

    SELECT COUNT(*) INTO v_caller_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.prosrc ILIKE '%handle_new_order_inventory%'
        OR p.prosrc ILIKE '%decrease_stock_atomic%'
        OR p.prosrc ILIKE '%deduct_order_stock_unified%'
      )
      AND p.proname NOT IN (
        'handle_new_order_inventory',
        'decrease_stock_atomic',
        'deduct_order_stock_unified'
      );

    IF v_trigger_count > 0 THEN
        RAISE EXCEPTION 'ABORT: % trigger(s) activos apuntan a funciones zombie. Revisar antes de DROP.', v_trigger_count;
    END IF;
    IF v_caller_count > 0 THEN
        RAISE EXCEPTION 'ABORT: % función(es) llaman a funciones zombie. Revisar antes de DROP.', v_caller_count;
    END IF;

    RAISE NOTICE 'PRE-CHECK: 0 triggers activos, 0 callers. Safe to DROP. ✓';
END $$;

-- ============================================================================
-- DROP 1: decrease_stock_atomic — RIESGO ACTIVO (bypass SSSMA)
-- ============================================================================

DROP FUNCTION IF EXISTS decrease_stock_atomic(
    p_store_id   uuid,
    p_location_id uuid,
    p_item_id    uuid,
    p_quantity   numeric,
    p_reason     text
);

-- ============================================================================
-- DROP 2: handle_new_order_inventory — ROTA (tabla inventory inexistente)
-- ============================================================================

DROP FUNCTION IF EXISTS handle_new_order_inventory();

-- ============================================================================
-- DROP 3: deduct_order_stock_unified — ZOMBIE (reemplazada por trigger activo)
-- ============================================================================

DROP FUNCTION IF EXISTS deduct_order_stock_unified(
    p_order_id uuid,
    p_context  text
);

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_remaining INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_remaining
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'handle_new_order_inventory',
        'decrease_stock_atomic',
        'deduct_order_stock_unified'
      );

    IF v_remaining > 0 THEN
        RAISE EXCEPTION 'CRITICAL: % función(es) zombie siguen existiendo post-DROP', v_remaining;
    END IF;

    RAISE NOTICE '=== BUG-M4 Fix Applied ===';
    RAISE NOTICE 'decrease_stock_atomic:      DROPPED ✓  (pre-SSSMA, bypass ledger)';
    RAISE NOTICE 'handle_new_order_inventory: DROPPED ✓  (rota, tabla inventory inexistente)';
    RAISE NOTICE 'deduct_order_stock_unified: DROPPED ✓  (zombie, reemplazada por finalize_order_stock)';
    RAISE NOTICE '';
    RAISE NOTICE 'Stock module status post-M4:';
    RAISE NOTICE '  - 0 funciones que bypaseen stock_movements ledger';
    RAISE NOTICE '  - 0 RPCs legacy expuestas a authenticated';
    RAISE NOTICE '  - SSSMA apply_stock_delta() como única ruta de mutación autorizada';
    RAISE NOTICE '  - validate_stock_integrity() cubre toda la superficie';
    RAISE NOTICE '';
    RAISE NOTICE 'Módulo stock: 100%% SSSMA-compliant ✓';
END $$;

COMMIT;
