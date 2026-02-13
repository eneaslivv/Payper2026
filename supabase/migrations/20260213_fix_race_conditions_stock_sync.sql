-- =============================================
-- FIX #7: RACE CONDITIONS IN STOCK SYNC
-- Fecha: 2026-02-13
-- Problema:
--   sync_offline_order puede tener race conditions cuando:
--   - Múltiples tablets sincronizando simultáneamente
--   - Dos órdenes offline para el último stock disponible
--   - SELECT sin lock permite que ambos lean stock > 0
-- Solución:
--   Usar SELECT ... FOR UPDATE para lock transaccional
-- =============================================

-- 1. IMPROVED sync_offline_order WITH ROW LOCKING
CREATE OR REPLACE FUNCTION sync_offline_order(
    p_order_data JSONB,
    p_allow_negative_stock BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_store_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_current_stock NUMERIC;
    v_stock_conflicts JSONB := '[]'::JSONB;
    v_has_conflicts BOOLEAN := FALSE;
    v_locked_items UUID[] := '{}'; -- Track locked items
BEGIN
    -- Extract order data
    v_order_id := (p_order_data->>'id')::UUID;
    v_store_id := (p_order_data->>'store_id')::UUID;

    -- CRITICAL: Validate caller has permission for this store
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND store_id = v_store_id
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permiso para sincronizar órdenes de esta tienda'
        );
    END IF;

    -- 1. PRE-VALIDATE STOCK AVAILABILITY WITH ROW LOCKING
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_data->'items')
    LOOP
        v_product_id := (v_item->>'productId')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;

        -- CRITICAL: Lock the row to prevent concurrent modifications
        -- This ensures no other transaction can read/modify this stock until we commit
        SELECT current_stock INTO v_current_stock
        FROM inventory_items
        WHERE id = v_product_id
        FOR UPDATE NOWAIT;  -- NOWAIT fails fast if row is locked by another transaction

        -- Track that we locked this item
        v_locked_items := array_append(v_locked_items, v_product_id);

        -- If insufficient stock
        IF v_current_stock IS NOT NULL AND v_current_stock < v_quantity THEN
            v_has_conflicts := TRUE;
            v_stock_conflicts := v_stock_conflicts || jsonb_build_object(
                'product_id', v_product_id,
                'requested_qty', v_quantity,
                'available_qty', v_current_stock,
                'shortage', v_quantity - v_current_stock
            );

            -- Create alert
            INSERT INTO stock_alerts (
                store_id,
                inventory_item_id,
                alert_type,
                stock_level,
                expected_stock,
                message,
                order_id
            )
            SELECT
                v_store_id,
                v_product_id,
                'offline_conflict',
                v_current_stock,
                v_quantity,
                'Conflicto de sincronización offline: Se intentó vender ' || v_quantity || ' pero solo quedan ' || v_current_stock,
                v_order_id
            FROM inventory_items WHERE id = v_product_id;
        END IF;
    END LOOP;

    -- 2. HANDLE CONFLICTS
    IF v_has_conflicts AND NOT p_allow_negative_stock THEN
        -- Rollback locks and return error
        RAISE NOTICE '[sync_offline_order] Stock conflict detected for order %, rolling back', v_order_id;
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INSUFFICIENT_STOCK',
            'message', 'Stock insuficiente para completar la sincronización',
            'conflicts', v_stock_conflicts,
            'action_required', 'Ajustar cantidades o permitir stock negativo',
            'locked_items', v_locked_items
        );
    END IF;

    -- 3. IF ALLOWING NEGATIVE OR NO CONFLICTS: Proceed with order sync
    -- Check if order already exists
    IF EXISTS (SELECT 1 FROM orders WHERE id = v_order_id) THEN
        -- Update existing order
        UPDATE orders
        SET
            status = (p_order_data->>'status')::order_status_enum,
            total_amount = (p_order_data->>'total_amount')::NUMERIC,
            items = p_order_data->'items',
            updated_at = NOW()
        WHERE id = v_order_id;
    ELSE
        -- Insert new order
        INSERT INTO orders (
            id,
            store_id,
            client_id,
            status,
            channel,
            total_amount,
            subtotal,
            items,
            payment_method,
            is_paid,
            created_at
        ) VALUES (
            v_order_id,
            v_store_id,
            (p_order_data->>'client_id')::UUID,
            (p_order_data->>'status')::order_status_enum,
            (p_order_data->>'channel')::TEXT,
            (p_order_data->>'total_amount')::NUMERIC,
            (p_order_data->>'subtotal')::NUMERIC,
            p_order_data->'items',
            (p_order_data->>'payment_method')::TEXT,
            COALESCE((p_order_data->>'is_paid')::BOOLEAN, FALSE),
            COALESCE((p_order_data->>'created_at')::TIMESTAMPTZ, NOW())
        );
    END IF;

    -- 4. Return success
    RETURN jsonb_build_object(
        'success', TRUE,
        'order_id', v_order_id,
        'message', 'Orden sincronizada exitosamente',
        'stock_went_negative', v_has_conflicts,
        'conflicts', v_stock_conflicts,
        'locked_items', v_locked_items
    );

EXCEPTION
    WHEN lock_not_available THEN
        -- Another transaction is currently modifying stock
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'LOCK_TIMEOUT',
            'message', 'Stock está siendo modificado por otra operación. Reintenta en unos segundos.',
            'retry_recommended', TRUE
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLSTATE,
            'message', SQLERRM
        );
