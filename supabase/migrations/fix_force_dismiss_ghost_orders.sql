-- CLEANUP: FORCE DISMISS GHOST ORDERS
-- These 5 orders are confirmed Cross-Store Mismatches (Test Data).
-- We cannot deduct stock for them, so we just mark them as 'deducted' to clear the queue.

DO $$
DECLARE
    v_ghost_ids UUID[] := ARRAY[
        '44e362d6-338c-4d58-98ac-db29a5262af5',
        '4c0229c5-11fd-484b-9f86-ab222b4c5327',
        'c3a6aaf5-f6e8-4ee4-9775-1c63d3e905b9',
        'abd95ebe-9511-4849-aa3f-ff247eb5f2e9',
        '8db34a74-4c40-4018-a560-235de641b2d6'
    ]::UUID[];
    v_id UUID;
BEGIN
    FOREACH v_id IN ARRAY v_ghost_ids
    LOOP
        -- Disable trigger logic for this specific update by setting stock_deducted=TRUE directly
        -- The trigger 'finalize_order_stock' checks "IF NEW.stock_deducted = TRUE THEN RETURN NEW;"
        -- So manually setting it to TRUE bypasses the logic.
        
        UPDATE orders 
        SET 
            stock_deducted = TRUE,
            delivery_status = 'delivered', -- Ensure they look clean in UI
            status = 'served',
            updated_at = NOW()
        WHERE id = v_id;
        
        RAISE NOTICE '👻 Ghost Order dismissed: %', v_id;
    END LOOP;
    
    RAISE NOTICE '✅ CLEANUP COMPLETE. The queue should be empty.';
END $$;
