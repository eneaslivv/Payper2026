-- ============================================================================
-- Location-Aware Stock Deduction
-- Date: 2026-02-26
--
-- Problem:
--   consume_from_smart_packages() always picks the default location
--   (is_default=true / name ILIKE '%Principal%'). When a sale happens at a
--   dispatch station linked to a specific storage location, the stock should
--   be deducted from THAT location, not the default.
--
--   Additionally, create_order_atomic() and sync_offline_order() never
--   persist dispatch_station or source_location_id to the orders table,
--   so finalize_order_stock() has no location info to work with.
--
-- Fix:
--   1. consume_from_smart_packages() gets p_location_id parameter
--   2. finalize_order_stock() resolves location from order and passes it
--   3. create_order_atomic() persists dispatch_station + source_location_id
--   4. sync_offline_order() persists dispatch_station + source_location_id
--      and passes resolved location to apply_stock_delta()
-- ============================================================================


-- ============================================================
-- STEP 1: Upgrade consume_from_smart_packages()
-- Add p_location_id UUID DEFAULT NULL parameter
-- ============================================================
DROP FUNCTION IF EXISTS consume_from_smart_packages(UUID, NUMERIC, UUID, TEXT, TEXT, BOOLEAN, UUID);

CREATE OR REPLACE FUNCTION public.consume_from_smart_packages(
    p_inventory_item_id UUID,
    p_required_qty NUMERIC,
    p_order_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'sale',
    p_unit TEXT DEFAULT 'unit',
    p_allow_negative BOOLEAN DEFAULT FALSE,
    p_created_by UUID DEFAULT NULL,
    p_location_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_remaining NUMERIC := p_required_qty;
    v_open_pkg RECORD;
    v_consumed NUMERIC;
    v_closed_qty NUMERIC;
    v_pkg_capacity NUMERIC;
    v_new_pkg_id UUID;
    v_store_id UUID;
    v_location_id UUID;
    v_consume_location_id UUID;
    v_item_name TEXT;
    v_unit TEXT;
    v_movements JSONB := '[]'::JSONB;
    v_packages_opened INT := 0;
    v_total_stock NUMERIC;
    v_caller_id UUID;
    v_caller_store UUID;
BEGIN
    -- Validate quantity
    IF p_required_qty <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cantidad debe ser > 0');
    END IF;

    -- Use explicit created_by or fall back to auth.uid()
    v_caller_id := COALESCE(p_created_by, auth.uid());

    -- Cross-store validation (only if caller is identifiable)
    IF v_caller_id IS NOT NULL THEN
        SELECT store_id INTO v_caller_store FROM profiles WHERE id = v_caller_id;
    END IF;

    -- Lock item row
    SELECT store_id, name, COALESCE(closed_stock, 0), COALESCE(package_size, 1), unit_type
    INTO v_store_id, v_item_name, v_closed_qty, v_pkg_capacity, v_unit
    FROM inventory_items WHERE id = p_inventory_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item no encontrado');
    END IF;

    IF v_caller_store IS NOT NULL AND v_caller_store != v_store_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED: Item no pertenece a tu local');
    END IF;

    -- Resolve preferred location
    -- Priority: explicit p_location_id > default location
    IF p_location_id IS NOT NULL THEN
        SELECT id INTO v_location_id FROM storage_locations
        WHERE id = p_location_id AND store_id = v_store_id;
        -- If invalid/wrong store, fall through to default
    END IF;

    IF v_location_id IS NULL THEN
        SELECT id INTO v_location_id FROM storage_locations
        WHERE store_id = v_store_id AND (is_default = true OR name ILIKE '%Principal%')
        ORDER BY is_default DESC NULLS LAST LIMIT 1;
    END IF;

    -- Calculate total available stock
    v_total_stock := calculate_total_stock(p_inventory_item_id);

    IF v_total_stock < p_required_qty AND NOT p_allow_negative THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stock insuficiente: disponible ' || v_total_stock::TEXT || ', necesitas ' || p_required_qty::TEXT
        );
    END IF;

    -- Consume from open packages first (FIFO), preferring packages at the target location
    FOR v_open_pkg IN
        SELECT * FROM open_packages
        WHERE inventory_item_id = p_inventory_item_id
          AND remaining > 0
          AND is_active = true
        ORDER BY
            CASE WHEN location_id = v_location_id THEN 0 ELSE 1 END,
            opened_at ASC
    LOOP
        EXIT WHEN v_remaining <= 0;

        v_consumed := LEAST(v_remaining, v_open_pkg.remaining);

        UPDATE open_packages
        SET remaining = remaining - v_consumed, updated_at = now()
        WHERE id = v_open_pkg.id;

        INSERT INTO stock_movements (
            store_id, inventory_item_id, order_id, qty_delta,
            unit_type, reason, idempotency_key, location_id, created_by
        )
        VALUES (
            v_store_id, p_inventory_item_id, p_order_id, -v_consumed,
            p_unit, p_reason, gen_random_uuid()::text,
            COALESCE(v_open_pkg.location_id, v_location_id), v_caller_id
        );

        v_movements := v_movements || jsonb_build_object(
            'type', 'consume_open',
            'package_id', v_open_pkg.id,
            'consumed', v_consumed
        );

        IF (v_open_pkg.remaining - v_consumed) <= 0.01 THEN
            UPDATE open_packages
            SET is_active = false, closed_at = now()
            WHERE id = v_open_pkg.id;
        END IF;

        v_remaining := v_remaining - v_consumed;
    END LOOP;

    -- Open closed packages if still needed
    WHILE v_remaining > 0.01 LOOP
        -- Find a location that has closed_units > 0 (prefer target location)
        SELECT ils.location_id, ils.closed_units
        INTO v_consume_location_id, v_closed_qty
        FROM inventory_location_stock ils
        WHERE ils.item_id = p_inventory_item_id
          AND ils.store_id = v_store_id
          AND ils.closed_units > 0
        ORDER BY
            CASE WHEN ils.location_id = v_location_id THEN 0 ELSE 1 END,
            ils.closed_units DESC
        LIMIT 1;

        IF NOT FOUND OR v_closed_qty <= 0 THEN
            IF p_allow_negative THEN
                -- No more packages to open: record remaining consumption and exit
                INSERT INTO stock_movements (
                    store_id, inventory_item_id, order_id, qty_delta,
                    unit_type, reason, idempotency_key, location_id, created_by
                )
                VALUES (
                    v_store_id, p_inventory_item_id, p_order_id, -v_remaining,
                    p_unit, p_reason, gen_random_uuid()::text,
                    v_location_id, v_caller_id
                );
                v_remaining := 0;
                EXIT;
            ELSE
                -- Fallback: check legacy closed_stock column
                SELECT COALESCE(closed_stock, 0), COALESCE(package_size, 1)
                INTO v_closed_qty, v_pkg_capacity
                FROM inventory_items WHERE id = p_inventory_item_id;

                IF v_closed_qty <= 0 THEN
                    RETURN jsonb_build_object('success', false, 'error',
                        'No hay paquetes cerrados disponibles en ninguna ubicacion');
                END IF;
                v_consume_location_id := v_location_id;
            END IF;
        END IF;

        -- Only continue opening if we didn't EXIT above
        IF v_remaining <= 0.01 THEN EXIT; END IF;

        -- Get package_size (may have changed)
        SELECT COALESCE(package_size, 1) INTO v_pkg_capacity
        FROM inventory_items WHERE id = p_inventory_item_id;

        -- Open new package from the location that has stock
        INSERT INTO open_packages (
            inventory_item_id, store_id, location_id, package_capacity,
            remaining, unit, opened_at, opened_by, is_active
        )
        VALUES (
            p_inventory_item_id, v_store_id, v_consume_location_id, v_pkg_capacity,
            v_pkg_capacity, p_unit, now(), v_caller_id, true
        )
        RETURNING id INTO v_new_pkg_id;

        -- Decrement closed packages in inventory_items (legacy field)
        UPDATE inventory_items
        SET closed_stock = GREATEST(closed_stock - 1, 0), updated_at = now()
        WHERE id = p_inventory_item_id;

        -- Decrement inventory_location_stock.closed_units from the CORRECT location
        UPDATE inventory_location_stock
        SET closed_units = GREATEST(closed_units - 1, 0), updated_at = now()
        WHERE item_id = p_inventory_item_id
          AND location_id = v_consume_location_id
          AND store_id = v_store_id;

        v_packages_opened := v_packages_opened + 1;

        -- Consume from newly opened package
        v_consumed := LEAST(v_remaining, v_pkg_capacity);

        UPDATE open_packages
        SET remaining = remaining - v_consumed, updated_at = now()
        WHERE id = v_new_pkg_id;

        INSERT INTO stock_movements (
            store_id, inventory_item_id, order_id, qty_delta,
            unit_type, reason, idempotency_key, location_id, created_by
        )
        VALUES (
            v_store_id, p_inventory_item_id, p_order_id, -v_consumed,
            p_unit, p_reason, gen_random_uuid()::text, v_consume_location_id, v_caller_id
        );

        IF (v_pkg_capacity - v_consumed) <= 0.01 THEN
            UPDATE open_packages
            SET is_active = false, closed_at = now()
            WHERE id = v_new_pkg_id;
        END IF;

        v_remaining := v_remaining - v_consumed;
    END LOOP;

    -- Recalculate total stock
    UPDATE inventory_items
    SET current_stock = calculate_total_stock(p_inventory_item_id), updated_at = now()
    WHERE id = p_inventory_item_id;

    RETURN jsonb_build_object(
        'success', true,
        'item_id', p_inventory_item_id,
        'consumed', p_required_qty,
        'packages_opened', v_packages_opened
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ============================================================
-- STEP 2: Update finalize_order_stock()
-- Resolve location from order and pass to consume_from_smart_packages
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalize_order_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_order_id UUID;
    v_store_id UUID;
    v_items JSONB;
    v_item JSONB;
    v_item_qty NUMERIC;
    v_product_id UUID;
    v_variant_id UUID;
    v_recipe_multiplier NUMERIC;
    v_recipe_record RECORD;
    v_addon_record RECORD;
    v_override_item JSONB;
    v_has_recipe BOOLEAN;
    v_final_qty NUMERIC;
    v_direct_unit TEXT;
    v_o_inv_id UUID;
    v_o_qty NUMERIC;
    v_o_unit TEXT;
    v_variant_overrides JSONB;
    v_delta_result JSONB;
    v_resolved_location_id UUID;
BEGIN
    IF NEW.stock_deducted = TRUE THEN
        RETURN NEW;
    END IF;

    -- Cast to TEXT to avoid invalid enum value crash
    IF NOT (
        NEW.status::text IN ('served', 'delivered', 'completed', 'entregado', 'finalizado')
        OR NEW.is_paid = TRUE
        OR NEW.payment_status::text IN ('paid', 'approved')
    ) THEN
        RETURN NEW;
    END IF;

    v_order_id := NEW.id;
    v_store_id := NEW.store_id;
    v_items := NEW.items;

    -- ── Resolve consumption location ──
    -- Priority 1: orders.source_location_id (set from venue_nodes.location_id)
    -- Priority 2: dispatch_stations.storage_location_id (by station name)
    -- Priority 3: NULL (consume_from_smart_packages uses default)
    v_resolved_location_id := NEW.source_location_id;

    IF v_resolved_location_id IS NULL AND NEW.dispatch_station IS NOT NULL THEN
        SELECT storage_location_id INTO v_resolved_location_id
        FROM dispatch_stations
        WHERE store_id = v_store_id
          AND name = NEW.dispatch_station
          AND storage_location_id IS NOT NULL
        LIMIT 1;
    END IF;

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'productId', oi.product_id,
                'quantity', oi.quantity,
                'variant_id', oi.variant_id
            )
        )
        INTO v_items
        FROM order_items oi
        WHERE oi.order_id = v_order_id;
    END IF;

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        NEW.stock_deducted := TRUE;
        RETURN NEW;
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        v_product_id := COALESCE(
            (v_item->>'productId')::UUID,
            (v_item->>'product_id')::UUID,
            (v_item->>'id')::UUID
        );

        IF v_product_id IS NULL OR v_item_qty <= 0 THEN
            CONTINUE;
        END IF;

        v_variant_id := NULL;
        BEGIN
            IF v_item->>'variant' IS NOT NULL AND (v_item->>'variant')::TEXT != 'null' THEN
                v_variant_id := (v_item->>'variant')::UUID;
            ELSIF v_item->>'variant_id' IS NOT NULL AND (v_item->>'variant_id')::TEXT != 'null' THEN
                v_variant_id := (v_item->>'variant_id')::UUID;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_variant_id := NULL;
        END;

        v_has_recipe := FALSE;
        v_recipe_multiplier := 1.0;
        IF v_variant_id IS NOT NULL THEN
            SELECT COALESCE(recipe_multiplier, 1.0) INTO v_recipe_multiplier
            FROM product_variants WHERE id = v_variant_id;
        END IF;

        -- Recipe consumption
        FOR v_recipe_record IN
            SELECT pr.inventory_item_id, pr.quantity_required, ii.unit_type
            FROM product_recipes pr
            JOIN inventory_items ii ON ii.id = pr.inventory_item_id
            WHERE pr.product_id = v_product_id
        LOOP
            v_has_recipe := TRUE;
            v_final_qty := v_recipe_record.quantity_required * v_recipe_multiplier * v_item_qty;
            IF v_recipe_record.unit_type = 'unit' THEN v_final_qty := ROUND(v_final_qty); END IF;

            v_delta_result := consume_from_smart_packages(
                p_inventory_item_id := v_recipe_record.inventory_item_id,
                p_required_qty := v_final_qty,
                p_order_id := v_order_id,
                p_reason := 'recipe_consumption',
                p_unit := COALESCE(v_recipe_record.unit_type, 'unit'),
                p_allow_negative := true,
                p_location_id := v_resolved_location_id
            );

            IF NOT (v_delta_result->>'success')::boolean THEN
                RAISE WARNING '[finalize_order_stock] Recipe deduction failed for item % (order %): %',
                    v_recipe_record.inventory_item_id, v_order_id, v_delta_result->>'error';
            END IF;
        END LOOP;

        -- Direct sale (no recipe)
        IF v_has_recipe = FALSE THEN
            SELECT unit_type INTO v_direct_unit FROM inventory_items WHERE id = v_product_id;
            IF FOUND THEN
                v_delta_result := consume_from_smart_packages(
                    p_inventory_item_id := v_product_id,
                    p_required_qty := v_item_qty,
                    p_order_id := v_order_id,
                    p_reason := 'direct_sale',
                    p_unit := COALESCE(v_direct_unit, 'unit'),
                    p_allow_negative := true,
                    p_location_id := v_resolved_location_id
                );

                IF NOT (v_delta_result->>'success')::boolean THEN
                    RAISE WARNING '[finalize_order_stock] Direct sale deduction failed for item % (order %): %',
                        v_product_id, v_order_id, v_delta_result->>'error';
                END IF;
            END IF;
        END IF;

        -- Variant overrides
        IF v_variant_id IS NOT NULL THEN
            SELECT recipe_overrides INTO v_variant_overrides
            FROM product_variants WHERE id = v_variant_id;

            IF v_variant_overrides IS NOT NULL AND jsonb_array_length(v_variant_overrides) > 0 THEN
                FOR v_override_item IN SELECT * FROM jsonb_array_elements(v_variant_overrides)
                LOOP
                    v_o_inv_id := (v_override_item->>'inventory_item_id')::UUID;
                    v_o_qty := COALESCE((v_override_item->>'quantity')::NUMERIC, 0) * v_item_qty;
                    SELECT unit_type INTO v_o_unit FROM inventory_items WHERE id = v_o_inv_id;
                    IF v_o_unit = 'unit' THEN v_o_qty := ROUND(v_o_qty); END IF;

                    IF v_o_inv_id IS NOT NULL AND v_o_qty > 0 THEN
                        v_delta_result := consume_from_smart_packages(
                            p_inventory_item_id := v_o_inv_id,
                            p_required_qty := v_o_qty,
                            p_order_id := v_order_id,
                            p_reason := 'variant_override',
                            p_unit := COALESCE(v_o_unit, 'unit'),
                            p_allow_negative := true,
                            p_location_id := v_resolved_location_id
                        );

                        IF NOT (v_delta_result->>'success')::boolean THEN
                            RAISE WARNING '[finalize_order_stock] Variant override failed for item % (order %): %',
                                v_o_inv_id, v_order_id, v_delta_result->>'error';
                        END IF;
                    END IF;
                END LOOP;
            END IF;
        END IF;
    END LOOP;

    -- Addon consumption
    BEGIN
        FOR v_addon_record IN
            SELECT pa.inventory_item_id, pa.quantity_consumed, oi.quantity AS item_qty, ii.unit_type
            FROM order_items oi
            JOIN order_item_addons oia ON oia.order_item_id = oi.id
            JOIN product_addons pa ON pa.id = oia.addon_id
            JOIN inventory_items ii ON ii.id = pa.inventory_item_id
            WHERE oi.order_id = v_order_id
              AND pa.inventory_item_id IS NOT NULL
              AND pa.quantity_consumed IS NOT NULL
              AND pa.quantity_consumed > 0
        LOOP
            v_final_qty := v_addon_record.quantity_consumed * v_addon_record.item_qty;
            IF v_addon_record.unit_type = 'unit' THEN v_final_qty := ROUND(v_final_qty); END IF;

            v_delta_result := consume_from_smart_packages(
                p_inventory_item_id := v_addon_record.inventory_item_id,
                p_required_qty := v_final_qty,
                p_order_id := v_order_id,
                p_reason := 'addon_consumed',
                p_unit := COALESCE(v_addon_record.unit_type, 'unit'),
                p_allow_negative := true,
                p_location_id := v_resolved_location_id
            );

            IF NOT (v_delta_result->>'success')::boolean THEN
                RAISE WARNING '[finalize_order_stock] Addon deduction failed for item % (order %): %',
                    v_addon_record.inventory_item_id, v_order_id, v_delta_result->>'error';
            END IF;
        END LOOP;
    EXCEPTION WHEN undefined_table THEN
        NULL;
    END;

    NEW.stock_deducted := TRUE;
    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'finalize_order_stock failed for order %: % [%]', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;


