-- Inspect products table columns to find the correct image column name
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'products'
ORDER BY column_name;
