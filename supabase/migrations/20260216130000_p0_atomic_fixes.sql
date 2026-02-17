-- ============================================================
-- P0 ATOMIC FIXES - 2026-02-16
-- Fixes:
--   1. Atomic order creation (order + items + wallet in one tx)
--   2. transfer_stock() source deduction
--   3. finalize_order_stock() addon deduction
--   4. CHECK constraint on inventory_items.current_stock
-- ============================================================

-- ============================================================
-- P0 FIX #1: ATOMIC ORDER CREATION RPC
-- Replaces non-atomic INSERT + separate wallet call
-- ============================================================

CREATE OR REPLACE FUNCTION create_order_atomic(
    p_order JSONB,
    p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_store_id UUID;
    v_client_id UUID;
    v_total_amount NUMERIC;
    v_payment_method TEXT;
    v_is_paid BOOLEAN;
    v_item JSONB;
    v_order_item_id UUID;
    v_addon_id UUID;
    v_addon_price NUMERIC;
    v_wallet_result JSONB;
    v_caller_id UUID;
    v_caller_store UUID;
    v_caller_role TEXT;
    v_node_id UUID;
    v_cash_session_id UUID;
    v_new_balance NUMERIC;
    v_entry_id UUID;
    v_client_store UUID;
    v_current_balance NUMERIC;
BEGIN
    -- 0. Get caller identity
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Extract order fields
    v_order_id := COALESCE((p_order->>'id')::UUID, gen_random_uuid());
    v_store_id := (p_order->>'store_id')::UUID;
    v_client_id := (p_order->>'client_id')::UUID;
    v_total_amount := COALESCE((p_order->>'total_amount')::NUMERIC, 0);
    v_payment_method := p_order->>'payment_method';
    v_is_paid := COALESCE((p_order->>'is_paid')::BOOLEAN, false);
    v_node_id := (p_order->>'node_id')::UUID;
    v_cash_session_id := (p_order->>'cash_session_id')::UUID;

    -- 1. Validate store access
    -- Check if caller is staff (has profile with store_id)
    SELECT store_id, role INTO v_caller_store, v_caller_role
    FROM profiles WHERE id = v_caller_id;

    IF v_caller_store IS NOT NULL THEN
        -- Staff path: verify store matches
        IF v_caller_store != v_store_id AND v_caller_role != 'super_admin' THEN
            RETURN jsonb_build_object('success', false, 'error', 'STORE_MISMATCH',
                'message', 'No tienes permiso para crear pedidos en este local');
        END IF;
    ELSE
        -- Client path: verify client belongs to this store
        SELECT store_id INTO v_client_store FROM clients WHERE auth_user_id = v_caller_id;
        IF v_client_store IS NULL OR v_client_store != v_store_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'STORE_MISMATCH',
                'message', 'No perteneces a este local');
        END IF;
    END IF;

    -- 2. If wallet payment, validate + lock balance FIRST (prevents TOCTOU)
    IF v_payment_method IN ('wallet', 'Wallet') AND v_client_id IS NOT NULL AND v_total_amount > 0 THEN
        SELECT wallet_balance INTO v_current_balance
        FROM clients
        WHERE id = v_client_id
        FOR UPDATE; -- Row lock prevents concurrent wallet operations

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'CLIENT_NOT_FOUND');
        END IF;

        v_current_balance := COALESCE(v_current_balance, 0);
        IF v_current_balance < v_total_amount THEN
            RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_BALANCE',
                'current_balance', v_current_balance, 'required', v_total_amount);
        END IF;
    END IF;

    -- 3. Resolve cash session if not provided
    IF v_cash_session_id IS NULL AND v_node_id IS NOT NULL THEN
        v_cash_session_id := get_cash_session_for_node(v_node_id, v_store_id);
    END IF;

    IF v_cash_session_id IS NULL THEN
        SELECT id INTO v_cash_session_id
        FROM cash_sessions
        WHERE store_id = v_store_id AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1;
    END IF;

    -- 4. INSERT order
    INSERT INTO orders (
        id, store_id, client_id, total_amount, subtotal,
        status, payment_method, payment_provider, payment_status, is_paid,
        table_number, node_id, cash_session_id, channel,
        delivery_mode, delivery_status, session_id, items,
        created_at, updated_at
    ) VALUES (
        v_order_id,
        v_store_id,
        v_client_id,
        v_total_amount,
        COALESCE((p_order->>'subtotal')::NUMERIC, v_total_amount),
        COALESCE(p_order->>'status', 'pending'),
        v_payment_method,
        p_order->>'payment_provider',
        CASE
            WHEN v_payment_method IN ('wallet', 'Wallet') AND v_is_paid THEN 'approved'
            ELSE COALESCE(p_order->>'payment_status', 'pending')
        END,
        v_is_paid,
        p_order->>'table_number',
        v_node_id,
        v_cash_session_id,
        COALESCE(p_order->>'channel', 'pos'),
        p_order->>'delivery_mode',
        COALESCE(p_order->>'delivery_status', 'pending'),
        (p_order->>'session_id')::UUID,
        '[]'::jsonb, -- Don't store items in legacy JSONB column
        COALESCE((p_order->>'created_at')::TIMESTAMPTZ, NOW()),
        NOW()
    );

    -- 5. INSERT order items + addons
    IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
        LOOP
            INSERT INTO order_items (
                id, order_id, store_id, tenant_id,
                product_id, variant_id, quantity, unit_price, total_price, notes
            ) VALUES (
                gen_random_uuid(),
                v_order_id,
                v_store_id,
                v_store_id,
                (v_item->>'product_id')::UUID,
                (v_item->>'variant_id')::UUID,
                COALESCE((v_item->>'quantity')::NUMERIC, 1),
                COALESCE((v_item->>'unit_price')::NUMERIC, 0),
                COALESCE((v_item->>'unit_price')::NUMERIC, 0) * COALESCE((v_item->>'quantity')::NUMERIC, 1),
                v_item->>'notes'
            )
            RETURNING id INTO v_order_item_id;

            -- Insert addons if present
            IF v_item->'addon_ids' IS NOT NULL AND jsonb_array_length(v_item->'addon_ids') > 0 THEN
                FOR v_addon_id IN SELECT (value)::UUID FROM jsonb_array_elements_text(v_item->'addon_ids')
                LOOP
                    -- Try to get addon price from addon_prices array
                    v_addon_price := 0;
                    IF v_item->'addon_prices' IS NOT NULL THEN
                        SELECT COALESCE((elem->>'price')::NUMERIC, 0) INTO v_addon_price
                        FROM jsonb_array_elements(v_item->'addon_prices') elem
                        WHERE (elem->>'id')::UUID = v_addon_id
                        LIMIT 1;
                    END IF;

                    -- Fallback: look up price from product_addons table
                    IF v_addon_price = 0 THEN
                        SELECT COALESCE(price, 0) INTO v_addon_price
                        FROM product_addons WHERE id = v_addon_id;
                    END IF;

                    INSERT INTO order_item_addons (order_item_id, addon_id, tenant_id, price)
                    VALUES (v_order_item_id, v_addon_id, v_store_id, COALESCE(v_addon_price, 0));
                END LOOP;
            END IF;
        END LOOP;
    END IF;

    -- 6. Process wallet payment atomically (if applicable)
    IF v_payment_method IN ('wallet', 'Wallet') AND v_client_id IS NOT NULL AND v_total_amount > 0 THEN
        v_new_balance := v_current_balance - v_total_amount;

        -- Write to wallet_ledger (trigger will update clients.wallet_balance)
        BEGIN
            INSERT INTO wallet_ledger (
                wallet_id, store_id, amount, balance_after,
                entry_type, reference_type, reference_id,
                description, performed_by, source, payment_method,
                idempotency_key
            ) VALUES (
                v_client_id, v_store_id, -v_total_amount, v_new_balance,
                'payment', 'order', v_order_id,
                'Pago pedido ' || v_order_id::text,
                v_client_id, 'wallet', 'wallet',
                'atomic_pay_' || v_order_id::text
            ) RETURNING id INTO v_entry_id;
        EXCEPTION WHEN unique_violation THEN
            -- Idempotent: wallet already deducted for this order
            NULL;
        END;

        -- Mark order as paid
        UPDATE orders
        SET payment_status = 'approved',
            is_paid = true,
            status = CASE
                WHEN COALESCE(p_order->>'status', 'pending') = 'pending' THEN 'paid'
                ELSE COALESCE(p_order->>'status', 'pending')
            END,
            updated_at = NOW()
        WHERE id = v_order_id;
    END IF;

    -- 7. Return success
    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'cash_session_id', v_cash_session_id,
        'wallet_deducted', (v_payment_method IN ('wallet', 'Wallet') AND v_client_id IS NOT NULL),
        'new_balance', v_new_balance
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', 'CREATE_ORDER_FAILED',
        'message', SQLERRM,
        'detail', SQLSTATE
    );
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_atomic(JSONB, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION create_order_atomic(JSONB, JSONB) TO service_role;

COMMENT ON FUNCTION create_order_atomic IS
'Atomic order creation: creates order + items + addons + processes wallet payment in a single transaction. Prevents TOCTOU race conditions.';


-- ============================================================
-- P0 FIX #2: TRANSFER_STOCK - DEDUCT FROM SOURCE
-- Bug: When p_from_location_id IS NOT NULL, the function
-- only sets updated_at but doesn't deduct current_stock.
-- Also missing location stock updates for both source and dest.
-- ============================================================

CREATE OR REPLACE FUNCTION public.transfer_stock(
    p_item_id uuid,
    p_from_location_id uuid,
    p_to_location_id uuid,
    p_quantity numeric,
    p_user_id uuid DEFAULT auth.uid(),
    p_notes text DEFAULT '',
    p_movement_type text DEFAULT 'transfer',
    p_reason text DEFAULT 'Transferencia'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store_id uuid;
    v_item_name text;
    v_movement_id uuid;
    v_current_stock numeric;
    v_from_stock numeric;
    v_caller_id UUID;
    v_caller_store UUID;
BEGIN
    -- Auth check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Get caller store
    SELECT store_id INTO v_caller_store FROM profiles WHERE id = v_caller_id;

    -- Get item details with row lock
    SELECT store_id, name, current_stock
    INTO v_store_id, v_item_name, v_current_stock
    FROM inventory_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ITEM_NOT_FOUND',
            'message', 'Item no encontrado'
        );
    END IF;

    -- Validate store access
    IF v_caller_store IS NOT NULL AND v_caller_store != v_store_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED',
            'message', 'Item no pertenece a tu local');
    END IF;

    -- Validate positive quantity
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_QUANTITY',
            'message', 'Cantidad debe ser mayor a 0'
        );
    END IF;

    -- Validate source has enough stock (for actual transfers, not restocks)
    IF p_from_location_id IS NOT NULL THEN
        SELECT COALESCE(closed_units, 0) INTO v_from_stock
        FROM inventory_location_stock
        WHERE inventory_item_id = p_item_id AND location_id = p_from_location_id;

        IF NOT FOUND OR COALESCE(v_from_stock, 0) < p_quantity THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'INSUFFICIENT_STOCK',
                'message', format('Stock insuficiente en origen. Disponible: %s, Requerido: %s',
                    COALESCE(v_from_stock, 0)::text, p_quantity::text)
            );
        END IF;
    END IF;

    -- Create movement record
    INSERT INTO inventory_movements (
        id, inventory_item_id, movement_type, quantity,
        from_location_id, to_location_id, user_id, notes, reason, created_at
    ) VALUES (
        gen_random_uuid(), p_item_id,
        COALESCE(p_movement_type, 'transfer'), p_quantity,
        p_from_location_id, p_to_location_id,
        COALESCE(p_user_id, auth.uid()),
        COALESCE(p_notes, ''), COALESCE(p_reason, 'Transferencia'),
        NOW()
    ) RETURNING id INTO v_movement_id;

    -- Update stock based on operation type
    IF p_from_location_id IS NULL THEN
        -- RESTOCK: Add to global stock
        UPDATE inventory_items
        SET current_stock = current_stock + p_quantity, updated_at = NOW()
        WHERE id = p_item_id;

        -- Add to destination location stock
        IF p_to_location_id IS NOT NULL THEN
            INSERT INTO inventory_location_stock (inventory_item_id, location_id, store_id, closed_units)
            VALUES (p_item_id, p_to_location_id, v_store_id, p_quantity)
            ON CONFLICT (inventory_item_id, location_id)
            DO UPDATE SET closed_units = inventory_location_stock.closed_units + p_quantity;
        END IF;
    ELSE
        -- TRANSFER: Deduct from source, add to destination
        -- FIX: Actually deduct from source location
        UPDATE inventory_location_stock
        SET closed_units = closed_units - p_quantity
        WHERE inventory_item_id = p_item_id AND location_id = p_from_location_id;

        -- Add to destination location
        IF p_to_location_id IS NOT NULL THEN
            INSERT INTO inventory_location_stock (inventory_item_id, location_id, store_id, closed_units)
            VALUES (p_item_id, p_to_location_id, v_store_id, p_quantity)
            ON CONFLICT (inventory_item_id, location_id)
            DO UPDATE SET closed_units = inventory_location_stock.closed_units + p_quantity;
        END IF;

        -- Global stock stays the same for transfers (moved, not created/consumed)
        UPDATE inventory_items SET updated_at = NOW() WHERE id = p_item_id;
    END IF;

    -- Get updated stock
    SELECT current_stock INTO v_current_stock
    FROM inventory_items WHERE id = p_item_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Transferencia completada exitosamente',
        'data', jsonb_build_object(
            'movement_id', v_movement_id,
            'item_id', p_item_id,
            'item_name', v_item_name,
            'quantity_transferred', p_quantity,
            'new_stock_level', v_current_stock,
            'movement_type', p_movement_type
        )
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TRANSFER_FAILED',
            'message', 'Error: ' || SQLERRM
        );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_stock TO authenticated;


