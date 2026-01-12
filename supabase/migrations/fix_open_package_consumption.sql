-- ============================================================
-- FUNCIÓN: Consumir stock inteligente desde Open Packages
-- Payper SaaS - Inventory Management
-- ============================================================

-- Esta función maneja el consumo de ingredientes de manera inteligente:
-- 1. Si hay un open_package activo → descuenta de remaining
-- 2. Si no hay o remaining insuficiente → abre automáticamente un paquete cerrado
-- 3. Registra el movimiento en stock_movements

CREATE OR REPLACE FUNCTION consume_from_open_packages(
    p_item_id UUID,
    p_store_id UUID,
    p_required_qty NUMERIC,
    p_unit TEXT DEFAULT 'g',
    p_reason TEXT DEFAULT 'recipe_consumption',
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_open_pkg RECORD;
    v_remaining_to_consume NUMERIC;
    v_consumed_from_pkg NUMERIC;
    v_packages_opened INTEGER := 0;
    v_total_consumed NUMERIC := 0;
BEGIN
    -- 1. Get the item details
    SELECT id, name, package_size, closed_stock, current_stock, unit_type
    INTO v_item
    FROM inventory_items
    WHERE id = p_item_id AND store_id = p_store_id;
    
    IF v_item IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item not found');
    END IF;
    
    v_remaining_to_consume := p_required_qty;
    
    -- 2. Loop: consume from open packages or open new ones
    WHILE v_remaining_to_consume > 0 LOOP
        -- Find an active open package with remaining stock
        SELECT id, remaining, package_capacity
        INTO v_open_pkg
        FROM open_packages
        WHERE inventory_item_id = p_item_id 
          AND store_id = p_store_id 
          AND is_active = true 
          AND remaining > 0
        ORDER BY opened_at ASC  -- FIFO: oldest first
        LIMIT 1;
        
        IF v_open_pkg IS NOT NULL THEN
            -- Consume from this package
            v_consumed_from_pkg := LEAST(v_open_pkg.remaining, v_remaining_to_consume);
            
            UPDATE open_packages
            SET remaining = remaining - v_consumed_from_pkg,
                updated_at = NOW(),
                -- Close package if empty
                is_active = CASE WHEN (remaining - v_consumed_from_pkg) <= 0 THEN false ELSE true END,
                closed_at = CASE WHEN (remaining - v_consumed_from_pkg) <= 0 THEN NOW() ELSE NULL END
            WHERE id = v_open_pkg.id;
            
            v_remaining_to_consume := v_remaining_to_consume - v_consumed_from_pkg;
            v_total_consumed := v_total_consumed + v_consumed_from_pkg;
            
        ELSE
            -- No open package available, try to open a new one
            IF COALESCE(v_item.closed_stock, 0) <= 0 THEN
                -- No closed stock available either - we're out of stock!
                -- Still proceed but log warning
                RAISE NOTICE 'Item % has no closed stock to open', v_item.name;
                EXIT; -- Exit loop, we can't consume more
            END IF;
            
            -- Decrement closed_stock
            UPDATE inventory_items
            SET closed_stock = GREATEST(closed_stock - 1, 0)
            WHERE id = p_item_id;
            
            -- Create new open package
            INSERT INTO open_packages (
                inventory_item_id,
                store_id,
                package_capacity,
                remaining,
                unit,
                opened_at,
                is_active
            ) VALUES (
                p_item_id,
                p_store_id,
                COALESCE(v_item.package_size, 1),
                COALESCE(v_item.package_size, 1),
                COALESCE(p_unit, v_item.unit_type, 'un'),
                NOW(),
                true
            );
            
            v_packages_opened := v_packages_opened + 1;
            
            -- Continue loop to consume from the newly opened package
        END IF;
    END LOOP;
    
    -- 3. Update current_stock (total effective stock)
    UPDATE inventory_items
    SET current_stock = current_stock - v_total_consumed
    WHERE id = p_item_id;
    
    -- 4. Log the movement
    INSERT INTO stock_movements (
        inventory_item_id,
        store_id,
        qty_delta,
        unit_type,
        reason,
        order_id,
        created_at
    ) VALUES (
        p_item_id,
        p_store_id,
        -v_total_consumed,
        p_unit,
        p_reason,
        p_order_id,
        NOW()
    );
    
    RETURN jsonb_build_object(
        'success', true,
        'consumed', v_total_consumed,
        'packages_opened', v_packages_opened,
        'item_name', v_item.name
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION consume_from_open_packages TO authenticated;

-- ============================================================
-- UPDATE: create_order_with_stock_deduction to use new function
-- ============================================================

CREATE OR REPLACE FUNCTION create_order_with_stock_deduction(
    p_store_id UUID,
    p_customer_name TEXT,
    p_total_amount NUMERIC,
    p_status TEXT DEFAULT 'pending',
    p_order_items JSONB DEFAULT '[]'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_recipe RECORD;
    v_consumption_result JSONB;
    v_item_qty INTEGER;
BEGIN
    -- 1. Insertar el pedido principal
    INSERT INTO orders (store_id, customer_name, total_amount, status)
    VALUES (p_store_id, p_customer_name, p_total_amount, p_status)
    RETURNING id INTO v_order_id;
    
    -- 2. Insertar cada item del pedido
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
    LOOP
        INSERT INTO order_items (
            order_id,
            product_id,
            name,
            quantity,
            price_unit,
            variant_name,
            addons,
            note
        ) VALUES (
            v_order_id,
            (v_item->>'product_id')::UUID,
            v_item->>'name',
            COALESCE((v_item->>'quantity')::INTEGER, 1),
            COALESCE((v_item->>'price_unit')::NUMERIC, 0),
            v_item->>'variant_name',
            COALESCE(v_item->'addons', '[]'),
            v_item->>'note'
        );
        
        -- 3. Descontar stock usando la nueva función inteligente
        v_product_id := (v_item->>'product_id')::UUID;
        v_item_qty := COALESCE((v_item->>'quantity')::INTEGER, 1);
        
        IF v_product_id IS NOT NULL THEN
            FOR v_recipe IN 
                SELECT pr.inventory_item_id, pr.quantity_required, ii.unit_type
                FROM product_recipes pr
                JOIN inventory_items ii ON ii.id = pr.inventory_item_id
                WHERE pr.product_id = v_product_id
            LOOP
                -- Use smart consumption function
                v_consumption_result := consume_from_open_packages(
                    v_recipe.inventory_item_id,
                    p_store_id,
                    v_recipe.quantity_required * v_item_qty,
                    COALESCE(v_recipe.unit_type, 'un'),
                    'recipe_consumption',
                    v_order_id
                );
                
                -- Log any issues
                IF NOT (v_consumption_result->>'success')::boolean THEN
                    RAISE NOTICE 'Consumption warning for item %: %', 
                        v_recipe.inventory_item_id, 
                        v_consumption_result->>'error';
                END IF;
            END LOOP;
        END IF;
    END LOOP;
    
    -- 4. Retornar el resultado
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'message', 'Pedido creado con consumo inteligente de stock'
    );
    
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- Ensure permission
GRANT EXECUTE ON FUNCTION create_order_with_stock_deduction TO authenticated;
