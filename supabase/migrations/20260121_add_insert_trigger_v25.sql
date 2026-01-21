-- Migration: Add INSERT Trigger for Stock Deduction (V25)
-- Created: 2026-01-21
-- Problem: Orders can be created directly with 'served' status, bypassing the UPDATE-only trigger.
-- Solution: Add an AFTER INSERT trigger that also calls deduct_order_stock if status qualifies.

-- 1. Create a wrapper function for INSERT that manually calls UPDATE to fire the existing trigger
-- This is cleaner than duplicating logic in a new INSERT trigger
CREATE OR REPLACE FUNCTION public.handle_stock_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- If order is created with a "delivery" status, manually invoke the deduction logic
    IF NEW.status IN ('Entregado', 'served', 'delivered') AND NEW.stock_deducted = FALSE THEN
        -- Call the existing trigger logic by invoking the function directly
        -- We simulate the trigger context
        PERFORM deduct_order_stock_manual(NEW.id);
    END IF;
    
    RETURN NEW;
END;
$function$;

-- 2. Create Helper RPC to manually deduct (Wrapper for the core logic, used by INSERT trigger)
-- This avoids rewriting the entire logic and reuses the existing RPC
CREATE OR REPLACE FUNCTION public.deduct_order_stock_manual(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_recipe_item RECORD;
    v_addon_id UUID;
    v_addon RECORD;
    v_deduction_qty NUMERIC;
    v_target_location_id UUID;
    v_default_location_id UUID;
    v_item_qty NUMERIC;
    v_product_id UUID;
    v_has_recipe BOOLEAN;
    v_unit_type TEXT;
BEGIN
    -- Get Order Info
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;
    IF v_order.stock_deducted THEN RETURN; END IF; -- Idempotency

    -- Get Default Location for Store
    SELECT id INTO v_default_location_id 
    FROM storage_locations 
    WHERE store_id = v_order.store_id AND is_default = TRUE 
    LIMIT 1;

    v_target_location_id := COALESCE(v_order.location_id, v_default_location_id);

    -- Iterate Order Items
    FOR v_item IN 
        SELECT * FROM order_items WHERE order_id = p_order_id
    LOOP
        v_item_qty := v_item.quantity;
        v_product_id := v_item.product_id;
        v_has_recipe := FALSE;

        -- CHECK RECIPE
        FOR v_recipe_item IN 
            SELECT * FROM product_recipes WHERE product_id = v_product_id
        LOOP
            v_has_recipe := TRUE;
            v_deduction_qty := v_recipe_item.quantity_required * v_item_qty;
            
            SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_recipe_item.inventory_item_id;

            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
            VALUES (gen_random_uuid(), v_order.store_id, v_recipe_item.inventory_item_id, p_order_id, -v_deduction_qty, COALESCE(v_unit_type, 'unit'), 'recipe_consumption', v_target_location_id);
        END LOOP;

        -- IF NO RECIPE -> DIRECT SALE
        IF NOT v_has_recipe THEN
             SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_product_id;
             
             INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
             VALUES (gen_random_uuid(), v_order.store_id, v_product_id, p_order_id, -v_item_qty, COALESCE(v_unit_type, 'unit'), 'direct_sale', v_target_location_id);
        END IF;

        -- ADDONS
        IF v_item.addon_ids IS NOT NULL AND jsonb_typeof(v_item.addon_ids) = 'array' THEN
             FOR v_addon_id IN SELECT (val::text)::UUID FROM jsonb_array_elements_text(v_item.addon_ids) val
             LOOP
                  SELECT pa.inventory_item_id, pa.quantity_consumed, ii.unit_type 
                  INTO v_addon 
                  FROM product_addons pa
                  JOIN inventory_items ii ON ii.id = pa.inventory_item_id
                  WHERE pa.id = v_addon_id;

                  IF v_addon.inventory_item_id IS NOT NULL THEN
                       v_deduction_qty := COALESCE(v_addon.quantity_consumed, 1) * v_item_qty;
                       INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
                       VALUES (gen_random_uuid(), v_order.store_id, v_addon.inventory_item_id, p_order_id, -v_deduction_qty, v_addon.unit_type, 'recipe_consumption', v_target_location_id);
                  END IF;
             END LOOP;
        END IF;

    END LOOP;

    -- Mark Order as Deducted
    UPDATE orders SET stock_deducted = TRUE WHERE id = p_order_id;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[deduct_order_stock_manual] Error in order %: %', p_order_id, SQLERRM;
END;
$function$;

-- 3. Create the INSERT Trigger
DROP TRIGGER IF EXISTS trg_deduct_stock_on_insert ON public.orders;
CREATE TRIGGER trg_deduct_stock_on_insert
    AFTER INSERT ON public.orders
    FOR EACH ROW
    WHEN (NEW.status IN ('Entregado', 'served', 'delivered'))
    EXECUTE FUNCTION handle_stock_on_insert();
