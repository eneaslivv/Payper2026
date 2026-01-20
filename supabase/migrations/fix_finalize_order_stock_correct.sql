-- Fix: Use correct column 'item_id' instead of 'inventory_item_id' in inventory_location_stock
CREATE OR REPLACE FUNCTION finalize_order_stock(p_order_id UUID, p_location_id UUID DEFAULT NULL)
RETURNS void AS $$
DECLARE
    v_item JSONB;
    v_addon_id UUID;
    v_override_item JSONB;
    v_recipe_from_db RECORD;
    v_variant_data RECORD;
    v_addon_data RECORD;
    v_order_items JSONB;
    v_store_id UUID;
    v_dispatch_station_name TEXT;
    v_item_qty NUMERIC;
    v_sellable_type TEXT;
    v_sellable_id UUID;
    v_variant_id UUID;
    v_recipe_multiplier NUMERIC;
    v_target_location_id UUID;
    v_station_linked_location_id UUID;
BEGIN
    -- 1. Bloqueo y lectura inicial (incluyendo dispatch_station)
    SELECT store_id, items, dispatch_station
    INTO v_store_id, v_order_items, v_dispatch_station_name
    FROM orders 
    WHERE id = p_order_id AND stock_deducted = FALSE AND is_paid = TRUE
    FOR UPDATE;

    -- Si no hay items o ya se descontó (por el WHERE), salir
    IF v_order_items IS NULL THEN
        RAISE NOTICE 'Order not found or already deducted: %', p_order_id;
        RETURN;
    END IF;

    -- 2. Determinar ubicación de descuento
    IF p_location_id IS NOT NULL THEN
        v_target_location_id := p_location_id;
    ELSE
        -- Intentar buscar ubicación por estación
        IF v_dispatch_station_name IS NOT NULL THEN
            SELECT storage_location_id INTO v_station_linked_location_id
            FROM dispatch_stations
            WHERE store_id = v_store_id AND name = v_dispatch_station_name
            LIMIT 1;
        END IF;

        IF v_station_linked_location_id IS NOT NULL THEN
            v_target_location_id := v_station_linked_location_id;
        ELSE
            -- Fallback: Buscar 'Principal' o 'Main'
            SELECT id INTO v_target_location_id 
            FROM storage_locations 
            WHERE store_id = v_store_id 
            AND (name ILIKE '%Principal%' OR name ILIKE '%Main%')
            ORDER BY created_at ASC
            LIMIT 1;
        END IF;
    END IF;

    -- 3. Procesar cada ítem del pedido
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_order_items)
    LOOP
        v_item_qty := (COALESCE(v_item->>'quantity', '0'))::NUMERIC;
        v_sellable_id := (v_item->>'id')::UUID;
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_sellable_type := COALESCE(v_item->>'sellable_type', 'inventory_item');

        -- --- FLUJO A: INVENTORY ITEM DIRECTO ---
        IF v_sellable_type = 'inventory_item' THEN
            v_recipe_multiplier := 1.0;
            IF v_variant_id IS NOT NULL THEN
                SELECT (v->>'recipe_multiplier')::NUMERIC
                INTO v_recipe_multiplier
                FROM inventory_items, jsonb_array_elements(variants) v
                WHERE id = v_sellable_id AND (v->>'id')::text = v_variant_id::text;
                
                v_recipe_multiplier := COALESCE(v_recipe_multiplier, 1.0);
            END IF;

            v_item_qty := v_item_qty * v_recipe_multiplier;

            -- A.1 Descuento Global
            UPDATE inventory_items 
            SET current_stock = current_stock - (CASE WHEN unit_type = 'unit' THEN ROUND(v_item_qty) ELSE v_item_qty END), 
                updated_at = NOW()
            WHERE id = v_sellable_id AND store_id = v_store_id;

            -- A.2 Descuento por Ubicación (FIXED COLUMN item_id)
            IF v_target_location_id IS NOT NULL THEN
                INSERT INTO inventory_location_stock (item_id, location_id, store_id, closed_units)
                VALUES (v_sellable_id, v_target_location_id, v_store_id, -v_item_qty)
                ON CONFLICT (item_id, location_id) 
                DO UPDATE SET closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units, updated_at = NOW();
            END IF;

            IF FOUND THEN
                INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
                SELECT gen_random_uuid(), v_store_id, v_sellable_id, p_order_id, -(CASE WHEN unit_type = 'unit' THEN ROUND(v_item_qty) ELSE v_item_qty END), unit_type, 'order_delivered', v_target_location_id
                FROM inventory_items WHERE id = v_sellable_id;
            END IF;

        -- --- FLUJO B: PRODUCTO CON RECETA ---
        ELSIF v_sellable_type = 'product' THEN
            v_recipe_multiplier := 1.0;
            IF v_variant_id IS NOT NULL THEN
                SELECT recipe_multiplier 
                INTO v_recipe_multiplier
                FROM product_variants 
                WHERE id = v_variant_id;
                
                v_recipe_multiplier := COALESCE(v_recipe_multiplier, 1.0);
            END IF;

            -- 1. RECETA BASE (con multiplicador)
            FOR v_recipe_from_db IN 
                SELECT ri.inventory_item_id, ri.quantity_required, ii.unit_type
                FROM product_recipes ri
                JOIN inventory_items ii ON ii.id = ri.inventory_item_id
                WHERE ri.product_id = v_sellable_id
            LOOP
                -- Apply multiplier to base recipe
                v_item_qty := v_recipe_from_db.quantity_required * v_recipe_multiplier * (COALESCE(v_item->>'quantity', '1'))::NUMERIC;
                v_item_qty := (CASE WHEN v_recipe_from_db.unit_type = 'unit' THEN ROUND(v_item_qty) ELSE v_item_qty END);
                
                -- Global
                UPDATE inventory_items 
                SET current_stock = current_stock - v_item_qty, updated_at = NOW()
                WHERE id = v_recipe_from_db.inventory_item_id AND store_id = v_store_id;

                -- Location (FIXED COLUMN item_id)
                IF v_target_location_id IS NOT NULL THEN
                    INSERT INTO inventory_location_stock (item_id, location_id, store_id, closed_units)
                    VALUES (v_recipe_from_db.inventory_item_id, v_target_location_id, v_store_id, -v_item_qty)
                    ON CONFLICT (item_id, location_id) 
                    DO UPDATE SET closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units, updated_at = NOW();
                END IF;

                IF FOUND THEN
                    INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
                    VALUES (gen_random_uuid(), v_store_id, v_recipe_from_db.inventory_item_id, p_order_id, -v_item_qty, v_recipe_from_db.unit_type, 'order_delivered', v_target_location_id);
                END IF;
            END LOOP;

             -- 2. VARIANTES (RECIPE OVERRIDES)
            IF v_variant_id IS NOT NULL THEN
                SELECT recipe_overrides INTO v_variant_data FROM product_variants WHERE id = v_variant_id;
                
                IF v_variant_data.recipe_overrides IS NOT NULL AND jsonb_array_length(v_variant_data.recipe_overrides) > 0 THEN
                    FOR v_override_item IN SELECT * FROM jsonb_array_elements(v_variant_data.recipe_overrides)
                    LOOP
                        v_addon_id := (v_override_item->>'inventory_item_id')::UUID;
                        v_item_qty := (v_override_item->>'quantity')::NUMERIC * (COALESCE(v_item->>'quantity', '1'))::NUMERIC;
                        
                        SELECT unit_type INTO v_sellable_type FROM inventory_items WHERE id = v_addon_id;
                        IF v_sellable_type = 'unit' THEN v_item_qty := ROUND(v_item_qty); END IF;

                        -- Global
                        UPDATE inventory_items 
                        SET current_stock = current_stock - v_item_qty, updated_at = NOW()
                        WHERE id = v_addon_id AND store_id = v_store_id;

                        -- Location (FIXED COLUMN item_id)
                        IF v_target_location_id IS NOT NULL THEN
                            INSERT INTO inventory_location_stock (item_id, location_id, store_id, closed_units)
                            VALUES (v_addon_id, v_target_location_id, v_store_id, -v_item_qty)
                            ON CONFLICT (item_id, location_id) 
                            DO UPDATE SET closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units, updated_at = NOW();
                        END IF;

                        IF FOUND THEN
                            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
                            VALUES (gen_random_uuid(), v_store_id, v_addon_id, p_order_id, -v_item_qty, v_sellable_type, 'variant_override', v_target_location_id);
                        END IF;
                    END LOOP;
                END IF;
            END IF;

            -- 3. ADDONS
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
                        IF v_addon_data.unit_type = 'unit' THEN v_item_qty := ROUND(v_item_qty); END IF;

                        -- Global
                        UPDATE inventory_items
                        SET current_stock = current_stock - v_item_qty, updated_at = NOW()
                        WHERE id = v_addon_data.inventory_item_id AND store_id = v_store_id;

                        -- Location (FIXED COLUMN item_id)
                        IF v_target_location_id IS NOT NULL THEN
                            INSERT INTO inventory_location_stock (item_id, location_id, store_id, closed_units)
                            VALUES (v_addon_data.inventory_item_id, v_target_location_id, v_store_id, -v_item_qty)
                            ON CONFLICT (item_id, location_id) 
                            DO UPDATE SET closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units, updated_at = NOW();
                        END IF;

                        IF FOUND THEN
                            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
                            VALUES (gen_random_uuid(), v_store_id, v_addon_data.inventory_item_id, p_order_id, -v_item_qty, v_addon_data.unit_type, 'addon_consumed', v_target_location_id);
                        END IF;
                    END IF;
                END LOOP;
            END IF;
        END IF;
    END LOOP;

    -- 4. Marcar como descontado
    UPDATE orders SET stock_deducted = TRUE, updated_at = NOW() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
