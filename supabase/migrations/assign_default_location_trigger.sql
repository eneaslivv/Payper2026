-- Trigger function to assign default location
CREATE OR REPLACE FUNCTION assign_default_location_to_new_item() RETURNS TRIGGER AS $$
DECLARE
    v_default_location_id UUID;
BEGIN
    -- Find default location for the store
    SELECT id INTO v_default_location_id
    FROM storage_locations
    WHERE store_id = NEW.store_id AND is_default = TRUE
    LIMIT 1;

    -- If found, create the location stock record
    IF v_default_location_id IS NOT NULL THEN
        INSERT INTO inventory_location_stock (
            item_id,
            location_id,
            store_id,
            closed_units,
            open_packages
        ) VALUES (
            NEW.id,
            v_default_location_id,
            NEW.store_id,
            0, -- Start with 0
            '[]'::jsonb
        ) ON CONFLICT DO NOTHING; -- Safe in case of weird race conditions
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger
DROP TRIGGER IF EXISTS trg_auto_assign_location ON inventory_items;
CREATE TRIGGER trg_auto_assign_location
    AFTER INSERT ON inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION assign_default_location_to_new_item();
