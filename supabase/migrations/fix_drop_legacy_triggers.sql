-- FIX TRIGGER CONFLICT
-- Dropping legacy stock deduction triggers that clash with the new V6 logic.

-- 1. Drop the legacy "Unified" trigger which is causing the 'tuple modified' error
DROP TRIGGER IF EXISTS trg_deduct_stock_unified ON orders;

-- 2. Drop the corresponding function if it's no longer needed (Cleanup)
DROP FUNCTION IF EXISTS handle_stock_deduction_trigger();

-- 3. Verify V6 is the only stock trigger left
SELECT 
    trigger_name, 
    action_timing, 
    event_manipulation 
FROM information_schema.triggers 
WHERE event_object_table = 'orders' 
AND trigger_name LIKE '%stock%';
