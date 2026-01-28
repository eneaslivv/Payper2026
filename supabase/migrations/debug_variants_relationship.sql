-- Diagnóstico de Relación Inventory <-> Products

-- 1. Verificación básica de tablas
SELECT 
    (SELECT count(*) FROM inventory_items) as total_inventory_items,
    (SELECT count(*) FROM products) as total_products,
    (SELECT count(*) FROM inventory_items WHERE variants IS NOT NULL AND jsonb_array_length(variants) > 0) as items_with_variants;

-- 2. Verificar Superposición de IDs
-- ¿Cuántos de los items con variantes "existen" en la tabla products?
SELECT count(*) as matching_product_ids
FROM inventory_items ii
JOIN products p ON p.id = ii.id
WHERE ii.variants IS NOT NULL AND jsonb_array_length(ii.variants) > 0;

-- 3. Ver 5 ejemplos de IDs que tienen variantes pero NO match
SELECT ii.id, ii.name 
FROM inventory_items ii
WHERE ii.variants IS NOT NULL 
  AND jsonb_array_length(ii.variants) > 0
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = ii.id)
LIMIT 5;