-- ============================================================
-- STEP 3: Update create_order_atomic()
-- Add dispatch_station + source_location_id to INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_order JSONB,
    p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_order_id UUID;
    v_store_id UUID;
    v_client_id UUID;
    v_total_amount NUMERIC;
    v_payment_method TEXT;
    v_is_paid BOOLEAN;
    v_cash_session_id UUID;
    v_node_id UUID;
    v_item JSONB;
    v_item_id UUID;
    v_addon JSONB;
    v_order_item_id UUID;
    v_order_number TEXT;
    v_wallet_result JSONB;
    v_dispatch_station TEXT;
    v_source_location_id UUID;
BEGIN
    -- 1. Extract & validate basic fields
    v_order_id := COALESCE((p_order->>'id')::UUID, gen_random_uuid());
    v_store_id := (p_order->>'store_id')::UUID;
    v_client_id := (p_order->>'client_id')::UUID;
    v_total_amount := (p_order->>'total_amount')::NUMERIC;
    v_payment_method := COALESCE(p_order->>'payment_method', 'cash');
    v_is_paid := COALESCE((p_order->>'is_paid')::BOOLEAN, FALSE);
    v_cash_session_id := (p_order->>'cash_session_id')::UUID;
    v_node_id := (p_order->>'node_id')::UUID;
    v_dispatch_station := p_order->>'dispatch_station';
    v_source_location_id := (p_order->>'source_location_id')::UUID;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'store_id is required');
    END IF;

    -- 2. Generate order_number (order_number is INTEGER — just MAX + 1)
    v_order_number := '#' || LPAD(
        (COALESCE((SELECT MAX(order_number) FROM orders WHERE store_id = v_store_id), 0) + 1)::TEXT,
        3, '0'
    );

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
        dispatch_station, source_location_id,
        created_at, updated_at
    ) VALUES (
        v_order_id,
        v_store_id,
        v_client_id,
        v_total_amount,
        COALESCE((p_order->>'subtotal')::NUMERIC, v_total_amount),
        COALESCE(p_order->>'status', 'pending')::order_status_enum,
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
        COALESCE(p_order->>'channel', 'pos')::order_channel_enum,
        p_order->>'delivery_mode',
        COALESCE(p_order->>'delivery_status', 'pending'),
        (p_order->>'session_id')::UUID,
        '[]'::jsonb, -- Don't store items in legacy JSONB column
        v_dispatch_station,
        v_source_location_id,
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
                COALESCE((v_item->>'total_price')::NUMERIC, 0),
                v_item->>'notes'
            )
            RETURNING id INTO v_order_item_id;

            -- Insert addons for this item
            IF v_item->'addons' IS NOT NULL AND jsonb_typeof(v_item->'addons') = 'array' THEN
                FOR v_addon IN SELECT * FROM jsonb_array_elements(v_item->'addons')
                LOOP
                    INSERT INTO order_item_addons (
                        id, order_item_id, addon_id, quantity, unit_price, total_price
                    ) VALUES (
                        gen_random_uuid(),
                        v_order_item_id,
                        (v_addon->>'addon_id')::UUID,
                        COALESCE((v_addon->>'quantity')::NUMERIC, 1),
                        COALESCE((v_addon->>'unit_price')::NUMERIC, 0),
                        COALESCE((v_addon->>'total_price')::NUMERIC, 0)
                    );
                END LOOP;
            END IF;
        END LOOP;
    END IF;

    -- 6. Wallet deduction (if payment_method = wallet and is_paid)
    IF v_payment_method IN ('wallet', 'Wallet') AND v_is_paid AND v_client_id IS NOT NULL THEN
        v_wallet_result := debit_wallet(
            p_client_id := v_client_id,
            p_amount := v_total_amount,
            p_description := 'Pago de orden ' || v_order_number,
            p_reference_type := 'order',
            p_reference_id := v_order_id,
            p_idempotency_key := 'order_wallet_' || v_order_id::TEXT,
            p_store_id := v_store_id
        );

        IF NOT (v_wallet_result->>'success')::BOOLEAN THEN
            RAISE EXCEPTION 'Wallet debit failed: %', v_wallet_result->>'error';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'order_id', v_order_id,
        'order_number', v_order_number,
        'cash_session_id', v_cash_session_id
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;


