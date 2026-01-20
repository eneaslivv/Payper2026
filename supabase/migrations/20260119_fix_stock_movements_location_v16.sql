-- V16: Fix finalize_order_stock to include location_id in stock_movements
-- This ensures stock movements are correctly linked to the location where stock was deducted from.

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
    v_location_id UUID;
    v_default_location_id UUID;
BEGIN
    -- CRITICAL FIX: Only deduct stock when order is DELIVERED (status = 'served')
    -- AND has not been deducted yet
    IF NEW.status = 'served' AND NEW.stock_deducted = FALSE THEN
       
        v_order_id := NEW.id;
        v_store_id := NEW.store_id;
        v_items := NEW.items;

        -- Fallback to order_items table if items JSONB is empty
        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
             SELECT jsonb_agg(jsonb_build_object('id', product_id, 'quantity', quantity, 'variant_id', variant_id))
             INTO v_items FROM order_items WHERE order_id = v_order_id;
        END IF;

        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
            NEW.stock_deducted := TRUE;
            RETURN NEW;
        END IF;

        -- Get Dispatch Station or Default Location
        -- For now, we use Default Location for all deductions as requested
        SELECT id INTO v_default_location_id FROM storage_locations WHERE store_id = v_store_id AND is_default = TRUE LIMIT 1;
        v_location_id := v_default_location_id;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
            v_sellable_id := (v_item->>'id')::UUID;
            v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);
            v_variant_id := (v_item->>'variant_id')::UUID;

            -- 1. Simple Item (Direct inventory item)
            IF EXISTS (SELECT 1 FROM inventory_items WHERE id = v_sellable_id) THEN
                IF v_location_id IS NOT NULL THEN
                    INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
                    VALUES (v_store_id, v_sellable_id, v_location_id, -v_item_qty)
                    ON CONFLICT (store_id, item_id, location_id)
                    DO UPDATE SET closed_units = inventory_location_stock.closed_units - v_item_qty, updated_at = now();
                ELSE
                    -- Fallback for no location
                    UPDATE inventory_items SET current_stock = current_stock - v_item_qty WHERE id = v_sellable_id;
                END IF;

                -- FIX: Include location_id in stock_movements
                INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
                VALUES (gen_random_uuid(), v_store_id, v_sellable_id, v_order_id, -v_item_qty, 'unit', 'order_delivered', v_location_id);
            END IF;

            -- 2. Recipes (Product -> Ingredients)
            FOR v_recipe_record IN SELECT * FROM product_recipes WHERE product_id = v_sellable_id LOOP
                v_recipe_multiplier := COALESCE(v_recipe_record.quantity_required, 1);
                
                IF v_location_id IS NOT NULL THEN
                    INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
                    VALUES (v_store_id, v_recipe_record.inventory_item_id, v_location_id, -(v_item_qty * v_recipe_multiplier))
                    ON CONFLICT (store_id, item_id, location_id)
                    DO UPDATE SET closed_units = inventory_location_stock.closed_units - (v_item_qty * v_recipe_multiplier), updated_at = now();
                ELSE
                     -- Fallback for no location
                    UPDATE inventory_items SET current_stock = current_stock - (v_item_qty * v_recipe_multiplier) WHERE id = v_recipe_record.inventory_item_id;
                END IF;

                -- FIX: Include location_id in stock_movements
                INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
                VALUES (gen_random_uuid(), v_store_id, v_recipe_record.inventory_item_id, v_order_id, -(v_item_qty * v_recipe_multiplier), 'recipe', 'order_delivered', v_location_id);
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