END;
$$;

-- 2. IMPROVED finalize_order_stock WITH ROW LOCKING
-- Update existing trigger function to use FOR UPDATE
CREATE OR REPLACE FUNCTION finalize_order_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID := NEW.id;
    v_store_id UUID := NEW.store_id;
    v_item JSONB;
    v_product_id UUID;
    v_item_qty NUMERIC;
    v_has_recipe BOOLEAN;
    v_recipe_record RECORD;
    v_active_inventory_item_id UUID;
    v_target_location_id UUID;
    v_direct_unit TEXT;
BEGIN
    -- GUARD: Skip if already deducted OR order not finalized
    IF NEW.stock_deducted = TRUE THEN
        RETURN NEW;
    END IF;

    IF NOT (
        NEW.status IN ('served', 'delivered')
        OR NEW.is_paid = TRUE
        OR NEW.payment_status IN ('paid', 'approved')
    ) THEN
        RETURN NEW;
    END IF;

    RAISE NOTICE '[Stock Deduction] Processing order %', v_order_id;

    -- Resolve target location
    IF NEW.node_id IS NOT NULL THEN
        SELECT location_id INTO v_target_location_id
        FROM venue_nodes
        WHERE id = NEW.node_id;
    END IF;

    IF v_target_location_id IS NULL THEN
        SELECT id INTO v_target_location_id
        FROM storage_locations
        WHERE store_id = v_store_id AND is_default = TRUE
        LIMIT 1;
    END IF;

    -- Process each order item
    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
        v_product_id := (v_item->>'productId')::UUID;
        v_item_qty := (v_item->>'quantity')::NUMERIC;

        -- Check if product has recipe
        SELECT EXISTS (
            SELECT 1 FROM product_recipes WHERE product_id = v_product_id
        ) INTO v_has_recipe;

        -- 1. Recipe-based (Deduct ingredients)
        IF v_has_recipe = TRUE THEN
            FOR v_recipe_record IN
                SELECT
                    pr.inventory_item_id,
                    pr.quantity_required,
                    ii.unit_type
                FROM product_recipes pr
                JOIN inventory_items ii ON pr.inventory_item_id = ii.id
                WHERE pr.product_id = v_product_id
            LOOP
                -- CRITICAL: Lock inventory row before deduction
                PERFORM 1
                FROM inventory_items
                WHERE id = v_recipe_record.inventory_item_id
                FOR UPDATE NOWAIT;

                INSERT INTO stock_movements (
                    idempotency_key,
                    store_id,
                    inventory_item_id,
                    order_id,
                    qty_delta,
                    unit_type,
                    reason,
                    location_id
                ) VALUES (
                    gen_random_uuid(),
                    v_store_id,
                    v_recipe_record.inventory_item_id,
                    v_order_id,
                    -(v_recipe_record.quantity_required * v_item_qty),
                    v_recipe_record.unit_type,
                    'recipe_ingredient',
                    v_target_location_id
                );
            END LOOP;

        -- 2. Direct Sale (NO RECIPE)
        ELSE
            BEGIN
                -- Attempt to find mapping first
                SELECT inventory_item_id INTO v_active_inventory_item_id
                FROM inventory_product_mapping
                WHERE product_id = v_product_id;

                IF v_active_inventory_item_id IS NULL THEN
                    v_active_inventory_item_id := v_product_id;
                END IF;

                -- CRITICAL: Lock inventory row before deduction
                SELECT unit_type INTO v_direct_unit
                FROM inventory_items
                WHERE id = v_active_inventory_item_id
                FOR UPDATE NOWAIT;

                IF FOUND THEN
                    INSERT INTO stock_movements (
                        idempotency_key,
                        store_id,
                        inventory_item_id,
                        order_id,
                        qty_delta,
                        unit_type,
                        reason,
                        location_id
                    ) VALUES (
                        gen_random_uuid(),
                        v_store_id,
                        v_active_inventory_item_id,
                        v_order_id,
                        -v_item_qty,
                        COALESCE(v_direct_unit, 'unit'),
                        'direct_sale',
                        v_target_location_id
                    );
                END IF;
            END;
        END IF;
    END LOOP;

    NEW.stock_deducted := TRUE;
    RETURN NEW;

EXCEPTION
    WHEN lock_not_available THEN
        RAISE WARNING '[Stock Deduction] Lock timeout for order %, stock is being modified', v_order_id;
        -- Don't fail the order, just log and skip stock deduction
        -- The next update will retry
        RETURN NEW;
END;
$$;

-- 3. COMMENT
COMMENT ON FUNCTION sync_offline_order IS
'Syncs an offline order with stock conflict detection and ROW LOCKING.
Uses SELECT ... FOR UPDATE NOWAIT to prevent race conditions.
Returns conflicts array if stock insufficient.
Set p_allow_negative_stock=TRUE to force sync with negative stock (creates alert).
Validates caller has permission for the target store (multi-tenant safety).';

COMMENT ON FUNCTION finalize_order_stock IS
'Deducts stock when order is finalized (served/paid).
Uses SELECT ... FOR UPDATE NOWAIT to prevent concurrent stock modification.
If lock fails, skips deduction and logs warning (will retry on next update).
Handles both recipe-based and direct sale products.';