-- ============================================================
-- STEP 4: Update sync_offline_order()
-- Add dispatch_station + source_location_id to INSERT
-- Pass resolved location_id to apply_stock_delta()
-- ============================================================
CREATE OR REPLACE FUNCTION sync_offline_order(
    p_order_data           JSONB,
    p_allow_negative_stock BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id        UUID;
    v_store_id        UUID;
    v_item            JSONB;
    v_product_id      UUID;
    v_quantity        NUMERIC;
    v_current_stock   NUMERIC;
    v_stock_conflicts JSONB   := '[]'::JSONB;
    v_has_conflicts   BOOLEAN := FALSE;
    v_locked_items    UUID[]  := '{}';
    v_idempotency_key TEXT;
    v_delta_result    JSONB;
    v_resolved_location_id UUID;
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
            'success',  FALSE,
            'error',    'PERMISSION_DENIED',
            'message',  'No tienes permiso para sincronizar ordenes de esta tienda'
        );
    END IF;

    -- Resolve consumption location
    v_resolved_location_id := (p_order_data->>'source_location_id')::UUID;

    IF v_resolved_location_id IS NULL AND p_order_data->>'dispatch_station' IS NOT NULL THEN
        SELECT storage_location_id INTO v_resolved_location_id
        FROM dispatch_stations
        WHERE store_id = v_store_id
          AND name = p_order_data->>'dispatch_station'
          AND storage_location_id IS NOT NULL
        LIMIT 1;
    END IF;

    -- -----------------------------------------------------------------------
    -- 1. PRE-VALIDATE STOCK AVAILABILITY WITH ROW LOCKING
    -- -----------------------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_data->'items')
    LOOP
        v_product_id := (v_item->>'productId')::UUID;
        v_quantity   := (v_item->>'quantity')::NUMERIC;

        -- Lock the row to prevent concurrent modifications
        SELECT current_stock INTO v_current_stock
        FROM inventory_items
        WHERE id = v_product_id
        FOR UPDATE NOWAIT;

        v_locked_items := array_append(v_locked_items, v_product_id);

        IF v_current_stock IS NOT NULL AND v_current_stock < v_quantity THEN
            v_has_conflicts := TRUE;
            v_stock_conflicts := v_stock_conflicts || jsonb_build_object(
                'product_id',    v_product_id,
                'requested_qty', v_quantity,
                'available_qty', v_current_stock,
                'shortage',      v_quantity - v_current_stock
            );

            INSERT INTO stock_alerts (
                store_id, inventory_item_id, alert_type,
                stock_level, expected_stock, message, order_id
            )
            SELECT
                v_store_id, v_product_id, 'offline_conflict',
                v_current_stock, v_quantity,
                'Conflicto de sincronizacion offline: Se intento vender ' || v_quantity
                    || ' pero solo quedan ' || v_current_stock,
                v_order_id
            FROM inventory_items WHERE id = v_product_id;
        END IF;
    END LOOP;

    -- -----------------------------------------------------------------------
    -- 2. HANDLE CONFLICTS
    -- -----------------------------------------------------------------------
    IF v_has_conflicts AND NOT p_allow_negative_stock THEN
        RAISE NOTICE '[sync_offline_order] Stock conflict detected for order %, rolling back', v_order_id;
        RETURN jsonb_build_object(
            'success',         FALSE,
            'error',           'INSUFFICIENT_STOCK',
            'message',         'Stock insuficiente para completar la sincronizacion',
            'conflicts',       v_stock_conflicts,
            'action_required', 'Ajustar cantidades o permitir stock negativo',
            'locked_items',    v_locked_items
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- 3. UPSERT ORDER
    -- -----------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM orders WHERE id = v_order_id) THEN
        UPDATE orders
        SET
            status       = (p_order_data->>'status')::order_status_enum,
            total_amount = (p_order_data->>'total_amount')::NUMERIC,
            items        = p_order_data->'items',
            updated_at   = NOW()
        WHERE id = v_order_id;
    ELSE
        INSERT INTO orders (
            id, store_id, client_id, status, channel,
            total_amount, subtotal, items, payment_method,
            is_paid, node_id, dispatch_station, source_location_id,
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
            (p_order_data->>'node_id')::UUID,
            p_order_data->>'dispatch_station',
            v_resolved_location_id,
            COALESCE((p_order_data->>'created_at')::TIMESTAMPTZ, NOW())
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- 4. DEDUCIR STOCK
    -- -----------------------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_data->'items')
    LOOP
        v_product_id      := (v_item->>'productId')::UUID;
        v_quantity        := (v_item->>'quantity')::NUMERIC;
        v_idempotency_key := 'offline_sync_' || v_order_id::text || '_' || v_product_id::text;

        BEGIN
            PERFORM apply_stock_delta(
                p_inventory_item_id => v_product_id,
                p_store_id          => v_store_id,
                p_qty_delta         => -v_quantity,
                p_reason            => 'offline_order_sync',
                p_location_id       => v_resolved_location_id,
                p_order_id          => v_order_id,
                p_idempotency_key   => v_idempotency_key,
                p_created_by        => auth.uid()
            );

            RAISE NOTICE '[sync_offline_order] Stock deducted: item %, qty %, key %',
                v_product_id, v_quantity, v_idempotency_key;

        EXCEPTION
            WHEN unique_violation THEN
                RAISE NOTICE '[sync_offline_order] Idempotency hit for item % — already deducted, skipping',
                    v_product_id;

            WHEN OTHERS THEN
                IF SQLERRM ILIKE '%INSUFFICIENT_STOCK%'
                    OR SQLERRM ILIKE '%sufficient%'
                    OR SQLERRM ILIKE '%negativ%' THEN
                    INSERT INTO stock_movements (
                        store_id,
                        inventory_item_id,
                        order_id,
                        qty_delta,
                        unit_type,
                        reason,
                        idempotency_key,
                        location_id,
                        created_by
                    ) VALUES (
                        v_store_id,
                        v_product_id,
                        v_order_id,
                        -v_quantity,
                        'un',
                        'offline_order_forced_negative',
                        v_idempotency_key,
                        v_resolved_location_id,
                        auth.uid()
                    )
                    ON CONFLICT (store_id, idempotency_key) DO NOTHING;

                    UPDATE inventory_items
                    SET current_stock = current_stock - v_quantity,
                        updated_at   = NOW()
                    WHERE id = v_product_id;

                    RAISE WARNING '[sync_offline_order] FORCED negative deduction: item %, qty %, key %',
                        v_product_id, v_quantity, v_idempotency_key;
                ELSE
                    RAISE;
                END IF;
        END;
    END LOOP;

    -- -----------------------------------------------------------------------
    -- 5. RETURN SUCCESS
    -- -----------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success',             TRUE,
        'order_id',            v_order_id,
        'message',             'Orden sincronizada exitosamente',
        'stock_went_negative', v_has_conflicts,
        'conflicts',           v_stock_conflicts,
        'locked_items',        v_locked_items
    );

EXCEPTION
    WHEN lock_not_available THEN
        RETURN jsonb_build_object(
            'success',            FALSE,
            'error',              'LOCK_TIMEOUT',
            'message',            'Stock esta siendo modificado por otra operacion. Reintenta en unos segundos.',
            'retry_recommended',  TRUE
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$$;


-- Notify PostgREST to pick up schema changes
NOTIFY pgrst, 'reload schema';
