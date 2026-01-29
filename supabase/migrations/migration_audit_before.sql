-- AUDITORÍA PRE-MIGRACIÓN
-- Objetivo: Documentar el estado actual de items vendibles vs ingredientes

-- 1. Items vendibles en inventory_items (Candidatos a migrar)
-- Buscamos items marcados como 'sellable' O que no tengan tipo definido, excluyendo ingredientes explícitos si se confía en esa etiqueta.
-- NOTA: Ajustar query si se sospecha de ingredientes mal etiquetados.
SELECT 
    id, 
    name, 
    item_type, 
    current_stock,
    store_id
FROM inventory_items
WHERE store_id = 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533'
AND (item_type = 'sellable' OR item_type IS NULL)
ORDER BY name;

-- 2. Productos existentes en products (Target)
SELECT 
    id, 
    name, 
    price,
    store_id
FROM products
WHERE store_id = 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533'
ORDER BY name;

-- 3. Uso en Order Items (Impacto Real - Últimos 30 días)
-- Determina cuántas órdenes están usando cada tabla como fuente.
SELECT DISTINCT 
    oi.product_id,
    CASE 
        WHEN p.id IS NOT NULL THEN p.name 
        WHEN i.id IS NOT NULL THEN i.name 
        ELSE 'UNKNOWN' 
    END as name,
    CASE 
        WHEN p.id IS NOT NULL THEN 'products' 
        WHEN i.id IS NOT NULL THEN 'inventory_items' 
        ELSE 'NONE' 
    END as source,
    COUNT(*) as order_count
FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id
LEFT JOIN inventory_items i ON i.id = oi.product_id
WHERE oi.created_at > NOW() - INTERVAL '30 days'
GROUP BY oi.product_id, p.id, p.name, i.id, i.name
ORDER BY order_count DESC;
