-- Inspect triggers on orders table
SELECT 
    trigger_name, 
    event_manipulation, 
    action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'orders';
