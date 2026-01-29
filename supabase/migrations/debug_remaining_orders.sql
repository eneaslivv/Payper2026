-- DEBUG SCRIPT: Inspect remaining 5 stuck orders
-- 1. Identify valid candidates
-- 2. Attempt verbose deduction for the first one to capture the specific error

DO $$
DECLARE
    v_order_id UUID;
    v_order RECORD;
    v_debug_msg TEXT;
BEGIN
    -- 1. Find one of the stuck orders
    SELECT id INTO v_order_id 
    FROM orders 
    WHERE is_paid = true 
    AND stock_deducted = false 
    AND status NOT IN ('cancelled', 'draft')
    LIMIT 1;

    IF v_order_id IS NULL THEN
        RAISE NOTICE '✅ No stuck orders found!';
        RETURN;
    END IF;

    RAISE NOTICE '🔍 Debugging Order: %', v_order_id;

    -- 2. Select full order details
    SELECT * INTO v_order FROM orders WHERE id = v_order_id;
    RAISE NOTICE 'Order Items: %', v_order.items;
    RAISE NOTICE 'Store ID: %', v_order.store_id;

    -- 3. Check Location
    DECLARE
        v_loc_id UUID;
    BEGIN
        SELECT id INTO v_loc_id FROM storage_locations WHERE store_id = v_order.store_id AND is_default = true LIMIT 1;
        RAISE NOTICE 'Target Location ID: %', COALESCE(v_loc_id::text, 'NULL (Using Global)');
    END;

    -- 4. Attempt to simulate Trigger Logic (Simplified)
    -- We just want to see if the Foreign Key constraint for specific items still fails or if it's something else
    
    -- FORCE UPDATE to trigger the function and capture the Postgres NOTICE/WARNING logs
    -- This update doesn't change data but fires the trigger
    UPDATE orders 
    SET updated_at = NOW() 
    WHERE id = v_order_id;

    RAISE NOTICE '⚠️ Check the "Messages" tab for any warnings from finalize_order_stock!';

END $$;

-- 5. List all 5 stuck orders for context
SELECT 
    id, 
    created_at, 
    status, 
    delivery_status, 
    stock_deducted,
    jsonb_array_length(items) as item_count 
FROM orders 
WHERE is_paid = true 
AND stock_deducted = false 
AND status NOT IN ('cancelled', 'draft');
