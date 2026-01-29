SELECT 
    event_object_table AS table_name, 
    trigger_name, 
    event_manipulation AS trigger_event,
    action_timing AS activation,
    action_statement AS definition
FROM information_schema.triggers
WHERE event_object_table = 'orders'
ORDER BY trigger_name;
