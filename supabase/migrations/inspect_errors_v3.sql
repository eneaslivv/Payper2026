-- =============================================
-- DIAGNOSTIC SCRIPT: Orders Triggers & Item Check
-- =============================================

-- 1. Check if 'test cafe' exists in inventory_items with the EXPECTED ID
SELECT 
    id, 
    name, 
    store_id, 
    is_active, 
    is_menu_visible 
FROM inventory_items 
WHERE id = '95c3434e-c2cc-4191-bb37-3f058757c966';

-- 2. Check columns in ORDERS table (looking for customer_email)
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'orders' 
ORDER BY column_name;

-- 3. Check TRIGGERS on ORDERS table (to find the one accessing customer_email)
SELECT 
    trigger_name, 
    event_manipulation, 
    action_statement 
FROM information_schema.triggers 
WHERE event_object_table = 'orders';

-- 4. Check FUNCTION definitions that might be called by triggers
-- Searching for 'customer_email' in all function definitions
SELECT 
    routine_name, 
    routine_definition 
FROM information_schema.routines 
WHERE routine_definition ILIKE '%customer_email%'
  AND routine_schema = 'public';
