-- Inspect Order Number generation logic
SELECT 
    column_name, 
    data_type, 
    column_default 
FROM information_schema.columns 
WHERE table_name = 'orders' 
AND column_name IN ('order_number', 'id');

-- Check if there is a sequence attached
SELECT * FROM pg_sequences WHERE sequencename LIKE '%order%';
