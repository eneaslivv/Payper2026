-- Migration to support Multiplier-based (Percentage) Stock Deduction for Variants
-- Replaces previous logic for `recipe_overrides`

CREATE OR REPLACE FUNCTION public.finalize_order_stock(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order_item RECORD;
    v_recipe_item RECORD;
    v_variant_override RECORD;
    v_inventory_item RECORD;
    v_addon_link RECORD;
    v_qty_to_deduct NUMERIC;
    v_variant_data JSONB;
    v_addon_data JSONB;
BEGIN
    -- Loop through each item in the order
    FOR v_order_item IN 
        SELECT * FROM order_items WHERE order_id = p_order_id
    LOOP
        -- 1. Deduct Standard Recipe Ingredients
        -- (Only if it's a product with a recipe)
        FOR v_recipe_item IN 
            SELECT * FROM product_recipes WHERE product_id = v_order_item.product_id
        LOOP
            -- Base deduction = Recipe Qty * Order Item Qty
            v_qty_to_deduct := v_recipe_item.quantity * v_order_item.quantity;

            -- 2. Apply Variant Overrides (If any)
            -- Logic: Look for overrides in the 'inventory_items' JSONB for this variant
            IF v_order_item.variant_id IS NOT NULL THEN
                
                -- Get the variant data from the JSONB array in inventory_items
                SELECT jsonb_array_elements(variants) INTO v_variant_data
                FROM inventory_items
                WHERE id = v_order_item.product_id; 

                -- Filter for the specific variant ID
                -- Note: This subquery approach is a bit simplistic, optimized version below:
                
                -- Optimized: Fetch specific variant object
                SELECT v
                INTO v_variant_data
                FROM inventory_items, jsonb_array_elements(variants) v
                WHERE id = v_order_item.product_id AND (v->>'id')::text = v_order_item.variant_id::text;

                IF v_variant_data IS NOT NULL THEN
                    -- Check if there is an override for THIS ingredient
                    FOR v_variant_override IN 
                        SELECT * FROM jsonb_to_recordset(v_variant_data->'recipe_overrides') 
                        AS x(ingredient_id text, quantity_delta numeric, consumption_type text, value numeric)
                    LOOP
                        IF v_variant_override.ingredient_id::uuid = v_recipe_item.ingredient_id THEN
                            -- Logica Híbrida: Fixed vs Multiplier
                            IF v_variant_override.consumption_type = 'multiplier' THEN
                                -- Multiplier Mode: override the BASE quantity implies we multiply the base usage
                                -- Effective Qty = (Base Recipe Qty * Multiplier) * Order Qty
                                -- We already calculated v_qty_to_deduct = Base * Order.
                                -- So we just multiply that.
                                -- Wait. If we just multiply, we replace the previous v_qty_to_deduct? Yes.
                                -- Example: Base=100ml. Multiplier=1.5. Order=1.
                                -- Standard deduction = 100.
                                -- New deduction = 100 * 1.5 = 150.
                                v_qty_to_deduct := (v_recipe_item.quantity * COALESCE(v_variant_override.value, 1)) * v_order_item.quantity;
                            ELSE
                                -- Fixed Mode (Default/Legacy)
                                -- Effective Qty = (Base Recipe Qty + Delta) * Order Qty
                                -- Use 'value' if present, fallback to 'quantity_delta' for legacy
                                v_qty_to_deduct := (v_recipe_item.quantity + COALESCE(v_variant_override.value, v_variant_override.quantity_delta, 0)) * v_order_item.quantity;
                            END IF;
                        END IF;
                    END LOOP;
                END IF;
            END IF;

            -- Perform the deduction for this ingredient
            UPDATE inventory_items
            SET current_stock = current_stock - v_qty_to_deduct
            WHERE id = v_recipe_item.ingredient_id;
            
            -- Log the action
            PERFORM log_inventory_action(
                v_recipe_item.ingredient_id,
                'recipe_consumption',
                -v_qty_to_deduct,
                'Order ' || p_order_id,
                'system'
            );
        END LOOP;

        -- 3. Deduct Addons/Extras
        -- Logic: If the order item has addons, deduct their linked inventory item
        IF v_order_item.addons IS NOT NULL AND array_length(v_order_item.addons, 1) > 0 THEN
             -- Iterate through each addon ID in the array
            DECLARE
                v_addon_id_text text;
            BEGIN
                FOREACH v_addon_id_text IN ARRAY v_order_item.addons
                LOOP
                     -- Hybrid Lookup: First try JSONB in inventory_items (Single Source of Truth)
                    SELECT 
                        (a->>'inventory_item_id')::uuid,
                        (COALESCE(a->>'quantity_consumed', '0'))::numeric
                    INTO v_addon_link
                    FROM inventory_items, jsonb_array_elements(addon_links) a
                    WHERE id = v_order_item.product_id AND (a->>'id')::text = v_addon_id_text;
                    
                    -- Fallback: If not found in JSONB (legacy), try product_addons table
                    IF v_addon_link IS NULL THEN
                         SELECT inventory_item_id, quantity_consumed
                         INTO v_addon_link
                         FROM product_addons
                         WHERE id = v_addon_id_text::uuid;
                    END IF;

                    -- If found, deduct
                    IF v_addon_link.inventory_item_id IS NOT NULL THEN
                        UPDATE inventory_items
                        SET current_stock = current_stock - (v_addon_link.quantity_consumed * v_order_item.quantity)
                        WHERE id = v_addon_link.inventory_item_id;

                         PERFORM log_inventory_action(
                            v_addon_link.inventory_item_id,
                            'recipe_consumption',
                            -(v_addon_link.quantity_consumed * v_order_item.quantity),
                            'Order ' || p_order_id || ' (Addon)',
                            'system'
                        );
                    END IF;
                END LOOP;
            END;
        END IF;

    END LOOP;
END;
$function$;
