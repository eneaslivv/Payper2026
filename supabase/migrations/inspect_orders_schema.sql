-- Inspect orders table columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders'
ORDER BY column_name;
