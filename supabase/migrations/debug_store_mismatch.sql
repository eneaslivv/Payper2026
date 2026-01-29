-- DEBUG: STORE MISMATCH DETECTIVE
-- Analyzing Order 8db34a74 vs its Items

DO $$
DECLARE
    v_order_id UUID := '8db34a74-4c40-4018-a560-235de641b2d6';
    v_order_store_id UUID;
    v_item RECORD;
    v_item_id UUID;
    v_inv_store_id UUID;
    v_prod_store_id UUID;
    v_report TEXT := '';
BEGIN
    SELECT store_id INTO v_order_store_id FROM orders WHERE id = v_order_id;
    
    v_report := v_report || '📦 Order Store ID: ' || v_order_store_id || E'\n';
    v_report := v_report || '--------------------------------------------------' || E'\n';

    -- Analyze the Panceta Item
    v_item_id := 'a4b6c6cc-a190-4946-a453-d289c6d64087'; -- Panceta ID from JSON
    
    -- Check Product ownership
    SELECT store_id INTO v_prod_store_id FROM products WHERE id = v_item_id;
    v_report := v_report || '🍖 Item (Product): ' || v_item_id || ' | Store: ' || COALESCE(v_prod_store_id::text, 'NOT FOUND') || E'\n';
    
    -- Check Inventory ownership
    SELECT store_id INTO v_inv_store_id FROM inventory_items WHERE id = v_item_id;
    v_report := v_report || '🏭 Item (Inventory): ' || v_item_id || ' | Store: ' || COALESCE(v_inv_store_id::text, 'NOT FOUND') || E'\n';

    -- Conclusion
    IF v_order_store_id != v_inv_store_id THEN
         v_report := v_report || E'\n🔥 CRITICAL MISMATCH: Order is in Store ' || v_order_store_id || ' but Item belongs to Store ' || v_inv_store_id || '!';
         v_report := v_report || E'\nℹ️ The Trigger tries to insert stock_movement with Order Store ID, but Item belongs to another Store. Foreign Key likely blocks this OR logic skips it.';
    ELSE
         v_report := v_report || E'\n✅ Store IDs match. Problem is elsewhere.';
    END IF;

    -- Raise the full report as an Exception so it's visible in the UI error banner
    RAISE EXCEPTION '%', v_report;

END $$;
