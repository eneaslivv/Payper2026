-- Query to strictly inspect the clients table columns
-- Run this in the Supabase SQL Editor
SELECT 
    column_name, 
    data_type, 
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'clients' 
AND table_schema = 'public'
ORDER BY ordinal_position;
