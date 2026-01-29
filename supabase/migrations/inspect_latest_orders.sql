-- Inspect latest orders to see why they might not appear in Dispatch
-- "test cafe" order should be the most recent one.

SELECT 
    id,
    order_number,
    status,
    payment_status,
    is_paid,
    dispatch_station,
    created_at,
    total_amount,
    store_id,
    payment_method
FROM orders
ORDER BY created_at DESC
LIMIT 5;
