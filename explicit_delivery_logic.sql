-- 1. Limpiar firmas antiguas para evitar conflictos
DROP FUNCTION IF EXISTS confirm_order_delivery(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS confirm_order_delivery(UUID, UUID);
DROP FUNCTION IF EXISTS confirm_order_delivery(UUID);
DROP FUNCTION IF EXISTS finalize_order_stock(UUID);

-- 2. Asegurar columnas para tracking
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivered_at') THEN
        ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='delivered_by') THEN
        ALTER TABLE orders ADD COLUMN delivered_by UUID;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='stock_deducted') THEN
        ALTER TABLE orders ADD COLUMN stock_deducted BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- ==========================================
-- FINALIZAR STOCK (LÓGICA DE DEDUCCIÓN)
-- ==========================================
-- Soporta: Item Simple, Variantes (recipe_overrides), Recetas (DB) y Addons (JSON).

CREATE OR REPLACE FUNCTION finalize_order_stock(p_order_id UUID)
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
            IF v_variant_id IS NOT NULL THEN
                SELECT recipe_overrides INTO v_variant_data FROM product_variants WHERE id = v_variant_id;
                
                IF v_variant_data.recipe_overrides IS NOT NULL AND jsonb_array_length(v_variant_data.recipe_overrides) > 0 THEN
                    FOR v_override_item IN SELECT * FROM jsonb_array_elements(v_variant_data.recipe_overrides)
                    LOOP
                        v_addon_id := (v_override_item->>'inventory_item_id')::UUID;
                        v_item_qty := (v_override_item->>'quantity')::NUMERIC * (COALESCE(v_item->>'quantity', '1'))::NUMERIC;
                        
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
                    SELECT pa.inventory_item_id, pa.quantity_consumed, ii.unit_type 
                    INTO v_addon_data 
                    FROM product_addons pa
                    JOIN inventory_items ii ON ii.id = pa.inventory_item_id
                    WHERE pa.id = v_addon_id;
                    
                    IF v_addon_data.inventory_item_id IS NOT NULL THEN
                        v_item_qty := (COALESCE(v_item->>'quantity', '1'))::NUMERIC;
                        v_item_qty := (CASE WHEN v_addon_data.unit_type = 'unit' THEN ROUND(v_addon_data.quantity_consumed * v_item_qty) ELSE v_addon_data.quantity_consumed * v_item_qty END);

                        UPDATE inventory_items
                        SET current_stock = current_stock - v_item_qty, updated_at = NOW()
                        WHERE id = v_addon_data.inventory_item_id AND store_id = v_store_id;

                        IF FOUND THEN
                            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                            VALUES (gen_random_uuid(), v_store_id, v_addon_data.inventory_item_id, p_order_id, -v_item_qty, v_addon_data.unit_type, 'addon_consumed');
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

-- ==========================================
-- CONFIRMAR ENTREGA (ACCIÓN DE NEGOCIO)
-- ==========================================
CREATE OR REPLACE FUNCTION confirm_order_delivery(
    p_order_id UUID,
    p_staff_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_order_store_id UUID;
    v_status TEXT;
    v_is_paid BOOLEAN;
BEGIN
    -- 1. Validaciones con bloqueo - store_id se valida desde la orden en DB
    SELECT status, is_paid, store_id
    INTO v_status, v_is_paid, v_order_store_id
    FROM orders WHERE id = p_order_id FOR UPDATE;

    IF v_order_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'La orden no existe.');
    END IF;

    IF v_status = 'served' OR v_status = 'Entregado' THEN
        RETURN jsonb_build_object('success', false, 'message', 'La orden ya fue entregada.');
    END IF;

    IF NOT v_is_paid THEN
        RETURN jsonb_build_object('success', false, 'message', 'La orden no está pagada.');
    END IF;

    -- 2. Marcar como entregada
    UPDATE orders SET 
        status = 'served',
        delivered_at = NOW(),
        delivered_by = p_staff_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 3. Ejecutar deducción de stock (acción explícita, no trigger)
    PERFORM finalize_order_stock(p_order_id);

    RETURN jsonb_build_object('success', true, 'message', 'Orden entregada y stock descontado perfectamente.');
END;
$$ LANGUAGE plpgsql;

-- Permisos
GRANT EXECUTE ON FUNCTION finalize_order_stock TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_order_delivery TO authenticated;
