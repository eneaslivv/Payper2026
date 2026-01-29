-- FINAL DIAGNOSTIC & FIX SCRIPT
-- 1. Fixes the 4 orders that were 'served' but not 'delivered'
-- 2. Forces the '8db34a74' order to execute logic and BOMBS OUT with the specific error if it fails

-- PART 1: FIX STATUS MISMATCH (The 4 orders)
UPDATE orders 
SET 
    delivery_status = 'delivered', 
    delivered_at = NOW(),
    delivered_by = '7336e802-9ebf-4399-a7f9-f6178c79dee4', -- System/Admin
    updated_at = NOW()
WHERE is_paid = true 
AND stock_deducted = false 
AND status = 'served' 
AND delivery_status != 'delivered';

-- PART 2: VERBOSE DEBUG FOR THE STUBBORN ORDER
DO $$
DECLARE
    v_order_id UUID := '8db34a74-4c40-4018-a560-235de641b2d6';
    v_order RECORD;
    v_items JSONB;
    v_item JSONB;
    v_item_qty NUMERIC;
    v_product_id UUID;
    v_inventory_id UUID;
    v_store_id UUID;
    v_default_loc_id UUID;
BEGIN
    SELECT * INTO v_order FROM orders WHERE id = v_order_id;
    v_store_id := v_order.store_id;
    v_items := v_order.items;

    RAISE NOTICE '👉 Processing Order: %', v_order_id;
    RAISE NOTICE '👉 Items Payload: %', v_items;

    -- Get Location
    SELECT id INTO v_default_loc_id FROM storage_locations WHERE store_id = v_store_id AND is_default = TRUE LIMIT 1;
    RAISE NOTICE '👉 Target Location: %', v_default_loc_id;

    -- Iterate Items (Simulating Logic)
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        v_product_id := COALESCE(
            (v_item->>'productId')::UUID, 
            (v_item->>'product_id')::UUID,
            (v_item->>'id')::UUID
        );

        RAISE NOTICE '   👉 Item: % (Qty: %)', v_product_id, v_item_qty;
        
        -- CHECK IF INVENTORY ITEM EXISTS
        SELECT id INTO v_inventory_id FROM inventory_items WHERE id = v_product_id;
        
        IF v_inventory_id IS NOT NULL THEN
             RAISE NOTICE '   ✅ Inventory Item Found: %', v_inventory_id;
        ELSE
             RAISE NOTICE '   ❌ Inventory Item NOT FOUND for Product %', v_product_id;
             -- This might be the cause?
             -- Check if it has recipe
             DECLARE
                v_recipe_count INT;
             BEGIN
                SELECT count(*) INTO v_recipe_count FROM product_recipes WHERE product_id = v_product_id;
                RAISE NOTICE '   ℹ️ Recipe Ingredients Count: %', v_recipe_count;
             END;
        END IF;

    END LOOP;

    -- FORCE TRIGGER EXECUTION
    -- We update a dummy field to fire the trigger
    UPDATE orders 
    SET updated_at = NOW() 
    WHERE id = v_order_id;
    
    -- Check if it worked
    DECLARE
        v_deducted BOOLEAN;
    BEGIN
        SELECT stock_deducted INTO v_deducted FROM orders WHERE id = v_order_id;
        IF v_deducted THEN
            RAISE NOTICE '🎉 SUCCESSS! Stock Deducted is TRUE';
        ELSE
            -- THIS IS THE CRITICAL PART: WE WANT TO KNOW WHY IT FAILED
            -- Since the trigger swallows the error, we can't see it easily here unless we look at messages.
            -- BUT, we can check if stock_movements were created?
            DECLARE
                v_mov_count INT;
            BEGIN
                SELECT count(*) INTO v_mov_count FROM stock_movements WHERE order_id = v_order_id;
                RAISE NOTICE '   ℹ️ Stock Movements Created: %', v_mov_count;
                IF v_mov_count = 0 THEN
                     RAISE EXCEPTION '💀 TRIGGER RAN BUT NO STOCK MOVEMENTS CREATED. Check Input Data/Foreign Keys!';
                END IF;
            END;
        END IF;
    END;

EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '🚨 ERROR FINAL: %', SQLERRM;
END $$;
