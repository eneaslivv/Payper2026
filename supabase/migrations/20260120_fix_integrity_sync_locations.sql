-- FIX: Strong Integrity between Location Stock and Global Stock
-- 1. Create a function to recalculate global stock from locations
-- 2. Trigger it on any change to inventory_location_stock
-- 3. Run a one-off sync for all items

-- Function: Recalculate Item Totals
CREATE OR REPLACE FUNCTION public.sync_item_totals_from_locations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item_id UUID;
    v_total_closed NUMERIC;
    v_total_open_pkgs JSONB;
    v_open_count INTEGER;
    v_pkg_size NUMERIC;
    v_open_volume NUMERIC := 0;
    v_pkg_record RECORD;
BEGIN
    v_item_id := COALESCE(NEW.item_id, OLD.item_id);

    -- 1. Sum up Closed Units from all locations
    SELECT COALESCE(SUM(closed_units), 0)
    INTO v_total_closed
    FROM inventory_location_stock
    WHERE item_id = v_item_id;

    -- 2. Aggregate Open Packages (Complex logic, simplified for Total Volume)
    -- We need to sum the 'remaining' of all open packages across locations
    -- And count them
    
    -- Calculate Open Volume & Count
    SELECT 
        COALESCE(SUM( (pkg->>'remaining')::numeric ), 0),
        COUNT(*)
    INTO v_open_volume, v_open_count
    FROM inventory_location_stock,
         jsonb_array_elements(open_packages) as pkg
    WHERE item_id = v_item_id;

    -- 3. Get Package Size
    SELECT package_size INTO v_pkg_size FROM inventory_items WHERE id = v_item_id;
    IF v_pkg_size IS NULL OR v_pkg_size = 0 THEN 
        v_pkg_size := 1; 
    END IF;

    -- 4. Update Inventory Item
    -- Current Stock = (Closed * Size) + Open Volume
    UPDATE inventory_items
    SET 
        closed_stock = v_total_closed,
        open_count = v_open_count,
        current_stock = (v_total_closed * v_pkg_size) + v_open_volume,
        updated_at = NOW()
    WHERE id = v_item_id;

    RETURN NULL; -- After trigger (for update/insert)
END;
$$;

-- Trigger: Bind to inventory_location_stock
DROP TRIGGER IF EXISTS trg_enforce_location_sync ON inventory_location_stock;

CREATE TRIGGER trg_enforce_location_sync
AFTER INSERT OR UPDATE OR DELETE ON inventory_location_stock
FOR EACH ROW
EXECUTE FUNCTION sync_item_totals_from_locations();

-- ONE-OFF: Force Sync for ALL items that have location stock
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT DISTINCT item_id FROM inventory_location_stock LOOP
        -- Fake an update to trigger the sync (or call function directly if valid, but trigger is cleaner via phantom update? No, call logic)
        -- Actually, we can just run the logic block.
        -- But simpler: Update the row with same value to fire trigger?
        -- UPDATE inventory_location_stock SET closed_units = closed_units WHERE item_id = r.item_id;
        -- Better: Just update all items based on sum query directly.
        
        UPDATE inventory_items ii
        SET 
            closed_stock = (
                SELECT COALESCE(SUM(closed_units), 0) 
                FROM inventory_location_stock WHERE item_id = ii.id
            ),
            current_stock = (
                (SELECT COALESCE(SUM(closed_units), 0) FROM inventory_location_stock WHERE item_id = ii.id) * COALESCE(ii.package_size, 1)
            ) + (
                SELECT COALESCE(SUM( (pkg->>'remaining')::numeric ), 0)
                FROM inventory_location_stock, jsonb_array_elements(open_packages) as pkg
                WHERE item_id = ii.id
            )
        WHERE id = r.item_id;
    END LOOP;
END;
$$;