-- ============================================================
-- P0 FIX #3: FINALIZE_ORDER_STOCK - ADD ADDON DEDUCTION
-- Bug: Addons (addon_ids) in order items are not deducted from stock.
-- Fix: After processing base recipe + variant overrides, also
-- process addon items through inventory_item_recipes table.
-- Also adds safer stock checking per-item to avoid partial failures.
-- ============================================================

DROP TRIGGER IF EXISTS trg_finalize_stock ON orders;
DROP FUNCTION IF EXISTS public.finalize_order_stock() CASCADE;

CREATE OR REPLACE FUNCTION public.finalize_order_stock()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
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
    v_override_item JSONB;
    v_variant_record RECORD;
    v_addon_record RECORD;
    v_addon_recipe RECORD;
    v_addon_id_text TEXT;
BEGIN
    -- Only proceed if status/payment indicates paid AND stock not yet deducted
    IF (NEW.is_paid = TRUE OR NEW.payment_status IN ('paid', 'approved'))
       AND NEW.stock_deducted = FALSE THEN

        v_order_id := NEW.id;
        v_store_id := NEW.store_id;
        v_items := NEW.items;

        -- Fallback: If items JSON is empty, read from order_items
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
            NEW.stock_deducted := TRUE;
            RETURN NEW;
        END IF;

        -- Determine Target Location
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

            -- Deduct Base Recipe Ingredients
            FOR v_recipe_record IN
                SELECT ri.inventory_item_id, ri.quantity_required, ii.unit_type, ii.current_stock
                FROM product_recipes ri
                JOIN inventory_items ii ON ii.id = ri.inventory_item_id
                WHERE ri.product_id = v_sellable_id
            LOOP
                DECLARE
                    deduct_qty NUMERIC := v_recipe_record.quantity_required * v_recipe_multiplier * v_item_qty;
                BEGIN
                    IF v_recipe_record.unit_type = 'unit' THEN deduct_qty := ROUND(deduct_qty); END IF;

                    -- Safe deduction: only deduct if stock available
                    UPDATE inventory_items
                    SET current_stock = current_stock - deduct_qty, updated_at = NOW()
                    WHERE id = v_recipe_record.inventory_item_id
                      AND current_stock >= deduct_qty;

                    IF NOT FOUND THEN
                        -- Insufficient stock: deduct to zero and log warning
                        UPDATE inventory_items
                        SET current_stock = GREATEST(current_stock - deduct_qty, 0), updated_at = NOW()
                        WHERE id = v_recipe_record.inventory_item_id;

                        RAISE WARNING 'Stock shortage for item % in order %: needed %, had %',
                            v_recipe_record.inventory_item_id, v_order_id, deduct_qty, v_recipe_record.current_stock;
                    END IF;

                    -- Update Location Stock
                    IF v_target_location_id IS NOT NULL THEN
                        INSERT INTO inventory_location_stock (inventory_item_id, location_id, store_id, closed_units)
                        VALUES (v_recipe_record.inventory_item_id, v_target_location_id, v_store_id, -deduct_qty)
                        ON CONFLICT (inventory_item_id, location_id)
                        DO UPDATE SET closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units;
                    END IF;

                    -- Log Movement
                    INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                    VALUES (gen_random_uuid(), v_store_id, v_recipe_record.inventory_item_id, v_order_id, -deduct_qty, v_recipe_record.unit_type, 'order_delivered');
                END;
            END LOOP;

            -- === 2. VARIANT OVERRIDES ===
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
                            ov_current NUMERIC;
                        BEGIN
                             SELECT unit_type, current_stock INTO ov_unit, ov_current FROM inventory_items WHERE id = ov_inv_id;
                             IF ov_unit = 'unit' THEN ov_qty := ROUND(ov_qty); END IF;

                             -- Safe deduction
                             UPDATE inventory_items
                             SET current_stock = GREATEST(current_stock - ov_qty, 0), updated_at = NOW()
                             WHERE id = ov_inv_id;

                             IF v_target_location_id IS NOT NULL THEN
                                INSERT INTO inventory_location_stock (inventory_item_id, location_id, store_id, closed_units)
                                VALUES (ov_inv_id, v_target_location_id, v_store_id, -ov_qty)
                                ON CONFLICT (inventory_item_id, location_id)
                                DO UPDATE SET closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units;
                            END IF;

                            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                            VALUES (gen_random_uuid(), v_store_id, ov_inv_id, v_order_id, -ov_qty, ov_unit, 'variant_override');
                        END;
                     END LOOP;
                END IF;
            END IF;

            -- === 3. ADDON STOCK DEDUCTION (NEW) ===
            -- Process addon_ids for this item and deduct their recipes
            IF v_item->'addon_ids' IS NOT NULL AND jsonb_typeof(v_item->'addon_ids') = 'array' THEN
                FOR v_addon_id_text IN SELECT value FROM jsonb_array_elements_text(v_item->'addon_ids')
                LOOP
                    -- Look up addon recipes from inventory_item_recipes (addon = product with recipe)
                    FOR v_addon_recipe IN
                        SELECT ir.inventory_item_id, ir.quantity_per_unit, ii.unit_type, ii.current_stock
                        FROM inventory_item_recipes ir
                        JOIN inventory_items ii ON ii.id = ir.inventory_item_id
                        WHERE ir.product_addon_id = v_addon_id_text::UUID
                    LOOP
                        DECLARE
                            addon_deduct NUMERIC := v_addon_recipe.quantity_per_unit * v_item_qty;
                        BEGIN
                            IF v_addon_recipe.unit_type = 'unit' THEN addon_deduct := ROUND(addon_deduct); END IF;

                            -- Safe deduction
                            UPDATE inventory_items
                            SET current_stock = GREATEST(current_stock - addon_deduct, 0), updated_at = NOW()
                            WHERE id = v_addon_recipe.inventory_item_id;

                            IF v_target_location_id IS NOT NULL THEN
                                INSERT INTO inventory_location_stock (inventory_item_id, location_id, store_id, closed_units)
                                VALUES (v_addon_recipe.inventory_item_id, v_target_location_id, v_store_id, -addon_deduct)
                                ON CONFLICT (inventory_item_id, location_id)
                                DO UPDATE SET closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units;
                            END IF;

                            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                            VALUES (gen_random_uuid(), v_store_id, v_addon_recipe.inventory_item_id, v_order_id, -addon_deduct, v_addon_recipe.unit_type, 'addon_deduction');
                        END;
                    END LOOP;

                    -- Also check product_recipes for addons (addons may be products with their own recipes)
                    FOR v_addon_recipe IN
                        SELECT pr.inventory_item_id, pr.quantity_required, ii.unit_type, ii.current_stock
                        FROM product_recipes pr
                        JOIN inventory_items ii ON ii.id = pr.inventory_item_id
                        WHERE pr.product_id = v_addon_id_text::UUID
                    LOOP
                        DECLARE
                            addon_deduct2 NUMERIC := v_addon_recipe.quantity_required * v_item_qty;
                        BEGIN
                            IF v_addon_recipe.unit_type = 'unit' THEN addon_deduct2 := ROUND(addon_deduct2); END IF;

                            UPDATE inventory_items
                            SET current_stock = GREATEST(current_stock - addon_deduct2, 0), updated_at = NOW()
                            WHERE id = v_addon_recipe.inventory_item_id;

                            IF v_target_location_id IS NOT NULL THEN
                                INSERT INTO inventory_location_stock (inventory_item_id, location_id, store_id, closed_units)
                                VALUES (v_addon_recipe.inventory_item_id, v_target_location_id, v_store_id, -addon_deduct2)
                                ON CONFLICT (inventory_item_id, location_id)
                                DO UPDATE SET closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units;
                            END IF;

                            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                            VALUES (gen_random_uuid(), v_store_id, v_addon_recipe.inventory_item_id, v_order_id, -addon_deduct2, v_addon_recipe.unit_type, 'addon_recipe_deduction');
                        END;
                    END LOOP;
                END LOOP;
            END IF;

        END LOOP;

        NEW.stock_deducted := TRUE;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Stock deduction trigger failed for Order %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-create Trigger
CREATE TRIGGER trg_finalize_stock
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION finalize_order_stock();

GRANT EXECUTE ON FUNCTION finalize_order_stock() TO authenticated;
GRANT EXECUTE ON FUNCTION finalize_order_stock() TO service_role;


-- ============================================================
-- P0 FIX #4: CHECK CONSTRAINT ON INVENTORY_ITEMS.CURRENT_STOCK
-- Prevents application bugs from creating impossible negative stock.
-- First reset any existing negative values to 0.
-- ============================================================

-- Safety: reset negative stock to 0 before adding constraint
UPDATE inventory_items SET current_stock = 0 WHERE current_stock < 0;

-- Add constraint (using NOT VALID to avoid full table scan on large tables)
ALTER TABLE inventory_items
ADD CONSTRAINT chk_current_stock_non_negative
CHECK (current_stock >= 0) NOT VALID;

-- Validate existing data (safe because we just fixed negatives)
ALTER TABLE inventory_items VALIDATE CONSTRAINT chk_current_stock_non_negative;
