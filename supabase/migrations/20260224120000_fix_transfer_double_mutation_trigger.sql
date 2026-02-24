-- ============================================================================
-- Fix: Double mutation on inventory_location_stock
-- Date: 2026-02-24
--
-- Root cause:
--   apply_stock_delta() manages inventory_location_stock directly in its
--   ELSE branch (non-transfer reasons): it UPSERTs closed_units then calls
--   calculate_item_totals(). But the AFTER trigger update_inventory_from_movement
--   ALSO fires on the stock_movements INSERT and UPSERTs inventory_location_stock
--   for non-skipped reasons (restock, adjustment, physical_count, etc.).
--   This causes DOUBLE addition/deduction in inventory_location_stock, and
--   calculate_item_totals() then reads the inflated value into current_stock.
--
-- Affected items: any item that received restock, adjustment, physical_count,
--   order_cancelled_restock, or order_edit_compensation through apply_stock_delta().
--
-- Fix:
--   Remove ALL inventory_location_stock updates from the trigger.
--   Every caller already manages location stock:
--     - apply_stock_delta()         → ELSE branch UPSERTs + calculate_item_totals()
--     - consume_from_smart_packages → manages open_packages FIFO
--     - transfer_stock()            → manages source/dest location stock
--     - transfer_stock_between_locations() → manages source/dest location stock
--
-- Data fix:
--   Recalculate inventory_location_stock.closed_units from stock_movements ledger,
--   then recalculate current_stock via calculate_item_totals() for all affected items.
-- ============================================================================

-- STEP 1: Fix the trigger (remove location stock updates entirely)
CREATE OR REPLACE FUNCTION public.update_inventory_from_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $trigger_fn$
BEGIN
    -- Basic validation
    IF NEW.inventory_item_id IS NULL THEN
        RAISE EXCEPTION 'Stock movement must have an inventory_item_id';
    END IF;

    -- inventory_location_stock is managed exclusively by the calling functions:
    --   apply_stock_delta(), consume_from_smart_packages(), transfer_stock(), etc.
    -- current_stock is managed exclusively by apply_stock_delta() / calculate_item_totals().
    -- The trigger only performs validation.
    RETURN NEW;
END;
$trigger_fn$;

-- STEP 2: Recalculate inventory_location_stock.closed_units from ledger
-- For each (item, location) pair, set closed_units = SUM(qty_delta) from stock_movements
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Recalculate closed_units from ledger for every item+location
    FOR r IN (
        SELECT
            sm.store_id,
            sm.inventory_item_id AS item_id,
            sm.location_id,
            SUM(sm.qty_delta) AS correct_closed
        FROM stock_movements sm
        WHERE sm.location_id IS NOT NULL
        GROUP BY sm.store_id, sm.inventory_item_id, sm.location_id
    )
    LOOP
        UPDATE inventory_location_stock
        SET closed_units = GREATEST(r.correct_closed, 0),
            updated_at = NOW()
        WHERE store_id = r.store_id
          AND item_id = r.item_id
          AND location_id = r.location_id;
    END LOOP;

    -- STEP 3: Recalculate current_stock for all items that have movements
    FOR r IN (
        SELECT DISTINCT inventory_item_id
        FROM stock_movements
    )
    LOOP
        PERFORM calculate_item_totals(r.inventory_item_id);
    END LOOP;

    RAISE NOTICE 'Double mutation fix applied: location stock and current_stock recalculated from ledger';
END;
$$;
