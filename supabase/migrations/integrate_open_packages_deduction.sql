-- Migration: Final Stock Deduction Trigger
-- Handles BOTH recipe-based products AND direct inventory_item sales
-- ============================================================

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
    v_has_recipe BOOLEAN;
    v_inv_item RECORD;
BEGIN
    -- Check for delivery status (multiple formats) and ensure not already deducted
    IF (NEW.status = 'served' OR NEW.status = 'delivered' OR NEW.status = 'Entregado') AND NEW.stock_deducted = FALSE THEN
       
        v_order_id := NEW.id;
        v_store_id := NEW.store_id;
        v_items := NEW.items;

        -- Fallback: If items JSON is empty, rebuild from order_items table
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
            RETURN NEW;
        END IF;

        -- Iterate order items
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
            v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);
            v_sellable_id := (v_item->>'id')::UUID;
            v_variant_id := NULL;
            IF v_item->>'variant_id' IS NOT NULL AND v_item->>'variant_id' != 'null' THEN
                v_variant_id := (v_item->>'variant_id')::UUID;
            END IF;

            -- Check if this sellable has recipes
            SELECT EXISTS(SELECT 1 FROM product_recipes WHERE product_id = v_sellable_id) INTO v_has_recipe;

            IF v_has_recipe THEN
                -- === CASE 1: PRODUCT WITH RECIPE ===
                v_recipe_multiplier := 1.0;
                IF v_variant_id IS NOT NULL THEN
                     SELECT COALESCE(recipe_multiplier, 1.0) INTO v_recipe_multiplier
                     FROM product_variants WHERE id = v_variant_id;
                     v_recipe_multiplier := COALESCE(v_recipe_multiplier, 1.0);
                END IF;

                -- Consume recipe ingredients
                FOR v_recipe_record IN 
                    SELECT ri.inventory_item_id, ri.quantity_required, ii.unit_type
                    FROM product_recipes ri
                    JOIN inventory_items ii ON ii.id = ri.inventory_item_id
                    WHERE ri.product_id = v_sellable_id
                LOOP
                    v_total_required := v_recipe_record.quantity_required * v_recipe_multiplier * v_item_qty;
                    
                    IF v_recipe_record.unit_type = 'unit' THEN 
                        v_total_required := ROUND(v_total_required); 
                    END IF;

                    v_consumption_result := consume_from_open_packages(
                        v_recipe_record.inventory_item_id,
                        v_store_id,
                        v_total_required,
                        COALESCE(v_recipe_record.unit_type, 'un'),
                        'order_delivered',
                        v_order_id
                    );

                    IF v_consumption_result IS NOT NULL AND NOT COALESCE((v_consumption_result->>'success')::boolean, false) THEN
                        RAISE NOTICE 'Consumption warning for ingredient %: %', 
                            v_recipe_record.inventory_item_id, 
                            v_consumption_result->>'error';
                    END IF;
                END LOOP;

                -- Handle variant overrides
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

                                 v_consumption_result := consume_from_open_packages(
                                     ov_inv_id,
                                     v_store_id,
                                     ov_qty,
                                     COALESCE(ov_unit, 'un'),
                                     'variant_override',
                                     v_order_id
                                 );
                            END;
                         END LOOP;
                    END IF;
                END IF;

            ELSE
                -- === CASE 2: DIRECT INVENTORY ITEM SALE (No Recipe) ===
                -- Check if this is an inventory_item being sold directly
                SELECT id, unit_type, package_size 
                INTO v_inv_item
                FROM inventory_items 
                WHERE id = v_sellable_id AND store_id = v_store_id;
                
                IF v_inv_item.id IS NOT NULL THEN
                    -- Consume directly from this inventory item
                    v_consumption_result := consume_from_open_packages(
                        v_sellable_id,
                        v_store_id,
                        v_item_qty,
                        COALESCE(v_inv_item.unit_type, 'unit'),
                        'order_delivered',
                        v_order_id
                    );
                    
                    IF v_consumption_result IS NOT NULL AND NOT COALESCE((v_consumption_result->>'success')::boolean, false) THEN
                        RAISE NOTICE 'Direct sale consumption warning for item %: %', 
                            v_sellable_id, 
                            v_consumption_result->>'error';
                    END IF;
                END IF;
            END IF;

        END LOOP;

        -- Mark as deducted
        NEW.stock_deducted := TRUE;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Stock deduction trigger failed for Order %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_finalize_stock ON orders;
CREATE TRIGGER trg_finalize_stock
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION finalize_order_stock();

-- Grant permissions
GRANT EXECUTE ON FUNCTION finalize_order_stock TO authenticated;
