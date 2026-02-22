-- ============================================================================
-- Fix: BUG-C1 — Doble trigger de rollback en cancelación de órdenes
-- Date: 2026-02-18
-- Approved by: user (2026-02-18)
-- Tracked in: known-bugs.md → BUG-C1, pending-decisions.md → PD-001 (L1)
--
-- Diagnóstico:
--   Existen dos triggers BEFORE UPDATE sobre orders que llaman a la misma
--   función rollback_stock_on_cancellation():
--     - trg_rollback_stock_on_cancel    → BEFORE UPDATE (cualquier columna)
--     - trg_rollback_stock_on_cancellation → BEFORE UPDATE OF status
--
--   Al cancelar una orden (status → 'cancelled'), ambos disparan en la misma
--   transacción. La función no tiene guarda de idempotency entre triggers.
--   apply_stock_delta() genera UUID nuevo en cada llamada.
--   Resultado: stock restaurado x2, dos registros en stock_movements.
--
-- Fix:
--   DROP del trigger genérico (trg_rollback_stock_on_cancel).
--   El específico (trg_rollback_stock_on_cancellation — UPDATE OF status)
--   es suficiente y semánticamente correcto.
--
-- No se modifica:
--   - trg_rollback_stock_on_cancellation (se mantiene)
--   - rollback_stock_on_cancellation() (función sin cambios)
--   - Ninguna otra tabla, función, trigger o política RLS
--
-- Reversibilidad:
--   CREATE TRIGGER trg_rollback_stock_on_cancel
--     BEFORE UPDATE ON orders
--     FOR EACH ROW EXECUTE FUNCTION rollback_stock_on_cancellation();
-- ============================================================================

BEGIN;

-- Verificar estado previo (documentación, no bloquea)
DO $$
DECLARE
    v_cancel_count INT;
BEGIN
    SELECT COUNT(*) INTO v_cancel_count
    FROM pg_trigger
    WHERE tgrelid = 'orders'::regclass
      AND tgname IN ('trg_rollback_stock_on_cancel', 'trg_rollback_stock_on_cancellation');

    IF v_cancel_count != 2 THEN
        RAISE NOTICE 'WARN: Se esperaban 2 triggers de rollback, encontrados: %', v_cancel_count;
    ELSE
        RAISE NOTICE 'PRE-CHECK OK: 2 triggers de rollback encontrados (se eliminará 1)';
    END IF;
END $$;

-- ============================================================================
-- THE FIX: Eliminar trigger redundante genérico
-- ============================================================================

DROP TRIGGER IF EXISTS trg_rollback_stock_on_cancel ON orders;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_generic_exists BOOLEAN;
    v_specific_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'orders'::regclass
          AND tgname = 'trg_rollback_stock_on_cancel'
    ) INTO v_generic_exists;

    SELECT EXISTS(
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'orders'::regclass
          AND tgname = 'trg_rollback_stock_on_cancellation'
    ) INTO v_specific_exists;

    IF v_generic_exists THEN
        RAISE EXCEPTION 'CRITICAL: trg_rollback_stock_on_cancel sigue existiendo después del DROP';
    END IF;

    IF NOT v_specific_exists THEN
        RAISE EXCEPTION 'CRITICAL: trg_rollback_stock_on_cancellation no existe (el trigger correcto debe permanecer)';
    END IF;

    RAISE NOTICE '=== BUG-C1 Fix Applied ===';
    RAISE NOTICE 'trg_rollback_stock_on_cancel: DROPPED (trigger genérico redundante)';
    RAISE NOTICE 'trg_rollback_stock_on_cancellation: EXISTS (trigger específico de status — correcto)';
    RAISE NOTICE '';
    RAISE NOTICE 'Post-deploy verification requerida:';
    RAISE NOTICE '  1. Cancelar orden con stock_deducted = TRUE';
    RAISE NOTICE '  2. SELECT count(*) FROM stock_movements WHERE order_id = <id> AND reason = ''order_cancelled_restock'';';
    RAISE NOTICE '     → Debe ser igual al número de ingredientes, NO al doble';
    RAISE NOTICE '  3. SELECT * FROM validate_stock_integrity() WHERE has_drift = true;';
    RAISE NOTICE '     → Debe retornar 0 rows';
END $$;

COMMIT;
