-- 1. Function to create default location
CREATE OR REPLACE FUNCTION create_default_store_location() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO storage_locations (
        store_id, 
        name, 
        type, 
        is_default, 
        location_type,
        is_consumable,
        is_deletable
    ) VALUES (
        NEW.id, 
        'Punto de Almacenamiento Principal', 
        'point_of_sale', -- Matches existing type for main storage
        true, 
        'storage',
        false, -- Main storage typically not consumable directly via POS? Or yes? 
               -- In previous result (Step 533): "type": "point_of_sale", "is_consumable": false.
        false -- Protect default location from deletion
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger for NEW Stores
DROP TRIGGER IF EXISTS trg_init_store_location ON stores;
CREATE TRIGGER trg_init_store_location
    AFTER INSERT ON stores
    FOR EACH ROW
    EXECUTE FUNCTION create_default_store_location();

-- 3. Backfill MISSING Default Locations for Existing Stores
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT s.id, s.name 
        FROM stores s
        LEFT JOIN storage_locations sl ON s.id = sl.store_id AND sl.is_default = TRUE
        WHERE sl.id IS NULL
    LOOP
        RAISE NOTICE 'Creating default location for store: %', r.name;
        
        INSERT INTO storage_locations (
            store_id, 
            name, 
            type, 
            is_default, 
            location_type,
            is_consumable,
            is_deletable
        ) VALUES (
            r.id, 
            'Punto de Almacenamiento Principal', 
            'point_of_sale', 
            true, 
            'storage',
            false,
            false
        );
    END LOOP;
END;
$$;

-- 4. Re-Run Item Backfill (To link items in these now-fixed stores)
-- This creates inventory_location_stock for items that still don't have it
INSERT INTO inventory_location_stock (
    item_id, 
    location_id, 
    stock, -- Wait, DB likely ignores this if closed_units column exists or we map it?
           -- ERROR in Step 542 said "column stock does not exist". 
           -- Correct columns are: item_id, location_id, closed_units, open_packages
    closed_units,
    open_packages,
    store_id
)
SELECT 
  ii.id,
  sl.id,
  0, 
  '[]'::jsonb,
  ii.store_id
FROM inventory_items ii
JOIN storage_locations sl ON sl.store_id = ii.store_id AND sl.is_default = TRUE
LEFT JOIN inventory_location_stock ils ON ils.item_id = ii.id AND ils.location_id = sl.id
WHERE ils.id IS NULL;
