-- Migration: Sync Orphan Inventory Items to Products
-- Context: 3 items exist in inventory_items with variants but are missing from products table.
-- Action: Insert missing products to satisfy FK constraint and allow variant backfill.

BEGIN;

-- 1. Insert missing products from inventory_items
INSERT INTO products (
    id,
    store_id,
    name,
    description,
    sku,
    base_price, -- Mapping 'cost' or default 0 if price not found, usually inventory_items has 'price' or 'cost'
    active,
    is_available,
    tax_rate,
    created_at,
    updated_at
)
SELECT 
    ii.id,
    ii.store_id,
    ii.name,
    ii.description,
    ii.sku,
    COALESCE(ii.price, ii.cost, 0), -- Best effort price mapping
    true, -- active
    true, -- is_available
    0, -- tax_rate default
    now(),
    now()
FROM inventory_items ii
WHERE ii.variants IS NOT NULL 
  AND jsonb_array_length(ii.variants) > 0
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = ii.id);

-- 2. NOW we can safely backfill the variants (Copy of the previous backfill script logic)
-- Limpiar tabla por si acaso (Idempotencia)
DELETE FROM product_variants;

-- Insertar DIRECTAMENTE desde el JSON
INSERT INTO product_variants (id, product_id, tenant_id, name, price_delta, recipe_overrides)
SELECT 
    CASE 
        WHEN (v->>'id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN (v->>'id')::UUID 
        ELSE gen_random_uuid() 
    END,
    ii.id, -- inventory_item_id is product_id here
    ii.store_id,
    v->>'name',
    (COALESCE(v->>'price_adjustment', '0'))::NUMERIC,
    v->'recipe_overrides'
FROM inventory_items ii,
     jsonb_array_elements(ii.variants) v
WHERE ii.variants IS NOT NULL 
  AND jsonb_array_length(ii.variants) > 0;
  -- No need for exists check anymore since we just inserted them

COMMIT;
