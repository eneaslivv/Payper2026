-- v7: Pure Trigger Function with RETAIL LOGIC & ERROR HANDLING
-- (Deducts full package_size for direct sales, liters for recipes)

CREATE OR REPLACE FUNCTION finalize_order_stock_trigger_v5()
RETURNS trigger AS $$
DECLARE
    v_item JSONB;
    v_addon_id UUID;
    v_override_item JSONB;
    v_recipe_from_db RECORD;
    v_variant_data RECORD;
    v_addon_data RECORD;
    v_store_id UUID;
    v_dispatch_station_name TEXT;
    v_item_qty NUMERIC;
    v_sellable_type_raw TEXT; 
    v_sellable_type TEXT;
    v_sellable_id UUID;
    v_variant_id UUID;
    v_recipe_multiplier NUMERIC;
    v_target_location_id UUID;
    v_consumption_result JSONB;
    v_package_size NUMERIC;
BEGIN
    -- 1. Guard Clauses
    IF (NEW.status IN ('served', 'delivered', 'Entregado')) 
       AND (NEW.is_paid = TRUE) 
       AND (NEW.stock_deducted = FALSE) THEN
       
       v_store_id := NEW.store_id;
       v_dispatch_station_name := NEW.dispatch_station;

       -- 2. Determine Location
       IF v_dispatch_station_name IS NOT NULL THEN
            SELECT id INTO v_target_location_id
            FROM storage_locations
            WHERE store_id = v_store_id 
            AND name = v_dispatch_station_name
            LIMIT 1;
       END IF;

       -- Fallback: If no specific location found
       IF v_target_location_id IS NULL THEN
            SELECT id INTO v_target_location_id 
            FROM storage_locations 
            WHERE store_id = v_store_id 
            AND (name ILIKE '%Principal%' OR name ILIKE '%Main%')
            ORDER BY created_at ASC
            LIMIT 1;
       END IF;

       -- 3. Process Items
       IF NEW.items IS NOT NULL THEN
           FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items)
           LOOP
                v_item_qty := (COALESCE(v_item->>'quantity', '0'))::NUMERIC;
                v_sellable_id := (v_item->>'id')::UUID;
                v_variant_id := (v_item->>'variant_id')::UUID;
                
                -- Smart Type Detection
                v_sellable_type_raw := v_item->>'sellable_type';
                IF v_sellable_type_raw IS NOT NULL THEN
                     v_sellable_type := v_sellable_type_raw;
                ELSE
                     PERFORM 1 FROM products WHERE id = v_sellable_id;
                     IF FOUND THEN v_sellable_type := 'product'; ELSE v_sellable_type := 'inventory_item'; END IF;
                END IF;

                -- --- FLOW A: INVENTORY ITEM (RETAIL DIRECT SALE) ---
                IF v_sellable_type = 'inventory_item' THEN
                    -- NEW: Retail Logic - Multiply by package_size for direct sales
                    SELECT COALESCE(package_size, 1.0) INTO v_package_size
                    FROM inventory_items WHERE id = v_sellable_id;
                    
                    v_item_qty := v_item_qty * v_package_size;

                    v_recipe_multiplier := 1.0;
                    IF v_variant_id IS NOT NULL THEN
                        SELECT (v->>'recipe_multiplier')::NUMERIC INTO v_recipe_multiplier
                        FROM inventory_items, jsonb_array_elements(variants) v
                        WHERE id = v_sellable_id AND (v->>'id')::text = v_variant_id::text;
                        v_recipe_multiplier := COALESCE(v_recipe_multiplier, 1.0);
                    END IF;

                    v_item_qty := v_item_qty * v_recipe_multiplier;
                    
                    v_consumption_result := consume_from_open_packages(
                        v_sellable_id,
                        v_store_id,
                        v_item_qty,
                        NULL, 
                        'order_delivered',
                        NEW.id,
                        v_target_location_id
                    );
                    
                    -- Error Check
                    IF (v_consumption_result->>'success')::boolean = FALSE THEN
                         RAISE EXCEPTION 'Stock Deduction Failed: %', v_consumption_result->>'error';
                    END IF;

                -- --- FLOW B: PRODUCT WITH RECIPE ---
                ELSIF v_sellable_type = 'product' THEN
                    v_recipe_multiplier := 1.0;
                    IF v_variant_id IS NOT NULL THEN
                        SELECT recipe_multiplier INTO v_recipe_multiplier
                        FROM product_variants WHERE id = v_variant_id;
                        v_recipe_multiplier := COALESCE(v_recipe_multiplier, 1.0);
                    END IF;

                    -- 1. Base Recipe
                    FOR v_recipe_from_db IN 
                        SELECT ri.inventory_item_id, ri.quantity_required, ii.unit_type
                        FROM product_recipes ri
                        JOIN inventory_items ii ON ii.id = ri.inventory_item_id
                        WHERE ri.product_id = v_sellable_id
                    LOOP
                        v_item_qty := v_recipe_from_db.quantity_required * v_recipe_multiplier * (COALESCE(v_item->>'quantity', '1'))::NUMERIC;
                        
                        v_consumption_result := consume_from_open_packages(
                            v_recipe_from_db.inventory_item_id,
                            v_store_id,
                            v_item_qty,
                            v_recipe_from_db.unit_type,
                            'order_delivered',
                            NEW.id,
                            v_target_location_id
                        );
                        
                        IF (v_consumption_result->>'success')::boolean = FALSE THEN
                             RAISE EXCEPTION 'Recipe Deduction Failed: %', v_consumption_result->>'error';
                        END IF;
                    END LOOP;

                     -- 2. Variant Overrides
                    IF v_variant_id IS NOT NULL THEN
                        SELECT recipe_overrides INTO v_variant_data FROM product_variants WHERE id = v_variant_id;
                        IF v_variant_data.recipe_overrides IS NOT NULL AND jsonb_array_length(v_variant_data.recipe_overrides) > 0 THEN
                            FOR v_override_item IN SELECT * FROM jsonb_array_elements(v_variant_data.recipe_overrides)
                            LOOP
                                v_addon_id := (v_override_item->>'inventory_item_id')::UUID;
                                v_item_qty := (v_override_item->>'quantity')::NUMERIC * (COALESCE(v_item->>'quantity', '1'))::NUMERIC;
                                
                                v_consumption_result := consume_from_open_packages(
                                    v_addon_id,
                                    v_store_id,
                                    v_item_qty,
                                    NULL,
                                    'variant_override',
                                    NEW.id,
                                    v_target_location_id
                                );
                                
                                IF (v_consumption_result->>'success')::boolean = FALSE THEN
                                     RAISE EXCEPTION 'Variant Override Failed: %', v_consumption_result->>'error';
                                END IF;
                            END LOOP;
                        END IF;
                    END IF;

                    -- 3. Addons
                    IF v_item ? 'addon_ids' AND jsonb_typeof(v_item->'addon_ids') = 'array' THEN
                        FOR v_addon_id IN SELECT (val::text)::UUID FROM jsonb_array_elements_text(v_item->'addon_ids') AS val
                        LOOP
                            SELECT pa.inventory_item_id, pa.quantity_consumed, ii.unit_type 
                            INTO v_addon_data 
                            FROM product_addons pa
                            JOIN inventory_items ii ON ii.id = pa.inventory_item_id
                            WHERE pa.id = v_addon_id;
                            
                            IF v_addon_data.inventory_item_id IS NOT NULL THEN
                                v_item_qty := (COALESCE(v_item->>'quantity', '1'))::NUMERIC;
                                v_item_qty := v_addon_data.quantity_consumed * v_item_qty;

                                v_consumption_result := consume_from_open_packages(
                                    v_addon_data.inventory_item_id,
                                    v_store_id,
                                    v_item_qty,
                                    v_addon_data.unit_type,
                                    'addon_consumed',
                                    NEW.id,
                                    v_target_location_id
                                );
                                
                                IF (v_consumption_result->>'success')::boolean = FALSE THEN
                                     RAISE EXCEPTION 'Addon Deduction Failed: %', v_consumption_result->>'error';
                                END IF;
                            END IF;
                        END LOOP;
                    END IF;
                END IF;
           END LOOP;
       END IF;

       -- 4. Mark as deducted
       NEW.stock_deducted := TRUE;
       NEW.updated_at := NOW();
       
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
