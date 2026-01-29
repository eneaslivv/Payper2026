-- Check columns of order_items
SELECT 
    column_name, 
    data_type, 
    is_nullable 
FROM information_schema.columns 
WHERE table_name = 'order_items' 
ORDER BY column_name;
