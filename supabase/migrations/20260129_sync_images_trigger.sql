-- MIGRATION: 20260129_sync_images_trigger.sql
-- Description: 
-- Server-side sync of image_url from Inventory to Products.
-- This bypasses RLS issues on the frontend by ensuring the 'public' Products table always has the image.

-- 1. Create the Sync Function
CREATE OR REPLACE FUNCTION public.sync_inventory_image_to_product()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- Runs as admin, bypasses RLS
AS $$
BEGIN
    -- Only sync if image_url changed or it's a new item
    IF (TG_OP = 'INSERT') OR (TG_OP = 'UPDATE' AND NEW.image_url IS DISTINCT FROM OLD.image_url) THEN
        -- Update matching product(s) by Name and Store
        -- Only update if the product currently has NO image or if we are overwriting it?
        -- Strategy: Inventory is Source of Truth. Overwrite Product.
        UPDATE products
        SET image_url = NEW.image_url,
            updated_at = NOW()
        WHERE store_id = NEW.store_id
          AND LOWER(TRIM(name)) = LOWER(TRIM(NEW.name));
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Create the Trigger
DROP TRIGGER IF EXISTS on_inventory_image_change ON inventory_items;

CREATE TRIGGER on_inventory_image_change
AFTER INSERT OR UPDATE OF image_url, name
ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION sync_inventory_image_to_product();

-- 3. Run One-Off Sync (Fix existing broken images)
DO $$
BEGIN
    -- Update all products that have matching inventory items with images
    -- This fixes the current state
    UPDATE products p
    SET image_url = i.image_url
    FROM inventory_items i
    WHERE p.store_id = i.store_id
      AND LOWER(TRIM(p.name)) = LOWER(TRIM(i.name))
      AND i.image_url IS NOT NULL 
      AND i.image_url <> ''
      AND (p.image_url IS NULL OR p.image_url = '');
      
    -- Optional: Force overwrite even if product has image? 
    -- Let's only overwrite if product image seems broken (active decision).
    -- For now, the clause above (p.image_url IS NULL...) is safer to avoid overwriting custom product images.
END $$;
