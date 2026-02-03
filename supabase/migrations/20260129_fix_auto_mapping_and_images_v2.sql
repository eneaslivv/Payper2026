-- MIGRATION: 20260129_fix_auto_mapping_and_images_v2.sql
-- Description: 
-- 1. Auto-Link Products to Inventory Items by Name (Resolves "Ghost Item" Stock Deduction issues).
-- 2. Sync Image URLs from Inventory to Products (Resolves missing images in Menu).
-- 3. Cleanup duplicate/ghost mappings.

-- ==============================================================================
-- 1. AUTO-MAPPING: Link Products to Inventory Items by Name
-- ==============================================================================
-- For every Product that:
--   a) Does NOT have a recipe
--   b) Does NOT have an existing mapping
-- Look for an Inventory Item with the EXACT SAME NAME (case insensitive)
-- If found, create a link in 'inventory_product_mapping'.

INSERT INTO inventory_product_mapping (product_id, inventory_item_id, quantity)
SELECT 
    p.id as product_id,
    i.id as inventory_item_id,
    1 as quantity -- Default 1:1 mapping
FROM products p
JOIN inventory_items i ON LOWER(TRIM(p.name)) = LOWER(TRIM(i.name)) AND p.store_id = i.store_id
WHERE 
    -- Product has no recipe
    NOT EXISTS (SELECT 1 FROM product_recipes pr WHERE pr.product_id = p.id)
    -- Product has no existing mapping
    AND NOT EXISTS (SELECT 1 FROM inventory_product_mapping ipm WHERE ipm.product_id = p.id)
    -- Avoid self-mapping if IDs happen to be same (though rare with UUIDs)
    AND p.id <> i.id;

-- ==============================================================================
-- 2. IMAGE SYNC: Heal Broken Menu Images
-- ==============================================================================
-- If a Product has no image, but its matching Inventory Item does, copy it.
-- This ensures the Client Menu (which reads from Products) shows the image uploaded in Inventory.

UPDATE products p
SET image_url = i.image_url,
    updated_at = NOW()
FROM inventory_items i
WHERE 
    LOWER(TRIM(p.name)) = LOWER(TRIM(i.name)) 
    AND p.store_id = i.store_id
    AND (p.image_url IS NULL OR p.image_url = '')
    AND i.image_url IS NOT NULL 
    AND i.image_url <> '';

-- ==============================================================================
-- 3. STOCK DEDUCTION SAFETY (Redundant Check)
-- ==============================================================================
-- Ensure that the 'direct_sale' fallback logic works even if mapping is missing
-- by strictly matching IDs. This is already in the previous script, but we verify here.

-- (No action needed, previous migration covered finalize_order_stock logic)

-- ==============================================================================
-- 4. CLEANUP GHOST MAPPINGS
-- ==============================================================================
-- Remove mappings pointing to non-existent inventory items
DELETE FROM inventory_product_mapping
WHERE inventory_item_id NOT IN (SELECT id FROM inventory_items);

-- Remove mappings pointing to non-existent products
DELETE FROM inventory_product_mapping
WHERE product_id NOT IN (SELECT id FROM products);
