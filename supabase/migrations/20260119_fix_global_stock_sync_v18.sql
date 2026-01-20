-- V18: Fix Global Stock Sync
-- CRITICAL FIX: Ensure inventory_items.current_stock (Global) is updated 
-- EVEN WHEN the movement is assigned to a specific location.

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

    -- 1. Update Specific Location Stock (if applicable)
    IF NEW.location_id IS NOT NULL THEN
        INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
        VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta)
        ON CONFLICT (store_id, item_id, location_id)
        DO UPDATE SET 
            closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units,
            updated_at = now();
    END IF;

    -- 2. ALWAYS Update Global Item Stock
    -- This ensures "Total Stock" view is always in sync with reality
    UPDATE inventory_items 
    SET current_stock = current_stock + NEW.qty_delta 
    WHERE id = NEW.inventory_item_id;

    RETURN NEW;
END;
$function$;
