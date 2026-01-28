-- Phase 1: Stock Unification - Infrastructure & Safety
-- Date: 2026-01-27
-- Context: Preparing to unify stock deduction logic into a single source of truth.

-- 1. Create Extended Error Logging Table
-- Tracks failed deductions with full context (multi-tenant safe).
CREATE TABLE IF NOT EXISTS stock_deduction_errors (
    id SERIAL PRIMARY KEY,
    order_id UUID REFERENCES orders(id),
    store_id UUID REFERENCES stores(id),
    inventory_item_id UUID,
    attempted_qty NUMERIC,
    current_stock_before NUMERIC,
    error_message TEXT,
    error_detail TEXT,
    context TEXT, -- 'trigger' | 'manual'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_errors_order ON stock_deduction_errors(order_id);
CREATE INDEX IF NOT EXISTS idx_stock_errors_store ON stock_deduction_errors(store_id);
CREATE INDEX IF NOT EXISTS idx_stock_errors_context ON stock_deduction_errors(context, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_errors_item ON stock_deduction_errors(inventory_item_id);

-- 2. Create Unified Stock Deduction Function
-- Replaces usage of deduct_order_stock_manual, finalize_order_stock, and deduct_order_stock.
-- Integrates 'consume_from_open_packages' for correct inventory handling.
CREATE OR REPLACE FUNCTION deduct_order_stock_unified(
    p_order_id UUID,
    p_context TEXT DEFAULT 'manual'
)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_recipe_item RECORD;
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

        -- C.1. Primary: Check Product Recipe
        FOR v_recipe_item IN 
            SELECT * FROM product_recipes WHERE product_id = v_item.product_id
        LOOP
            v_has_recipe := TRUE;
            v_qty_required := v_recipe_item.quantity_required * v_item.quantity;
            v_inv_item_id := v_recipe_item.inventory_item_id;

            -- Get Unit Type
            SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_inv_item_id;

            -- CONSUME (Phase V20 Integration) - Named arguments for safety
            PERFORM consume_from_open_packages(
                p_item_id => v_inv_item_id,
                p_store_id => v_order.store_id,
                p_required_qty => v_qty_required,
                p_unit => COALESCE(v_unit_type, 'un'),
                p_reason => 'recipe_consumption',
                p_order_id => p_order_id,
                p_location_id => v_target_location_id -- Passing resolved location
            );
        END LOOP;

        -- C.2. VARIANT OVERRIDES (New logic from final audit)
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

        -- C.3. Fallback: Direct Sale (No Recipe)
        IF NOT v_has_recipe THEN
             v_inv_item_id := v_item.product_id; 
             v_qty_required := v_item.quantity;
             
             -- Get Unit Type
             SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_inv_item_id;

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

    -- Decide behavior based on request source
    IF p_context = 'manual' THEN
        RAISE; -- Re-throw for admin visibility
    ELSE
        -- For triggers, we swallow the error to prevent blocking the POS UI
        -- But stock_deducted remains FALSE, allowing retry/alerting
        RAISE WARNING 'Stock deduction failed for order % (Logged)', p_order_id;
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. Neutralize 'confirm_order_delivery' to prevent double deduction
-- This function will NO LONGER call finalize_order_stock explicitely.
-- It will rely on the trigger listening to status='served'.
CREATE OR REPLACE FUNCTION confirm_order_delivery(
    p_order_id UUID,
    p_staff_id UUID
)
RETURNS JSONB AS $$
BEGIN
    UPDATE orders 
    SET 
        status = 'served',
        delivered_at = NOW(),
        delivered_by = p_staff_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- REMOVED: PERFORM finalize_order_stock(p_order_id);
    -- The trigger on 'orders' table will detect the status change and handle stock.
    
    RETURN jsonb_build_object(
        'success', true, 
        'message', 'Order marked as served. Stock deduction handled by trigger.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
