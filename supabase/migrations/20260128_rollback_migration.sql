-- PASO 3: ROLLBACK (EMERGENCIA)
-- Ejecutar solo si la migración rompe la integridad de datos.

BEGIN;

-- 1. Restaurar order_items desde backup
-- Solo restauramos los registros que tocamos (IDs en inventory_product_mapping)
-- O mejor, restauramos updateando desde el backup usando el ID del item como clave
UPDATE order_items oi
SET product_id = backup.product_id
FROM order_items_backup_20260128 backup
WHERE oi.id = backup.id;

-- 2. Revertir tipos en inventory_items
-- No podemos saber exactamente cuál era 'sellable' vs 'ingredient' solo con el backup,
-- pero podemos revertir los que están en el mapa.
UPDATE inventory_items 
SET item_type = 'sellable' -- Asumimos que si estaba vendiéndose, era sellable o NULL
WHERE id IN (SELECT inventory_item_id FROM inventory_product_mapping);

-- 3. Borrar recetas automáticas creadas
DELETE FROM product_recipes 
WHERE id IN (
    SELECT pr.id 
    FROM product_recipes pr
    JOIN inventory_product_mapping map ON pr.product_id = map.product_id
    WHERE map.action_taken = 'CREATED'
    AND pr.quantity_required = 1
    AND pr.inventory_item_id = map.inventory_item_id
);

COMMIT;
