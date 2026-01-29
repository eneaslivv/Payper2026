-- Inspect functions relevant to 'deliver' or 'update_status' to find duplicates
SELECT routine_name, specific_name, data_type, type_udt_name, external_language
FROM information_schema.routines
WHERE routine_name ILIKE '%deliver%' OR routine_name ILIKE '%status%'
ORDER BY routine_name;
