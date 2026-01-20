-- FIX: Stock Deduction V6 - Final & Comprehensive
-- Includes:
-- 1. SECURITY DEFINER (Bypass RLS for staff)
-- 2. RESTORED stock_movements (Fixes history log)
-- 3. Ambiguity resolved (Explicit signatures)

-- CLEANUP (Safety first)
DROP TRIGGER IF EXISTS trg_finalize_stock ON orders;
DROP FUNCTION IF EXISTS public.finalize_order_stock() CASCADE;
DROP FUNCTION IF EXISTS public.finalize_order_stock(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.finalize_order_stock(uuid, uuid) CASCADE;

-- 1. Create Trigger Function
CREATE OR REPLACE FUNCTION public.finalize_order_stock()
RETURNS TRIGGER 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_store_id UUID;
    v_items JSONB;
    v_item JSONB;
    v_item_qty NUMERIC;
    v_sellable_id UUID;
    v_variant_id UUID;
    v_recipe_multiplier NUMERIC;
    v_target_location_id UUID;
    v_recipe_record RECORD;
    v_override_item JSONB;
    v_variant_record RECORD;
    v_addon_id UUID;
    v_addon_data RECORD;
BEGIN
    -- Only proceed if status/payment indicates paid AND stock not yet deducted
    IF (NEW.is_paid = TRUE OR NEW.payment_status IN ('paid', 'approved')) 
       AND NEW.stock_deducted = FALSE THEN
       
        v_order_id := NEW.id;
        v_store_id := NEW.store_id;
        v_items := NEW.items;

        -- Fallback: If items JSON is empty
        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
             SELECT jsonb_agg(
                jsonb_build_object(
                    'id', product_id,
                    'quantity', quantity,
                    'variant_id', variant_id,
                    'sellable_type', 'product', 
                    'addon_ids', (
                        SELECT jsonb_agg(addon_id)
                        FROM order_item_addons
                        WHERE order_item_id = oi.id
                    )
                )
             )
             INTO v_items
             FROM order_items oi
             WHERE order_id = v_order_id;
        END IF;

        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
            NEW.stock_deducted := TRUE;
            RETURN NEW;
        END IF;

        -- Determine Target Location
        SELECT id INTO v_target_location_id 
        FROM storage_locations 
        WHERE store_id = v_store_id 
        ORDER BY CASE WHEN name ILIKE '%Principal%' THEN 0 ELSE 1 END, created_at ASC
        LIMIT 1;

        -- Iterate items
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
            v_item_qty := (COALESCE(v_item->>'quantity', '0'))::NUMERIC;
            v_sellable_id := (v_item->>'id')::UUID;
            v_variant_id := NULL;
            IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != 'null' THEN
                v_variant_id := (v_item->>'variant_id')::UUID;
            END IF;

            -- === 1. PRODUCT RECIPES ===
            v_recipe_multiplier := 1.0;
            IF v_variant_id IS NOT NULL THEN
                 SELECT COALESCE(recipe_multiplier, 1.0) INTO v_recipe_multiplier
                 FROM product_variants WHERE id = v_variant_id;
                 v_recipe_multiplier := COALESCE(v_recipe_multiplier, 1.0);
            END IF;

            -- Deduct Base Recipe Ingredients
            FOR v_recipe_record IN 
                SELECT ri.inventory_item_id, ri.quantity_required, ii.unit_type, ii.current_stock
                FROM product_recipes ri
                JOIN inventory_items ii ON ii.id = ri.inventory_item_id
                WHERE ri.product_id = v_sellable_id
            LOOP
                DECLARE 
                    verify_qty NUMERIC := v_recipe_record.quantity_required * v_recipe_multiplier * v_item_qty;
                BEGIN
                    IF v_recipe_record.unit_type = 'unit' THEN verify_qty := ROUND(verify_qty); END IF;

                    -- Update Inventory Item (Global)
                    UPDATE inventory_items 
                    SET current_stock = current_stock - verify_qty, updated_at = NOW()
                    WHERE id = v_recipe_record.inventory_item_id;

                    -- Update Location Stock
                    IF v_target_location_id IS NOT NULL THEN
                        INSERT INTO inventory_location_stock (inventory_item_id, location_id, store_id, closed_units)
                        VALUES (v_recipe_record.inventory_item_id, v_target_location_id, v_store_id, -verify_qty)
                        ON CONFLICT (inventory_item_id, location_id) 
                        DO UPDATE SET closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units;
                    END IF;

                    -- Log Movement (RESTORED logic)
                    INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                    VALUES (gen_random_uuid(), v_store_id, v_recipe_record.inventory_item_id, v_order_id, -verify_qty, v_recipe_record.unit_type, 'order_delivered');
                END;
            END LOOP;

            -- === 2. VARIANT OVERRIDES ===
            IF v_variant_id IS NOT NULL THEN
                SELECT recipe_overrides INTO v_variant_record 
                FROM product_variants WHERE id = v_variant_id;

                IF v_variant_record.recipe_overrides IS NOT NULL AND jsonb_array_length(v_variant_record.recipe_overrides) > 0 THEN
                     FOR v_override_item IN SELECT * FROM jsonb_array_elements(v_variant_record.recipe_overrides)
                     LOOP
                        DECLARE
                            ov_inv_id UUID := (v_override_item->>'inventory_item_id')::UUID;
                            ov_qty NUMERIC := (v_override_item->>'quantity')::NUMERIC * v_item_qty;
                            ov_unit TEXT;
                        BEGIN
                             SELECT unit_type INTO ov_unit FROM inventory_items WHERE id = ov_inv_id;
                             IF ov_unit = 'unit' THEN ov_qty := ROUND(ov_qty); END IF;

                             UPDATE inventory_items SET current_stock = current_stock - ov_qty WHERE id = ov_inv_id;

                             IF v_target_location_id IS NOT NULL THEN
                                INSERT INTO inventory_location_stock (inventory_item_id, location_id, store_id, closed_units)
                                VALUES (ov_inv_id, v_target_location_id, v_store_id, -ov_qty)
                                ON CONFLICT (inventory_item_id, location_id) 
                                DO UPDATE SET closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units;
                            END IF;

                            -- Log Movement (RESTORED)
                            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                            VALUES (gen_random_uuid(), v_store_id, ov_inv_id, v_order_id, -ov_qty, ov_unit, 'variant_override');
                        END;
                     END LOOP;
                END IF;
            END IF;

        END LOOP;

        NEW.stock_deducted := TRUE;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Stock deduction trigger failed for Order %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Re-create Trigger
CREATE TRIGGER trg_finalize_stock
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION finalize_order_stock();

-- 3. Secure the RPC
CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    v_order_store_id UUID;
    v_status TEXT;
    v_is_paid BOOLEAN;
BEGIN
    SELECT status, is_paid, store_id
    INTO v_status, v_is_paid, v_order_store_id
    FROM orders WHERE id = p_order_id FOR UPDATE;

    IF v_order_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'La orden no existe.');
    END IF;

    IF v_status = 'served' OR v_status = 'Entregado' THEN
        RETURN jsonb_build_object('success', false, 'message', 'La orden ya fue entregada.');
    END IF;

    IF NOT v_is_paid THEN
        RETURN jsonb_build_object('success', false, 'message', 'La orden no está pagada (Confirmar pago antes de entregar).');
    END IF;

    UPDATE orders SET 
        status = 'served',
        delivered_at = NOW(),
        delivered_by = p_staff_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'message', 'Orden entregada y stock procesado.');
END;
$function$;

-- 4. Grant Permissions
GRANT EXECUTE ON FUNCTION finalize_order_stock() TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_order_delivery(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_order_stock() TO service_role;
GRANT EXECUTE ON FUNCTION confirm_order_delivery(uuid, uuid) TO service_role;
