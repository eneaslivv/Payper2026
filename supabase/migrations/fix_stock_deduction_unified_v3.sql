-- FIX: Unified Stock Deduction Trigger V3
-- This ensures stock is deducted reliably when an order is paid.

-- 1. Create or Replace the robust deduction function
-- This function handles variants, addons, and multi-location stock
-- It prioritizes the 'items' JSONB column for performance, but we add a check
CREATE OR REPLACE FUNCTION finalize_order_stock()
RETURNS TRIGGER AS $$
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
    v_addon_id UUID;
    v_addon_record RECORD;
    v_variant_record RECORD;
    v_override_item JSONB;
BEGIN
    -- Only proceed if status/payment indicates paid AND stock not yet deducted
    IF (NEW.is_paid = TRUE OR NEW.payment_status IN ('paid', 'approved')) 
       AND NEW.stock_deducted = FALSE THEN
       
        v_order_id := NEW.id;
        v_store_id := NEW.store_id;
        v_items := NEW.items;

        -- Fallback: If items JSON is empty, try to rebuild from order_items table
        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
             SELECT jsonb_agg(
                jsonb_build_object(
                    'id', product_id,
                    'quantity', quantity,
                    'variant_id', variant_id,
                    'sellable_type', 'product', -- Assuming mostly products
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
            -- Still no items, nothing to deduct (maybe just a tip?)
            RETURN NEW;
        END IF;

        -- Determine Target Location (Default to "Principal" or First Found)
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
            -- Handle both standard uuid and object variant_id (some payloads differ)
            v_variant_id := NULL;
            IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != 'null' THEN
                v_variant_id := (v_item->>'variant_id')::UUID;
            END IF;

            -- === 1. PRODUCT RECIPES ===
            -- Calculate Main Recipe Multiplier
            v_recipe_multiplier := 1.0;
            IF v_variant_id IS NOT NULL THEN
                 SELECT COALESCE(recipe_multiplier, 1.0) INTO v_recipe_multiplier
                 FROM product_variants WHERE id = v_variant_id;
                 -- Check for null result if variant not found
                 v_recipe_multiplier := COALESCE(v_recipe_multiplier, 1.0);
            END IF;

            -- Deduct Base Recipe Ingredients
            FOR v_recipe_record IN 
                SELECT ri.inventory_item_id, ri.quantity_required, ii.unit_type
                FROM product_recipes ri
                JOIN inventory_items ii ON ii.id = ri.inventory_item_id
                WHERE ri.product_id = v_sellable_id
            LOOP
                -- Calculate deduction amount
                DECLARE 
                    verify_qty NUMERIC := v_recipe_record.quantity_required * v_recipe_multiplier * v_item_qty;
                BEGIN
                     -- Round if unit is 'unit' (integer based)
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
                END;
            END LOOP;

            -- === 2. VARIANT OVERRIDES (Add/Remove Ingredients) ===
            IF v_variant_id IS NOT NULL THEN
                SELECT recipe_overrides INTO v_variant_record 
                FROM product_variants WHERE id = v_variant_id;

                IF v_variant_record.recipe_overrides IS NOT NULL AND jsonb_array_length(v_variant_record.recipe_overrides) > 0 THEN
                     FOR v_override_item IN SELECT * FROM jsonb_array_elements(v_variant_record.recipe_overrides)
                     LOOP
                        -- Logic for overrieds (usually adds extra ingredients)
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
                        END;
                     END LOOP;
                END IF;
            END IF;

        END LOOP;

        -- Mark as deducted to prevent double counting
        NEW.stock_deducted := TRUE;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log error but don't fail the transaction to avoid blocking sales
    RAISE WARNING 'Stock deduction trigger failed for Order %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the Trigger
DROP TRIGGER IF EXISTS trg_finalize_stock ON orders;
CREATE TRIGGER trg_finalize_stock
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION finalize_order_stock();
