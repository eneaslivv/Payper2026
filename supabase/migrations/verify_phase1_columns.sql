-- Verifying usage of columns referenced in Phase 1 plan
SELECT 
    table_name, 
    column_name, 
    data_type 
FROM information_schema.columns 
WHERE 
    (table_name = 'orders' AND column_name IN ('source_location_id', 'delivery_status'))
    OR 
    (table_name = 'storage_locations' AND column_name = 'is_default');
