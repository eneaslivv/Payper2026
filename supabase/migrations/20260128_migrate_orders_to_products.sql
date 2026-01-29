-- PASO 2: MIGRACIÓN DE DATOS REVERSA
-- Requiere haber ejecutado '20260128_map_inventory_to_products.sql' antes.

BEGIN;

-- 1. Backup de Seguridad (CRITICAL)
CREATE TABLE IF NOT EXISTS order_items_backup_20260128 AS 
SELECT * FROM order_items 
WHERE product_id IN (SELECT inventory_item_id FROM inventory_product_mapping);

-- 2. Actualizar order_items
-- Reemplaza el ID de inventory_item con el ID del producto correspondiente
UPDATE order_items 
SET product_id = map.product_id
FROM inventory_product_mapping map
WHERE order_items.product_id = map.inventory_item_id;

-- 3. Actualizar tipos en inventory_items
-- Marcar como 'ingredient' aquellos items que fueron migrados y ya no deberían venderse directamente
UPDATE inventory_items 
SET item_type = 'ingredient'
WHERE id IN (SELECT inventory_item_id FROM inventory_product_mapping);

-- 4. Crear índices para asegurar performance y evitar futuros cruces
CREATE INDEX IF NOT EXISTS idx_order_items_product_optim ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_prod_recipes_prod_optim ON product_recipes(product_id);

-- 5. Crear Recetas Automáticas (Opcional/Avanzado)
-- Si acabamos de convertir un inventory_item en un product, DEBERIAMOS crear una receta 1:1
-- Para que el stock se siga descontando del inventory_item original.
INSERT INTO product_recipes (id, product_id, inventory_item_id, quantity_required)
SELECT 
    gen_random_uuid(),
    map.product_id,
    map.inventory_item_id,
    1 -- 1 unidad de producto consume 1 unidad de inventario
FROM inventory_product_mapping map
WHERE map.action_taken = 'CREATED' -- Solo para los nuevos creados, para preservar lógica
AND NOT EXISTS (
    SELECT 1 FROM product_recipes pr WHERE pr.product_id = map.product_id
);

COMMIT;
