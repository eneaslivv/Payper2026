-- ============================================================================
-- Fix: stock_movements missing 'notes' column → Error 42703
-- Date: 2026-02-21
--
-- Root cause: apply_stock_delta() (10-param overload with p_notes)
--   inserts into stock_movements.notes, but the column didn't exist.
--   transfer_stock() → apply_stock_delta() → INSERT notes → 42703
--
-- Also: Drop duplicate apply_stock_delta overload (9 params without p_notes)
--   to avoid function ambiguity.
-- ============================================================================

BEGIN;

-- 1. Add notes column to stock_movements
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT NULL;

-- 2. Drop duplicate apply_stock_delta overload (9 params, without p_notes)
DROP FUNCTION IF EXISTS apply_stock_delta(uuid, uuid, numeric, text, uuid, uuid, text, text, uuid);

-- Verify
DO $$
DECLARE
    v_has_notes BOOLEAN;
    v_overload_count INT;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stock_movements' AND column_name = 'notes'
    ) INTO v_has_notes;

    SELECT COUNT(*) INTO v_overload_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'apply_stock_delta';

    IF NOT v_has_notes THEN
        RAISE EXCEPTION 'CRITICAL: stock_movements.notes column not added';
    END IF;

    IF v_overload_count != 1 THEN
        RAISE EXCEPTION 'CRITICAL: apply_stock_delta has % overloads, expected 1', v_overload_count;
    END IF;

    RAISE NOTICE 'stock_movements.notes = %', v_has_notes;
    RAISE NOTICE 'apply_stock_delta overloads = %', v_overload_count;
END $$;

COMMIT;
