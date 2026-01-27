-- Auditoría Técnica de Tablas Fantasma

-- 1. ¿Stock Movements está vivo? (Debe ser > 0)
SELECT count(*) as stock_movements_count FROM stock_movements;

-- 2. ¿Variantes viven en JSON o en Tabla? 
-- Si items_with_variants_json > 0 y variant_table_rows = 0, el sync falló o no corre.
SELECT 
    count(*) as items_with_variants_json,
    (SELECT count(*) FROM product_variants) as variant_table_rows
FROM inventory_items 
WHERE variants IS NOT NULL 
AND jsonb_array_length(variants) > 0;

-- 3. Ver qué triggers tiene inventory_items
SELECT trigger_name 
FROM information_schema.triggers 
WHERE event_object_table = 'inventory_items';
