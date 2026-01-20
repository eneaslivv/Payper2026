-- Migration: Hook V20 Atomic Logic into Stock Trigger
-- Description: Updates the 'update_inventory_from_movement' trigger to use V20 atomic consumption
-- Date: 2026-01-20

CREATE OR REPLACE FUNCTION public.update_inventory_from_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
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
            -- We pass ABS(qty) because the function expects a positive consumption amount
            PERFORM decrease_stock_atomic_v20(
                NEW.store_id, 
                NEW.location_id, 
                NEW.inventory_item_id, 
                ABS(NEW.qty_delta), 
                NEW.reason
            );
        ELSE
            -- RESTOCK/ADDITION: Just add to Closed Units (Legacy/Standard behavior)
            -- This keeps it simple. Re-stocking usually adds full units.
            INSERT INTO location_stock (store_id, item_id, location_id, closed_units)
            VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta)
            ON CONFLICT (store_id, item_id, location_id)
            DO UPDATE SET 
                closed_units = location_stock.closed_units + EXCLUDED.closed_units,
                updated_at = now();
        END IF;

    ELSE
        -- Fallback: Update global item stock (if no specific location) - Legacy path
        UPDATE inventory_items 
        SET current_stock = current_stock + NEW.qty_delta 
        WHERE id = NEW.inventory_item_id;
    END IF;

    RETURN NEW;
END;
$function$;
