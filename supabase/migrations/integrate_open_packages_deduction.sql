-- Migration: Integrate Open Packages with Stock Deduction Trigger
-- This updates finalize_order_stock to use consume_from_open_packages
-- When a product with a recipe is delivered, ingredients are consumed from open packages
-- If no open package exists, one is automatically opened from closed_stock

-- 1. Update the finalize_order_stock function to use consume_from_open_packages
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
    v_recipe_record RECORD;
    v_variant_record RECORD;
    v_override_item JSONB;
    v_consumption_result JSONB;
    v_total_required NUMERIC;
BEGIN
    -- Only trigger on status = 'Entregado' and not yet deducted
    IF NEW.status = 'Entregado' AND NEW.stock_deducted = FALSE THEN
       
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
            -- Still no items, nothing to deduct
            RETURN NEW;
        END IF;

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

            -- Deduct Base Recipe Ingredients using OPEN PACKAGES system
            FOR v_recipe_record IN 
                SELECT ri.inventory_item_id, ri.quantity_required, ii.unit_type, ii.store_id as item_store_id
                FROM product_recipes ri
                JOIN inventory_items ii ON ii.id = ri.inventory_item_id
                WHERE ri.product_id = v_sellable_id
            LOOP
                -- Calculate total required for this ingredient
                v_total_required := v_recipe_record.quantity_required * v_recipe_multiplier * v_item_qty;
                
                -- Round if unit-based
                IF v_recipe_record.unit_type = 'unit' THEN 
                    v_total_required := ROUND(v_total_required); 
                END IF;

                -- Use smart consumption from open packages
                v_consumption_result := consume_from_open_packages(
                    v_recipe_record.inventory_item_id,
                    v_store_id,
                    v_total_required,
                    COALESCE(v_recipe_record.unit_type, 'un'),
                    'recipe_consumption',
                    v_order_id
                );

                -- Log if any issues
                IF v_consumption_result IS NOT NULL AND NOT COALESCE((v_consumption_result->>'success')::boolean, false) THEN
                    RAISE NOTICE 'Open package consumption warning for item %: %', 
                        v_recipe_record.inventory_item_id, 
                        v_consumption_result->>'error';
                END IF;
            END LOOP;

            -- === 2. VARIANT OVERRIDES (Additional Ingredients) ===
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

                             -- Use smart consumption for variant overrides too
                             v_consumption_result := consume_from_open_packages(
                                 ov_inv_id,
                                 v_store_id,
                                 ov_qty,
                                 COALESCE(ov_unit, 'un'),
                                 'variant_override_consumption',
                                 v_order_id
                             );
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

-- 2. Recreate the Trigger
DROP TRIGGER IF EXISTS trg_finalize_stock ON orders;
CREATE TRIGGER trg_finalize_stock
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION finalize_order_stock();

-- 3. Grant permissions
GRANT EXECUTE ON FUNCTION finalize_order_stock TO authenticated;
