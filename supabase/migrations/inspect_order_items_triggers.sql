-- Inspect triggers on order_items
SELECT 
    trigger_name, 
    event_manipulation, 
    action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'order_items';
