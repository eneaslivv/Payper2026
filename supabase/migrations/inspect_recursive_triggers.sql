-- Inspect Triggers for Recursion
SELECT 
    event_object_table as table_name,
    trigger_name,
    event_manipulation as event,
    action_timing as timing,
    action_statement as definition
FROM information_schema.triggers
WHERE event_object_table IN ('orders', 'stock_movements')
ORDER BY event_object_table, action_timing, trigger_name;
