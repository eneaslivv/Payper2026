-- Migration: Real V24 Fix - Update the Trigger Function
-- Created: 2026-01-21
-- Description: Updates the TRIGGER version of deduct_order_stock() which was previously missed.

CREATE OR REPLACE FUNCTION public.deduct_order_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_items JSONB;
    v_item JSONB;
    v_item_qty NUMERIC;
    v_product_id UUID;
    v_variant_id UUID;
    v_recipe RECORD;
    v_addon_id UUID;
    v_addon RECORD;
    v_target_location_id UUID;
    v_deduction_qty NUMERIC;
    v_unit_type TEXT;
    v_item_type TEXT;
    v_has_recipe BOOLEAN;
    v_default_location_id UUID;
BEGIN
    -- 1. Pre-validation
    IF NEW.status NOT IN ('Entregado', 'served', 'delivered') THEN
        RETURN NEW;
    END IF;

    IF NEW.stock_deducted = TRUE THEN
        RETURN NEW;
    END IF;

    RAISE NOTICE '[deduct_order_stock] Processing order %', NEW.id;

    -- 2. Extract Items
    v_items := NEW.items;

    IF v_items IS NULL OR jsonb_array_length(COALESCE(v_items, '[]'::jsonb)) = 0 THEN
        -- Fallback: Try to fetch from order_items table if JSONB is empty
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', product_id,
                'quantity', quantity,
                'variant_id', variant_id,
                'sellable_type', COALESCE(sellable_type, 'product'),
                'addon_ids', (
                    SELECT jsonb_agg(addon_id)
                    FROM order_item_addons
                    WHERE order_item_id = oi.id
                )
            )
        )
        INTO v_items
        FROM order_items oi
        WHERE order_id = NEW.id;
    END IF;

    IF v_items IS NULL OR jsonb_array_length(COALESCE(v_items, '[]'::jsonb)) = 0 THEN
        -- Nothing to deduct
        NEW.stock_deducted := TRUE;
        RETURN NEW;
    END IF;

    -- 3. Determine Location
    v_target_location_id := NEW.location_id;
    
    IF v_target_location_id IS NULL THEN
        SELECT id INTO v_default_location_id 
        FROM storage_locations 
        WHERE store_id = NEW.store_id AND is_default = TRUE 
        LIMIT 1;
        v_target_location_id := v_default_location_id;
    END IF;

    -- 4. Process Each Item
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_product_id := (v_item->>'id')::UUID;
        v_item_qty := (v_item->>'quantity')::NUMERIC;
        v_has_recipe := FALSE;

        -- A. Check Recipe
        FOR v_recipe IN 
            SELECT * FROM product_recipes WHERE product_id = v_product_id
        LOOP
            v_has_recipe := TRUE;
            v_deduction_qty := v_recipe.quantity_required * v_item_qty;
            
            SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_recipe.inventory_item_id;

            -- INSERT Recipe Consumption
            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
            VALUES (gen_random_uuid(), NEW.store_id, v_recipe.inventory_item_id, NEW.id, -v_deduction_qty, COALESCE(v_unit_type, 'unit'), 'recipe_consumption', v_target_location_id);
        END LOOP;

        -- B. If No Recipe -> Direct Sale
        IF NOT v_has_recipe THEN
             -- Direct Sale Logic
             SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_product_id;
             
             -- Reason = 'direct_sale' triggers simplified deduction in update_inventory logic
             INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
             VALUES (gen_random_uuid(), NEW.store_id, v_product_id, NEW.id, -v_item_qty, COALESCE(v_unit_type, 'unit'), 'direct_sale', v_target_location_id);
        END IF;

        -- C. Addons
        IF (v_item ? 'addon_ids') AND (jsonb_typeof(v_item->'addon_ids') = 'array') THEN
             FOR v_addon_id IN SELECT (val::text)::UUID FROM jsonb_array_elements_text(v_item->'addon_ids') val
             LOOP
                  SELECT pa.inventory_item_id, pa.quantity_consumed, ii.unit_type 
                  INTO v_addon 
                  FROM product_addons pa
                  JOIN inventory_items ii ON ii.id = pa.inventory_item_id
                  WHERE pa.id = v_addon_id;

                  IF v_addon.inventory_item_id IS NOT NULL THEN
                       v_deduction_qty := COALESCE(v_addon.quantity_consumed, 1) * v_item_qty;
                       -- Addons are fractional/recipe
                       INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
                       VALUES (gen_random_uuid(), NEW.store_id, v_addon.inventory_item_id, NEW.id, -v_deduction_qty, v_addon.unit_type, 'recipe_consumption', v_target_location_id);
                  END IF;
             END LOOP;
        END IF;

    END LOOP;

    -- 5. Mark Done
    NEW.stock_deducted := TRUE;
    RETURN NEW;
    
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[deduct_order_stock] Error in order %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;
