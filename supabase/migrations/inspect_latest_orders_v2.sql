-- =========================================================
-- DIAGNOSTIC: Check Latest Orders Visibility
-- =========================================================
SELECT 
    id,
    order_number,
    status,               -- pending, preparing, ready, served?
    is_paid,
    payment_status,
    payment_method,
    dispatch_station,     -- Is this NULL? If so, might be hidden by station filters
    created_at,           -- Check timezone (is it today?)
    store_id
FROM orders
ORDER BY created_at DESC
LIMIT 5;
