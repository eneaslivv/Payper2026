-- V19: Restore Direct Inventory Scaling (Simple Products Fallback)
-- The user requested a "systemic solution" for products without explicit recipes.
-- This migration restores the logic to check if a Product ID matches an Inventory Item ID directly.

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
    v_recipe_multiplier NUMERIC;
    v_recipe_record RECORD;
    v_location_id UUID;
    v_default_location_id UUID;
    v_has_recipe BOOLEAN;
BEGIN
    -- Execute only on delivery (served) and if not already deducted
    IF NEW.status = 'served' AND NEW.stock_deducted = FALSE THEN
       
        v_order_id := NEW.id;
        v_store_id := NEW.store_id;
        v_items := NEW.items;

        -- Fallback to order_items
        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
             SELECT jsonb_agg(jsonb_build_object('id', product_id, 'quantity', quantity, 'variant_id', variant_id))
             INTO v_items FROM order_items WHERE order_id = v_order_id;
        END IF;

        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
            NEW.stock_deducted := TRUE;
            RETURN NEW;
        END IF;

        -- Get Default Location (Dispatch Station)
        SELECT id INTO v_default_location_id FROM storage_locations WHERE store_id = v_store_id AND is_default = TRUE LIMIT 1;
        v_location_id := v_default_location_id;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
            v_sellable_id := (v_item->>'id')::UUID;
            v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);
            v_has_recipe := FALSE;
            
            -- 1. RECIPES LOGIC
            FOR v_recipe_record IN SELECT * FROM product_recipes WHERE product_id = v_sellable_id LOOP
                v_has_recipe := TRUE;
                v_recipe_multiplier := COALESCE(v_recipe_record.quantity_required, 1);
                
                -- Generate Movement (Trigger will handle inventory update)
                INSERT INTO stock_movements (
                    idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id
                ) VALUES (
                    gen_random_uuid(), v_store_id, v_recipe_record.inventory_item_id, v_order_id, -(v_item_qty * v_recipe_multiplier), 'recipe', 'order_delivered', v_location_id
                );
            END LOOP;

            -- 2. FALLBACK: SIMPLE ITEM (Direct Inventory Match)
            -- If no recipe found, check if this ID corresponds directly to an Inventory Item
            IF v_has_recipe = FALSE THEN
                IF EXISTS (SELECT 1 FROM inventory_items WHERE id = v_sellable_id) THEN
                    -- Generate Movement for direct item
                    INSERT INTO stock_movements (
                        idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id
                    ) VALUES (
                        gen_random_uuid(), v_store_id, v_sellable_id, v_order_id, -v_item_qty, 'unit', 'order_delivered', v_location_id
                    );
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
$function$;
