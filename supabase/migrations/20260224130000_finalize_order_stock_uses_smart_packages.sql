-- ============================================================================
-- Fix: finalize_order_stock() now uses consume_from_smart_packages()
-- Date: 2026-02-24
--
-- Problem:
--   finalize_order_stock() called apply_stock_delta() for all consumption
--   (recipe_consumption, direct_sale, variant_override, addon_consumed).
--   apply_stock_delta() only decrements closed_units — it never opens packages
--   or tracks remaining content in bottles/bags.
--
--   Example: "Whisky con RB" recipe needs 0.1L of Blue Label (package_size=1L).
--   apply_stock_delta() does: closed_units -= 0.1 (149.9), no open_packages.
--   Should do: open bottle (closed-=1, open pkg remaining=1.0), consume 0.1 → remaining=0.9
--
-- Fix:
--   1. consume_from_smart_packages() gets p_allow_negative + p_created_by params
--   2. finalize_order_stock() calls consume_from_smart_packages() for all consumption
--   3. calculate_item_totals() reads from open_packages TABLE (not stale JSONB)
--   4. get_item_stock_by_locations() reads from open_packages TABLE (not stale JSONB)
-- ============================================================================

-- ============================================================
-- STEP 1: Upgrade consume_from_smart_packages()
-- Add p_allow_negative and p_created_by parameters
-- ============================================================
DROP FUNCTION IF EXISTS consume_from_smart_packages(UUID, NUMERIC, UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.consume_from_smart_packages(
    p_inventory_item_id UUID,
    p_required_qty NUMERIC,
    p_order_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT 'sale',
    p_unit TEXT DEFAULT 'unit',
    p_allow_negative BOOLEAN DEFAULT FALSE,
    p_created_by UUID DEFAULT NULL
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

    -- Get default location
    SELECT id INTO v_location_id FROM storage_locations
    WHERE store_id = v_store_id AND (is_default = true OR name ILIKE '%Principal%')
    ORDER BY is_default DESC NULLS LAST LIMIT 1;

    -- Calculate total available stock
    v_total_stock := calculate_total_stock(p_inventory_item_id);

    IF v_total_stock < p_required_qty AND NOT p_allow_negative THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stock insuficiente: disponible ' || v_total_stock::TEXT || ', necesitas ' || p_required_qty::TEXT
        );
    END IF;

    -- Consume from open packages first (FIFO)
    FOR v_open_pkg IN
        SELECT * FROM open_packages
        WHERE inventory_item_id = p_inventory_item_id
          AND remaining > 0
          AND is_active = true
        ORDER BY opened_at ASC
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
        -- Find a location that has closed_units > 0
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
                        'No hay paquetes cerrados disponibles en ninguna ubicación');
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
-- STEP 2: Unify calculate_item_totals() — read from open_packages TABLE
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_item_totals(p_item_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_total_closed NUMERIC := 0;
    v_total_open_remaining NUMERIC := 0;
    v_package_size NUMERIC := 1;
    v_total_stock NUMERIC := 0;
BEGIN
    SELECT COALESCE(package_size, 1) INTO v_package_size
    FROM inventory_items WHERE id = p_item_id;

    -- Sum closed_units from all locations
    SELECT COALESCE(SUM(closed_units), 0) INTO v_total_closed
    FROM inventory_location_stock
    WHERE item_id = p_item_id;

    -- Sum remaining from open_packages TABLE (source of truth — not JSONB!)
    SELECT COALESCE(SUM(remaining), 0) INTO v_total_open_remaining
    FROM open_packages
    WHERE inventory_item_id = p_item_id
      AND is_active = true
      AND remaining > 0;

    -- Total = (closed * package_size) + open_remaining
    v_total_stock := (v_total_closed * v_package_size) + v_total_open_remaining;

    UPDATE inventory_items
    SET
        closed_stock = v_total_closed,
        current_stock = v_total_stock,
        updated_at = NOW()
    WHERE id = p_item_id;

    RAISE NOTICE '[calculate_item_totals] Item %: closed=%, open_remaining=%, total=%',
        p_item_id, v_total_closed, v_total_open_remaining, v_total_stock;
END;
$$;


-- ============================================================
-- STEP 3: Update get_item_stock_by_locations() — read from open_packages TABLE
-- ============================================================
DROP FUNCTION IF EXISTS get_item_stock_by_locations(UUID);

CREATE OR REPLACE FUNCTION public.get_item_stock_by_locations(p_item_id UUID)
RETURNS TABLE (
    location_id UUID,
    location_name TEXT,
    location_type TEXT,
    closed_units NUMERIC,
    open_packages_count INTEGER,
    open_remaining_sum NUMERIC,
    effective_stock NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sl.id as location_id,
        sl.name as location_name,
        COALESCE(sl.location_type, sl.type)::text as location_type,
        COALESCE(ls.closed_units, 0)::numeric as closed_units,
        COALESCE((
            SELECT COUNT(*)::integer FROM open_packages op
            WHERE op.inventory_item_id = p_item_id
              AND op.location_id = sl.id
              AND op.is_active = true
              AND op.remaining > 0
        ), 0)::integer as open_packages_count,
        COALESCE((
            SELECT SUM(op.remaining) FROM open_packages op
            WHERE op.inventory_item_id = p_item_id
              AND op.location_id = sl.id
              AND op.is_active = true
              AND op.remaining > 0
        ), 0)::numeric as open_remaining_sum,
        COALESCE(
            ls.closed_units * COALESCE(ii.package_size, 1) +
            COALESCE((
                SELECT SUM(op.remaining) FROM open_packages op
                WHERE op.inventory_item_id = p_item_id
                  AND op.location_id = sl.id
                  AND op.is_active = true
                  AND op.remaining > 0
            ), 0),
            0
        )::numeric as effective_stock
    FROM public.inventory_location_stock ls
    JOIN public.storage_locations sl ON sl.id = ls.location_id
    JOIN public.inventory_items ii ON ii.id = ls.item_id
    WHERE ls.item_id = p_item_id
    AND (ls.closed_units > 0 OR EXISTS (
        SELECT 1 FROM open_packages op
        WHERE op.inventory_item_id = p_item_id
          AND op.location_id = sl.id
          AND op.is_active = true
    ));
END;
$$;

-- Notify PostgREST to pick up schema changes
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- STEP 4: Update finalize_order_stock() — use consume_from_smart_packages()
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
                p_allow_negative := true
            );

            IF NOT (v_delta_result->>'success')::boolean THEN
                RAISE WARNING '[finalize_order_stock] Recipe deduction failed for item % (order %): %',
                    v_recipe_record.inventory_item_id, v_order_id, v_delta_result->>'error';
            END IF;
        END LOOP;

        IF v_has_recipe = FALSE THEN
            SELECT unit_type INTO v_direct_unit FROM inventory_items WHERE id = v_product_id;
            IF FOUND THEN
                v_delta_result := consume_from_smart_packages(
                    p_inventory_item_id := v_product_id,
                    p_required_qty := v_item_qty,
                    p_order_id := v_order_id,
                    p_reason := 'direct_sale',
                    p_unit := COALESCE(v_direct_unit, 'unit'),
                    p_allow_negative := true
                );

                IF NOT (v_delta_result->>'success')::boolean THEN
                    RAISE WARNING '[finalize_order_stock] Direct sale deduction failed for item % (order %): %',
                        v_product_id, v_order_id, v_delta_result->>'error';
                END IF;
            END IF;
        END IF;

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
                            p_allow_negative := true
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
                p_allow_negative := true
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
