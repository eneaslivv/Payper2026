-- AUDITORÍA DE USO HÍBRIDO (Directo vs Receta)
-- Objetivo: Identificar qué items se están comportando de manera híbrida en la realidad.

-- 1. Resumen: Items que son Venta Directa e Ingrediente a la vez
SELECT 
    i.id,
    i.name,
    i.item_type,
    COUNT(DISTINCT oi.id) as total_direct_sales_30d, -- Veces vendido solo
    COUNT(DISTINCT pr.id) as usage_in_recipes_prod  -- Veces usado en receta de producto
FROM inventory_items i
LEFT JOIN order_items oi ON oi.product_id = i.id AND oi.created_at > NOW() - INTERVAL '30 days'
LEFT JOIN product_recipes pr ON pr.inventory_item_id = i.id
-- LEFT JOIN inventory_item_recipes ir ON ir.ingredient_item_id = i.id -- REMOVIDO: Tabla aun no existe
WHERE i.store_id = 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533'
GROUP BY i.id, i.name, i.item_type
HAVING COUNT(DISTINCT oi.id) > 0 OR COUNT(DISTINCT pr.id) > 0
ORDER BY total_direct_sales_30d DESC, usage_in_recipes_prod DESC;

-- 2. Detección de Confusión de Nombres
-- Items en 'products' y 'inventory_items' con el mismo nombre normalizado.
SELECT 
    p.name as product_name,
    i.name as inventory_name,
    p.id as product_id,
    i.id as inventory_id,
    'POSIBLE DUPLICADO' as problem
FROM products p
JOIN inventory_items i ON TRIM(LOWER(p.name)) = TRIM(LOWER(i.name))
WHERE p.store_id = 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533'
AND i.store_id = 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';

-- 3. Verificación de Recetas Rotas (IDs cruzados)
-- Buscar recetas en product_recipes que apunten a un ID que NO está en products (si no hubiera FK).
-- Como hay FK, esto debería estar limpio, pero verificamos si hay recetas vacías o raras.
SELECT * FROM product_recipes 
WHERE quantity_required <= 0 OR quantity_required IS NULL;
