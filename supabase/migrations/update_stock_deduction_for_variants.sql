CREATE OR REPLACE FUNCTION finalize_order_stock(p_order_id UUID)
RETURNS void AS $$
DECLARE
    v_item JSONB;
    v_addon_id UUID;
    v_override_item JSONB;
    v_recipe_from_db RECORD;
    v_variant_data JSONB; -- Changed to JSONB to hold the variant object from the array
    v_addon_data RECORD;
    v_order_items JSONB;
    v_store_id UUID;
    v_item_qty NUMERIC;
    v_sellable_type TEXT;
    v_sellable_id UUID;
    v_variant_id UUID;
BEGIN
    -- 1. Bloqueo y lectura inicial
    SELECT store_id, items
    INTO v_store_id, v_order_items
    FROM orders 
    WHERE id = p_order_id AND stock_deducted = FALSE AND is_paid = TRUE
    FOR UPDATE;

    IF v_order_items IS NULL THEN
        RETURN;
    END IF;

    -- 2. Procesar cada ítem del pedido
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_order_items)
    LOOP
        v_item_qty := (COALESCE(v_item->>'quantity', '0'))::NUMERIC;
        v_sellable_id := (v_item->>'id')::UUID;
        v_variant_id := (v_item->>'variant_id')::UUID;
        -- Si sellable_type es NULL, asumir 'inventory_item' por defecto
        v_sellable_type := COALESCE(v_item->>'sellable_type', 'inventory_item');

        -- --- FLUJO A: INVENTORY ITEM DIRECTO ---
        -- Incluye items con sellable_type NULL o 'inventory_item'
        IF v_sellable_type = 'inventory_item' THEN
            -- Validación de unidades: Para 'unit' redondeamos a entero
            UPDATE inventory_items 
            SET current_stock = current_stock - (CASE WHEN unit_type = 'unit' THEN ROUND(v_item_qty) ELSE v_item_qty END), 
                updated_at = NOW()
            WHERE id = v_sellable_id AND store_id = v_store_id;

            IF FOUND THEN
                INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                SELECT gen_random_uuid(), v_store_id, v_sellable_id, p_order_id, -(CASE WHEN unit_type = 'unit' THEN ROUND(v_item_qty) ELSE v_item_qty END), unit_type, 'order_delivered'
                FROM inventory_items WHERE id = v_sellable_id;
            END IF;

        -- --- FLUJO B: PRODUCTO CON RECETA ---
        ELSIF v_sellable_type = 'product' THEN
            -- VALIDACIÓN CRÍTICA: Producto DEBE tener receta
            IF NOT EXISTS (
                SELECT 1 FROM product_recipes 
                WHERE product_id = v_sellable_id
            ) THEN
                RAISE EXCEPTION 'Producto % no tiene receta configurada. No se puede descontar stock.', v_sellable_id;
            END IF;

            -- 1. RECETA BASE
            FOR v_recipe_from_db IN 
                SELECT ri.inventory_item_id, ri.quantity_required, ii.unit_type
                FROM product_recipes ri
                JOIN inventory_items ii ON ii.id = ri.inventory_item_id
                WHERE ri.product_id = v_sellable_id
            LOOP
                -- Validación de unidades
                v_item_qty := (CASE WHEN v_recipe_from_db.unit_type = 'unit' THEN ROUND(v_recipe_from_db.quantity_required * v_item_qty) ELSE v_recipe_from_db.quantity_required * v_item_qty END);
                
                UPDATE inventory_items 
                SET current_stock = current_stock - v_item_qty, updated_at = NOW()
                WHERE id = v_recipe_from_db.inventory_item_id AND store_id = v_store_id;

                IF FOUND THEN
                    INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                    VALUES (gen_random_uuid(), v_store_id, v_recipe_from_db.inventory_item_id, p_order_id, -v_item_qty, v_recipe_from_db.unit_type, 'order_delivered');
                END IF;
            END LOOP;

            -- 2. VARIANTES (RECIPE OVERRIDES)
            -- MODIFICADO: Ahora lee directamente del JSONB en inventory_items
            IF v_variant_id IS NOT NULL THEN
                -- Buscar la variante específica dentro del JSONB array 'variants' del ítem padre
                SELECT elem 
                INTO v_variant_data
                FROM inventory_items,
                     jsonb_array_elements(variants) as elem
                WHERE id = v_sellable_id 
                  AND (elem->>'id')::UUID = v_variant_id
                LIMIT 1;
                
                IF v_variant_data IS NOT NULL AND (v_variant_data->'recipe_overrides') IS NOT NULL AND jsonb_array_length(v_variant_data->'recipe_overrides') > 0 THEN
                    FOR v_override_item IN SELECT * FROM jsonb_array_elements(v_variant_data->'recipe_overrides')
                    LOOP
                        v_addon_id := (v_override_item->>'ingredient_id')::UUID; -- FIXED: was inventory_item_id in SQL but ingredient_id in frontend types
                        v_item_qty := (v_override_item->>'quantity_delta')::NUMERIC * (COALESCE(v_item->>'quantity', '1'))::NUMERIC; -- FIXED: was quantity in SQL but quantity_delta in frontend types
                        
                        -- Validación de unidades activa
                        SELECT unit_type INTO v_sellable_type FROM inventory_items WHERE id = v_addon_id; -- Reusamos variable temporal v_sellable_type para el unit_type
                        IF v_sellable_type = 'unit' THEN v_item_qty := ROUND(v_item_qty); END IF;

                        UPDATE inventory_items 
                        SET current_stock = current_stock - v_item_qty, updated_at = NOW()
                        WHERE id = v_addon_id AND store_id = v_store_id;

                        IF FOUND THEN
                            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                            VALUES (gen_random_uuid(), v_store_id, v_addon_id, p_order_id, -v_item_qty, v_sellable_type, 'variant_override');
                        END IF;
                    END LOOP;
                END IF;
                v_sellable_type := 'product'; -- Restaurar sellable_type
            END IF;

            -- 3. ADDONS
            IF v_item ? 'addon_ids' AND jsonb_typeof(v_item->'addon_ids') = 'array' THEN
                FOR v_addon_id IN SELECT (val::text)::UUID FROM jsonb_array_elements_text(v_item->'addon_ids') AS val
                LOOP
                    -- LÓGICA HÍBRIDA: Intentar leer de JSONB (frontend actual)
                    -- Buscamos el addon en el array 'addon_links' del item base
                    SELECT 
                        (addon_elem->>'inventory_item_id')::UUID, 
                        (addon_elem->>'quantity_consumed')::NUMERIC,
                        (addon_elem->>'price')::NUMERIC
                    INTO v_addon_data
                    FROM inventory_items,
                         jsonb_array_elements(addon_links) as addon_elem
                    WHERE id = v_sellable_id 
                      AND (addon_elem->>'id')::UUID = v_addon_id
                    LIMIT 1;

                    -- Si no se encontró en JSON, intentar tabla legacy (opcional, pero mantenemos por seguridad)
                    IF v_addon_data.inventory_item_id IS NULL THEN
                         BEGIN
                            SELECT pa.inventory_item_id, pa.quantity_consumed 
                            INTO v_addon_data 
                            FROM product_addons pa 
                            WHERE pa.id = v_addon_id;
                         EXCEPTION WHEN OTHERS THEN
                            -- Ignorar error si tabla no existe
                            v_addon_data.inventory_item_id := NULL;
                         END;
                    END IF;

                    -- Procesar deducción si encontramos datos válidos
                    IF v_addon_data.inventory_item_id IS NOT NULL THEN
                        -- Obtener unit_type del ingrediente
                        SELECT unit_type INTO v_sellable_type FROM inventory_items WHERE id = v_addon_data.inventory_item_id;

                        v_item_qty := (COALESCE(v_item->>'quantity', '1'))::NUMERIC;
                        v_item_qty := (CASE WHEN v_sellable_type = 'unit' THEN ROUND(v_addon_data.quantity_consumed * v_item_qty) ELSE v_addon_data.quantity_consumed * v_item_qty END);

                        UPDATE inventory_items
                        SET current_stock = current_stock - v_item_qty, updated_at = NOW()
                        WHERE id = v_addon_data.inventory_item_id AND store_id = v_store_id;

                        IF FOUND THEN
                            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                            VALUES (gen_random_uuid(), v_store_id, v_addon_data.inventory_item_id, p_order_id, -v_item_qty, v_sellable_type, 'addon_consumed');
                        END IF;
                    END IF;
                END LOOP;
            END IF;
        END IF;
    END LOOP;

    -- 3. Marcar como descontado
    UPDATE orders SET stock_deducted = TRUE, updated_at = NOW() WHERE id = p_order_id;
END;
$$ LANGUAGE plpgsql;
