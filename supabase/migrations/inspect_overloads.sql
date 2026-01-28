SELECT 
    proname, 
    pg_get_function_arguments(oid) as args,
    pg_get_function_identity_arguments(oid) as identity_args,
    prosrc
FROM pg_proc 
WHERE proname = 'consume_from_open_packages';
