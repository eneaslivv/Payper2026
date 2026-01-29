-- ULTIMATE AUDIT: Using explicit Store ID from logs
-- Logs show store_id: f5e3bfcf-3ccc-4464-9eb5-4314a6c2bb33
SELECT 
    status,
    is_paid,
    COUNT(*) as quantity
FROM orders
WHERE store_id = 'f5e3bfcf-3ccc-4464-9eb5-4314a6c2bb33'
AND status NOT IN ('served', 'cancelled')
AND archived_at IS NULL
GROUP BY 1, 2;
