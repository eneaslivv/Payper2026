
SELECT 
    table_name, 
    column_name, 
    data_type 
FROM 
    information_schema.columns 
WHERE 
    table_name IN ('dispatch_stations', 'storage_locations', 'orders')
ORDER BY 
    table_name, ordinal_position;
