-- V21: Fix Double Stock Deduction & Standardize Sync
-- This migration removes the manual current_stock update from the movement trigger
-- and ensures that all global stock updates come from calculate_item_totals.

CREATE OR REPLACE FUNCTION public.update_inventory_from_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    -- Validation
    IF NEW.inventory_item_id IS NULL THEN
        RAISE EXCEPTION 'Stock movement must have an inventory_item_id';
    END IF;

    -- 1. RESTOCK VALIDATION
    IF NEW.qty_delta > 0 AND NEW.location_id IS NULL THEN
        RAISE EXCEPTION 'Restock movements must have a location_id to maintain multi-location integrity.';
    END IF;

    -- 2. BRANCH: CONSUMPTION (Negative delta)
    IF NEW.qty_delta < 0 THEN
        -- Delegate to atomic open package logic
        -- This internally modifies open_packages table, which triggers calculate_item_totals
        PERFORM consume_from_open_packages(
            p_item_id := NEW.inventory_item_id,
            p_store_id := NEW.store_id,
            p_required_qty := ABS(NEW.qty_delta),
            p_unit := NEW.unit_type,
            p_reason := NEW.reason,
            p_order_id := NEW.order_id,
            p_location_id := NEW.location_id,
            p_skip_logging := TRUE 
        );
        
    -- 3. BRANCH: RESTOCK/ADJUSTMENT (Positive delta)
    ELSE
        -- Incoming stock always adds to closed_units in the specific location
        -- This triggers sync_inventory_item_stock -> calculate_item_totals
        INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
        VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta)
        ON CONFLICT (store_id, item_id, location_id)
        DO UPDATE SET 
            closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units,
            updated_at = now();
    END IF;

    -- 4. REMOVED: Manual Global Update
    -- We NO LONGER update inventory_items.current_stock here.
    -- The updates above (to open_packages or inventory_location_stock) 
    -- already trigger calculate_item_totals() via their own triggers.
    -- This avoids double deduction and ensures sum(closed*size + open) === current_stock.

    RETURN NEW;
END;
$function$;

-- RECALC: Fix existing discrepancies for the affected item
-- And any other item that might have been hit by the double-deduction bug recently.
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM inventory_items LOOP
        PERFORM public.calculate_item_totals(r.id);
    END LOOP;
END $$;
