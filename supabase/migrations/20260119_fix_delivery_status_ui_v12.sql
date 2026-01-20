-- FIX: Update BOTH status columns to fix UI "Ready" vs "Delivered" mismatch (V12)
-- Priority: Critical
-- Reason: 
-- 1. Frontend looks at 'delivery_status' (expects 'delivered'), but RPC only updated 'status'.
-- 2. Check constraint 'stock_movements_reason_check' failed in V9 (fixed in V11 but reapplying here to be safe and complete).
-- 3. Updating 'inventory_location_stock' to fix "Stock Sellado" UI.

CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order_store_id UUID;
    v_status TEXT;
    v_is_paid BOOLEAN;
BEGIN
    SELECT status, is_paid, store_id
    INTO v_status, v_is_paid, v_order_store_id
    FROM orders WHERE id = p_order_id FOR UPDATE;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado');
    END IF;
    
    -- Force BOTH statuses to 'delivered'/'served' to satisfy Frontend and Backend
    UPDATE orders SET 
        status = 'served',             -- Backend Legacy Status
        delivery_status = 'delivered', -- Frontend UI Status (Critical for 'Entregado')
        delivered_at = NOW(),
        delivered_by = p_staff_id,
        updated_at = NOW()
    WHERE id = p_order_id;
    
    -- The trigger trg_finalize_stock will run here automatically
    -- Ensure trg_finalize_stock is robust (V11/V12 shared logic)

    RETURN jsonb_build_object('success', true, 'message', 'Orden entregada correctamente');
END;
$function$;

-- Ensure finalize_order_stock uses valid reasons and updates location stock (V11 Logic Redux)
CREATE OR REPLACE FUNCTION public.finalize_order_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order_id UUID;
    v_store_id UUID;
    v_items JSONB;
    v_item JSONB;
    v_item_qty NUMERIC;
    v_sellable_id UUID;
    v_variant_id UUID;
    v_recipe_multiplier NUMERIC;
    v_recipe_record RECORD;
    v_variant_record RECORD;
    v_location_id UUID;
BEGIN
    -- only run if paid/approved and not deducted
    IF (NEW.is_paid = TRUE OR NEW.payment_status IN ('paid', 'approved')) 
       AND NEW.stock_deducted = FALSE THEN
       
        v_order_id := NEW.id;
        v_store_id := NEW.store_id;
        v_items := NEW.items;

        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
             SELECT jsonb_agg(jsonb_build_object('id', product_id, 'quantity', quantity, 'variant_id', variant_id))
             INTO v_items FROM order_items WHERE order_id = v_order_id;
        END IF;

        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
            NEW.stock_deducted := TRUE;
            RETURN NEW;
        END IF;

        -- Get Default Location
        SELECT id INTO v_location_id FROM storage_locations WHERE store_id = v_store_id AND is_default = TRUE LIMIT 1;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
            v_sellable_id := (v_item->>'id')::UUID;
            v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);
            v_variant_id := (v_item->>'variant_id')::UUID;

            -- 1. Simple Item
            IF EXISTS (SELECT 1 FROM inventory_items WHERE id = v_sellable_id) THEN
                IF v_location_id IS NOT NULL THEN
                    INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
                    VALUES (v_store_id, v_sellable_id, v_location_id, -v_item_qty)
                    ON CONFLICT (store_id, item_id, location_id)
                    DO UPDATE SET closed_units = inventory_location_stock.closed_units - v_item_qty, updated_at = now();
                ELSE
                    UPDATE inventory_items SET current_stock = current_stock - v_item_qty WHERE id = v_sellable_id;
                END IF;
                -- USE VALID REASON: 'order_delivered'
                INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                VALUES (gen_random_uuid(), v_store_id, v_sellable_id, v_order_id, -v_item_qty, 'unit', 'order_delivered');
            END IF;

            -- 2. Recipes
            FOR v_recipe_record IN SELECT * FROM product_recipes WHERE product_id = v_sellable_id LOOP
                v_recipe_multiplier := COALESCE(v_recipe_record.quantity_required, 1);
                IF v_location_id IS NOT NULL THEN
                    INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
                    VALUES (v_store_id, v_recipe_record.inventory_item_id, v_location_id, -(v_item_qty * v_recipe_multiplier))
                    ON CONFLICT (store_id, item_id, location_id)
                    DO UPDATE SET closed_units = inventory_location_stock.closed_units - (v_item_qty * v_recipe_multiplier), updated_at = now();
                ELSE
                    UPDATE inventory_items SET current_stock = current_stock - (v_item_qty * v_recipe_multiplier) WHERE id = v_recipe_record.inventory_item_id;
                END IF;
                INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                VALUES (gen_random_uuid(), v_store_id, v_recipe_record.inventory_item_id, v_order_id, -(v_item_qty * v_recipe_multiplier), 'recipe', 'order_delivered');
            END LOOP;
        END LOOP;

        NEW.stock_deducted := TRUE;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Stock deduction trigger failed for Order %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;
