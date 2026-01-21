-- Migration: Fix Stock Sync Issue (V23)
-- Created: 2026-01-21
-- Description: Fixes update_inventory_from_movement to always update inventory_items.current_stock, and repairs existing discrepancies.

CREATE OR REPLACE FUNCTION public.update_inventory_from_movement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Validation
    IF NEW.inventory_item_id IS NULL THEN
        RAISE EXCEPTION 'Stock movement must have an inventory_item_id';
    END IF;

    -- Update Logic based on Location
    IF NEW.location_id IS NOT NULL THEN
        
        -- V20 LOGIC BRANCHING
        IF NEW.qty_delta < 0 THEN
            -- CONSUMPTION: Use Atomic Logic (Open -> New Open -> Closed)
            PERFORM decrease_stock_atomic_v20(
                NEW.store_id, 
                NEW.location_id, 
                NEW.inventory_item_id, 
                ABS(NEW.qty_delta), 
                NEW.reason
            );
        ELSE
            -- RESTOCK/ADDITION: Just add to Closed Units
            -- FIX: Use correct table 'inventory_location_stock'
            INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units, open_packages)
            VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta, '[]'::jsonb)
            ON CONFLICT (store_id, item_id, location_id)
            DO UPDATE SET 
                closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units,
                updated_at = now();
        END IF;

        -- FIX V23: ALWAYS Synchronize inventory_items.current_stock from location totals
        -- This ensures global total matches sum of locations
        UPDATE inventory_items 
        SET current_stock = (
            SELECT COALESCE(SUM(closed_units), 0)
            FROM inventory_location_stock 
            WHERE item_id = NEW.inventory_item_id
        )
        WHERE id = NEW.inventory_item_id;

    ELSE
        -- Fallback: Update global item stock (if no specific location)
        -- Only used for legacy or global adjustments
        UPDATE inventory_items 
        SET current_stock = current_stock + NEW.qty_delta 
        WHERE id = NEW.inventory_item_id;
    END IF;

    RETURN NEW;
END;
$function$;

-- REPAIR DATA: Sync all inventory items to match their location sums
UPDATE inventory_items ii
SET current_stock = (
    SELECT COALESCE(SUM(closed_units), 0)
    FROM inventory_location_stock
    WHERE item_id = ii.id
);
