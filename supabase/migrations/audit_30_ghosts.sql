-- DEFINITIVE AUDIT FOR 30 GHOST ORDERS
-- This script grouping by EVERYTHING to find why they are counted but not visible
SELECT 
    status,
    is_paid,
    payment_method,
    payment_status,
    archived_at IS NOT NULL as is_archived,
    COUNT(*) as quantity,
    MIN(created_at) as oldest_order,
    MAX(created_at) as newest_order
FROM orders
WHERE store_id = (SELECT store_id FROM profiles WHERE email = 'livveneas@gmail.com' LIMIT 1)
AND status NOT IN ('served', 'cancelled')
AND archived_at IS NULL
GROUP BY 1, 2, 3, 4, 5
ORDER BY quantity DESC;
