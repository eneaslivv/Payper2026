-- DEBUG SCRIPT: Force Deduct & Reveal Error
-- Target Order: 64d6552e-3669-4e1c-b924-83fa6c83f47d

DO $$
DECLARE
    v_order_id UUID := '64d6552e-3669-4e1c-b924-83fa6c83f47d';
    v_order RECORD;
    v_default_loc UUID;
    v_target_loc UUID;
BEGIN
    -- 1. Check Order
    SELECT * INTO v_order FROM orders WHERE id = v_order_id;
    RAISE NOTICE 'Order Store: %', v_order.store_id;

    -- 2. Check Location
    SELECT id INTO v_default_loc FROM storage_locations 
    WHERE store_id = v_order.store_id AND is_default = TRUE LIMIT 1;
    
    RAISE NOTICE 'Default Location Found: %', v_default_loc;
    RAISE NOTICE 'Default Location Found: %', v_default_loc;
    -- RAISE NOTICE 'Order Location: %', v_order.location_id; -- Column does not exist

    v_target_loc := v_default_loc;
    
    IF v_target_loc IS NULL THEN
        RAISE WARNING 'CRITICAL: No Target Location resolved!';
    END IF;

    -- 3. Attempt Manual Update to Trigger Logic (Simulated)
    -- We'll try to update the order to force the trigger to run.
    -- Since stock_deducted is FALSE, an UPDATE to status or other field *should* fire 'trg_finalize_stock_v6_update'.
    
    UPDATE orders 
    SET updated_at = NOW() 
    WHERE id = v_order_id;
    
    RAISE NOTICE 'Update executed. Check stock_deducted column status...';

END $$;

-- 4. Check Result after update
SELECT id, stock_deducted, status FROM orders WHERE id = '64d6552e-3669-4e1c-b924-83fa6c83f47d';

-- 5. Inspect Triggers existence to be sure
SELECT trigger_name, action_statement FROM information_schema.triggers WHERE event_object_table = 'orders' AND trigger_name LIKE '%v6%';
