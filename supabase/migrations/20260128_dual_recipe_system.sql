-- Option B: Dual Recipe System Support
-- Date: 2026-01-28
-- Description: Implements a bridge table to support recipes for items living in 'inventory_items' 
-- and updates the stock deduction logic to check this new table.

-- 1. Create Bridge Table
CREATE TABLE IF NOT EXISTS inventory_item_recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE, -- The "Sellable" Item
    ingredient_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT, -- The Ingredient
    quantity_required NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Indexes
CREATE INDEX IF NOT EXISTS idx_inv_recipes_parent ON inventory_item_recipes(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_inv_recipes_ingredient ON inventory_item_recipes(ingredient_item_id);

-- 2. Update Unified Deduction Function
CREATE OR REPLACE FUNCTION deduct_order_stock_unified(
    p_order_id UUID,
    p_context TEXT DEFAULT 'manual'
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_recipe_item RECORD;
    v_inv_recipe_item RECORD; -- New record for the second loop
    v_addon RECORD;
    v_addon_def RECORD;
    v_qty_required NUMERIC;
    v_unit_type TEXT;
    v_default_location_id UUID;
    v_target_location_id UUID;
    v_has_recipe BOOLEAN;
    v_inv_item_id UUID;
BEGIN
    -- A. Get Order & Validation
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- Idempotency Check
    IF v_order.stock_deducted THEN
         RETURN jsonb_build_object('success', true, 'message', 'Already deducted', 'skipped', true);
    END IF;

    -- B. Resolve Location
    SELECT id INTO v_default_location_id 
    FROM storage_locations 
    WHERE store_id = v_order.store_id AND is_default = TRUE 
    LIMIT 1;

    v_target_location_id := COALESCE(v_order.source_location_id, v_default_location_id);

    -- C. Request Logic: Iterate Order Items (Source of Truth Table)
    FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id
    LOOP
        v_has_recipe := FALSE;

        -- C.1. Primary: Check Product Recipe (Standard Path)
        FOR v_recipe_item IN 
            SELECT * FROM product_recipes WHERE product_id = v_item.product_id
        LOOP
            v_has_recipe := TRUE;
            v_qty_required := v_recipe_item.quantity_required * v_item.quantity;
            v_inv_item_id := v_recipe_item.inventory_item_id;

            -- Get Unit Type
            SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_inv_item_id;

            -- CONSUME
            PERFORM consume_from_open_packages(
                p_item_id => v_inv_item_id,
                p_store_id => v_order.store_id,
                p_required_qty => v_qty_required,
                p_unit => COALESCE(v_unit_type, 'un'),
                p_reason => 'recipe_consumption',
                p_order_id => p_order_id,
                p_location_id => v_target_location_id
            );
        END LOOP;

        -- C.1.b Secondary: Check Inventory Item Recipe (Duel/Bridge Path)
        -- Only check if no standard recipe was found (or should we support both? Usually mutually exclusive by ID)
        -- Since v_item.product_id is a UUID, it matches EITHER products OR inventory_items.
        IF NOT v_has_recipe THEN
            FOR v_inv_recipe_item IN 
                SELECT * FROM inventory_item_recipes WHERE inventory_item_id = v_item.product_id
            LOOP
                v_has_recipe := TRUE;
                v_qty_required := v_inv_recipe_item.quantity_required * v_item.quantity;
                v_inv_item_id := v_inv_recipe_item.ingredient_item_id; -- Note: using ingredient_item_id

                -- Get Unit Type
                SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_inv_item_id;

                -- CONSUME
                PERFORM consume_from_open_packages(
                    p_item_id => v_inv_item_id,
                    p_store_id => v_order.store_id,
                    p_required_qty => v_qty_required,
                    p_unit => COALESCE(v_unit_type, 'un'),
                    p_reason => 'recipe_consumption',
                    p_order_id => p_order_id,
                    p_location_id => v_target_location_id
                );
            END LOOP;
        END IF;

        -- C.2. VARIANT OVERRIDES
        IF v_item.variant_id IS NOT NULL THEN
            DECLARE
                v_variant_overrides JSONB;
                v_override_item JSONB;
                v_ov_inv_id UUID;
                v_ov_qty NUMERIC;
                v_ov_unit TEXT;
            BEGIN
                SELECT recipe_overrides INTO v_variant_overrides
                FROM product_variants WHERE id = v_item.variant_id;
                
                IF v_variant_overrides IS NOT NULL AND jsonb_array_length(v_variant_overrides) > 0 THEN
                    FOR v_override_item IN SELECT * FROM jsonb_array_elements(v_variant_overrides)
                    LOOP
                        v_ov_inv_id := (v_override_item->>'inventory_item_id')::UUID;
                        v_ov_qty := (v_override_item->>'quantity')::NUMERIC * v_item.quantity;
                        
                        -- Get unit type
                        SELECT unit_type INTO v_ov_unit FROM inventory_items WHERE id = v_ov_inv_id;

                        IF v_ov_inv_id IS NOT NULL AND v_ov_qty > 0 THEN
                            PERFORM consume_from_open_packages(
                                p_item_id => v_ov_inv_id,
                                p_store_id => v_order.store_id,
                                p_required_qty => v_ov_qty,
                                p_unit => COALESCE(v_ov_unit, 'un'),
                                p_reason => 'variant_override',
                                p_order_id => p_order_id,
                                p_location_id => v_target_location_id
                            );
                        END IF;
                    END LOOP;
                END IF;
            END;
        END IF;

        -- C.3. Fallback: Direct Sale (No Recipe Found in Either Table)
        IF NOT v_has_recipe THEN
             v_inv_item_id := v_item.product_id; 
             v_qty_required := v_item.quantity;
             
             -- Get Unit Type
             SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_inv_item_id;

             -- If item exists in inventory_items (it might be a product with no inventory link, so check null)
             -- If unit_type found, it means it exists in inventory_items.
             IF v_unit_type IS NOT NULL THEN
                 PERFORM consume_from_open_packages(
                    p_item_id => v_inv_item_id,
                    p_store_id => v_order.store_id,
                    p_required_qty => v_qty_required,
                    p_unit => COALESCE(v_unit_type, 'un'),
                    p_reason => 'direct_sale',
                    p_order_id => p_order_id,
                    p_location_id => v_target_location_id
                );
             END IF; 
             -- If v_unit_type IS NULL, it means the ID is probably in 'products' but has no recipe. 
             -- In that case, we can't deduct anything (it's a service or virtual product with no link).
        END IF;

        -- C.4. Addons
        FOR v_addon IN SELECT * FROM order_item_addons WHERE order_item_id = v_item.id
        LOOP
             SELECT * INTO v_addon_def FROM product_addons WHERE id = v_addon.addon_id;
             
             IF FOUND AND v_addon_def.inventory_item_id IS NOT NULL THEN
                 v_qty_required := COALESCE(v_addon_def.quantity_consumed, 1) * v_item.quantity;
                 
                 -- Get Unit Type
                 SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_addon_def.inventory_item_id;

                 PERFORM consume_from_open_packages(
                    p_item_id => v_addon_def.inventory_item_id,
                    p_store_id => v_order.store_id,
                    p_required_qty => v_qty_required,
                    p_unit => COALESCE(v_unit_type, 'un'),
                    p_reason => 'recipe_consumption', 
                    p_order_id => p_order_id,
                    p_location_id => v_target_location_id
                );
             END IF;
        END LOOP;

    END LOOP;

    -- D. Finalize
    UPDATE orders SET stock_deducted = TRUE, updated_at = NOW() WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    -- Log Error
    INSERT INTO stock_deduction_errors (
        order_id, store_id, error_message, error_detail, context, created_at
    ) VALUES (
        p_order_id, 
        (SELECT store_id FROM orders WHERE id = p_order_id),
        SQLERRM,
        SQLSTATE,
        p_context,
        NOW()
    );

    IF p_context = 'manual' THEN
        RAISE;
    ELSE
        RAISE WARNING 'Stock deduction failed for order % (Logged)', p_order_id;
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
