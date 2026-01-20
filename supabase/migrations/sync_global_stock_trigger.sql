-- Migration: Sync Global Stock Trigger
-- Purpose: Automatically keep inventory_items.current_stock/closed_stock in sync with sum of inventory_location_stock
-- Date: 2026-01-18

-- 1. Create Sync Function
CREATE OR REPLACE FUNCTION public.sync_global_stock_from_locations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item_id uuid;
    v_total_closed integer;
    v_total_open numeric; -- Future use if open packages need sync
    v_package_size numeric;
BEGIN
    -- Determine item_id based on operation
    IF TG_OP = 'DELETE' THEN
        v_item_id := OLD.item_id;
    ELSE
        v_item_id := NEW.item_id;
    END IF;

    -- Calculate total closed units across all locations for this item
    SELECT COALESCE(SUM(closed_units), 0)
    INTO v_total_closed
    FROM public.inventory_location_stock
    WHERE item_id = v_item_id;

    -- Get package info to update current_stock correctly
    -- current_stock is usually total units (e.g., individual beers) or weight
    -- closed_stock is number of full packages/kegs
    SELECT COALESCE(package_size, 1) INTO v_package_size
    FROM public.inventory_items
    WHERE id = v_item_id;

    -- Update inventory_items
    -- We assume current_stock should reflect the Total Effective Stock
    -- For now, we sync closed_stock directly, and update current_stock based on closed * size
    -- Note: This ignores 'open' packages in locations for current_stock calculation if we strictly follow this,
    -- but usually current_stock in inventory_items is the "Main" source of truth.
    -- However, with this trigger, we establish Location Stock as the Source of Truth.
    
    UPDATE public.inventory_items
    SET 
        closed_stock = v_total_closed,
        -- Optionally update current_stock if you want it to be purely derived from locations
        -- For 'unit' type items, package_size is usually 1, so closed_stock == current_stock
        current_stock = (v_total_closed * v_package_size) 
                        -- + Add logic here if you track open packages summation in global stock, 
                        -- but usually open packages are detailed only in locations.
    WHERE id = v_item_id;

    RETURN NULL;
END;
$$;

-- 2. Create Trigger
DROP TRIGGER IF EXISTS trg_sync_global_stock ON public.inventory_location_stock;
CREATE TRIGGER trg_sync_global_stock
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_location_stock
FOR EACH ROW
EXECUTE FUNCTION public.sync_global_stock_from_locations();

-- 3. Run Initial Sync (Fix existing discrepancies)
DO $$
DECLARE
    r record;
BEGIN
    -- Update all items that have location stock
    FOR r IN SELECT DISTINCT item_id FROM public.inventory_location_stock LOOP
        -- Trigger manually by doing a dummy update (safe) 
        -- OR just run the logic directly. Let's run logic directly for efficiency.
        
        UPDATE public.inventory_items ii
        SET 
            closed_stock = sub.total_closed,
            current_stock = sub.total_closed * COALESCE(ii.package_size, 1)
        FROM (
            SELECT item_id, COALESCE(SUM(closed_units), 0) as total_closed
            FROM public.inventory_location_stock
            GROUP BY item_id
        ) sub
        WHERE ii.id = sub.item_id AND ii.id = r.item_id;
        
    END LOOP;
END $$;
