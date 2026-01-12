-- Migration: Update finalize_order_stock to handle Loyalty Redemptions as Marketing Loss (Gift)
-- Replaces previous logic to split deduction between 'recipe_consumption' and 'gift'
-- Includes update to orders.stock_deducted to prevent double deduction

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
    v_variant_data JSONB;
    
    -- New variables for logic splitting
    v_redeemed_count INTEGER;
    v_unit_deduction NUMERIC;
    v_qty_gift NUMERIC;
    v_qty_sale NUMERIC;
BEGIN
    -- Loop through each item in the order
    FOR v_order_item IN 
        SELECT * FROM order_items WHERE order_id = p_order_id
    LOOP
    
        -- 0. CHECK LOYALTY REDEMPTION FOR THIS ITEM
        SELECT COUNT(*)::integer INTO v_redeemed_count
        FROM public.loyalty_redemptions
        WHERE order_id = p_order_id 
        AND product_id = v_order_item.product_id
        AND is_rolled_back = false;
        
        -- Safety: Cannot redeem more than ordered
        IF v_redeemed_count > v_order_item.quantity THEN
            v_redeemed_count := v_order_item.quantity;
        END IF;

        -- 1. Deduct Standard Recipe Ingredients
        FOR v_recipe_item IN 
            SELECT * FROM product_recipes WHERE product_id = v_order_item.product_id
        LOOP
            -- Calculate UNIT deduction first (Base)
            v_unit_deduction := v_recipe_item.quantity; 

            -- 2. Apply Variant Overrides
            IF v_order_item.variant_id IS NOT NULL THEN
                SELECT v INTO v_variant_data
                FROM inventory_items, jsonb_array_elements(variants) v
                WHERE id = v_order_item.product_id AND (v->>'id')::text = v_order_item.variant_id::text;

                IF v_variant_data IS NOT NULL THEN
                    FOR v_variant_override IN 
                        SELECT * FROM jsonb_to_recordset(v_variant_data->'recipe_overrides') 
                        AS x(ingredient_id text, quantity_delta numeric, consumption_type text, value numeric)
                    LOOP
                        IF v_variant_override.ingredient_id::uuid = v_recipe_item.ingredient_id THEN
                            IF v_variant_override.consumption_type = 'multiplier' THEN
                                v_unit_deduction := v_recipe_item.quantity * COALESCE(v_variant_override.value, 1);
                            ELSE
                                v_unit_deduction := v_recipe_item.quantity + COALESCE(v_variant_override.value, v_variant_override.quantity_delta, 0);
                            END IF;
                        END IF;
                    END LOOP;
                END IF;
            END IF;

            -- 3. Calculate Ledger Splits
            v_qty_gift := v_unit_deduction * v_redeemed_count;
            v_qty_sale := v_unit_deduction * (v_order_item.quantity - v_redeemed_count);
            
            -- 4. Perform Physical Stock Deduction
            UPDATE inventory_items
            SET current_stock = current_stock - (v_qty_gift + v_qty_sale)
            WHERE id = v_recipe_item.ingredient_id;
            
            -- 5. Log Actions Separately
            IF v_qty_gift > 0 THEN
                PERFORM log_inventory_action(
                    p_item_id := v_recipe_item.ingredient_id,
                    p_action_type := 'gift', 
                    p_quantity_delta := -v_qty_gift,
                    p_reason := 'Canje Puntos Order #' || LEFT(p_order_id::text, 8),
                    p_order_id := p_order_id,
                    p_source_ui := 'order_delivery'
                );
            END IF;
            
            IF v_qty_sale > 0 THEN
                PERFORM log_inventory_action(
                    p_item_id := v_recipe_item.ingredient_id,
                    p_action_type := 'recipe_consumption', 
                    p_quantity_delta := -v_qty_sale,
                    p_reason := 'Order ' || LEFT(p_order_id::text, 8),
                    p_order_id := p_order_id,
                    p_source_ui := 'order_delivery'
                );
            END IF;

        END LOOP;

        -- 6. Deduct Addons/Extras
        IF v_order_item.addons IS NOT NULL AND array_length(v_order_item.addons, 1) > 0 THEN
            DECLARE
                v_addon_id_text text;
            BEGIN
                FOREACH v_addon_id_text IN ARRAY v_order_item.addons
                LOOP
                    SELECT 
                        (a->>'inventory_item_id')::uuid,
                        (COALESCE(a->>'quantity_consumed', '0'))::numeric
                    INTO v_addon_link
                    FROM inventory_items, jsonb_array_elements(addon_links) a
                    WHERE id = v_order_item.product_id AND (a->>'id')::text = v_addon_id_text;
                    
                    IF v_addon_link IS NULL THEN
                         SELECT inventory_item_id, quantity_consumed
                         INTO v_addon_link
                         FROM product_addons
                         WHERE id = v_addon_id_text::uuid;
                    END IF;

                    IF v_addon_link.inventory_item_id IS NOT NULL THEN
                        UPDATE inventory_items
                        SET current_stock = current_stock - (v_addon_link.quantity_consumed * v_order_item.quantity)
                        WHERE id = v_addon_link.inventory_item_id;

                         PERFORM log_inventory_action(
                            p_item_id := v_addon_link.inventory_item_id,
                            p_action_type := 'recipe_consumption',
                            p_quantity_delta := -(v_addon_link.quantity_consumed * v_order_item.quantity),
                            p_reason := 'Order Addon ' || LEFT(p_order_id::text, 8),
                            p_order_id := p_order_id,
                            p_source_ui := 'order_delivery'
                        );
                    END IF;
                END LOOP;
            END;
        END IF;

    END LOOP;

    -- 7. Mark order as processed for stock
    UPDATE orders SET stock_deducted = TRUE, updated_at = NOW() WHERE id = p_order_id;
END;
$function$;
