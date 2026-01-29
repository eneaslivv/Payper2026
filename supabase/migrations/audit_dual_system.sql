-- 1. Count orders by data source (JSONB vs Table vs Both)
SELECT 
    COUNT(*) as total_orders,
    COUNT(CASE WHEN items IS NOT NULL AND items != '[]'::jsonb THEN 1 END) as con_jsonb,
    COUNT(CASE WHEN EXISTS(
        SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id
    ) THEN 1 END) as con_tabla,
    COUNT(CASE WHEN (items IS NOT NULL AND items != '[]'::jsonb) AND EXISTS(
        SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id
    ) THEN 1 END) as con_ambos,
    COUNT(CASE WHEN (items IS NULL OR items = '[]'::jsonb) AND NOT EXISTS(
        SELECT 1 FROM order_items oi WHERE oi.order_id = orders.id
    ) THEN 1 END) as con_ninguno
FROM orders;

-- 2. Orders with ONLY JSONB (Missing from table - Critical for migration)
SELECT id, created_at, jsonb_array_length(items) as item_count
FROM orders
WHERE items IS NOT NULL 
AND items != '[]'::jsonb
AND NOT EXISTS(
    SELECT 1 FROM order_items WHERE order_id = orders.id
)
ORDER BY created_at DESC
LIMIT 5;

-- 3. Orders with ONLY Table (Clean state)
SELECT o.id, o.created_at, COUNT(oi.id) as item_count
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.items IS NULL OR o.items = '[]'::jsonb
GROUP BY o.id, o.created_at
ORDER BY o.created_at DESC
LIMIT 5;
