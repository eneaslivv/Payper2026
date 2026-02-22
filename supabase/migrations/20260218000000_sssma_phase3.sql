-- ============================================================================
-- SSSMA Phase 3: Eliminate trigger cascade + unify closed_units source
-- Date: 2026-02-18
--
-- The cascade chain being eliminated:
--   open_packages INSERT/UPDATE/DELETE
--   → trg_sync_open_pkg_to_item
--   → sync_open_pkg_to_inventory()
--   → calculate_item_totals()
--   → OVERWRITES inventory_items.current_stock and closed_stock
--
-- This was the root cause of uncontrolled current_stock overwrites after
-- every package consumption/opening — nullifying apply_stock_delta() updates.
--
-- Changes:
--   3a. calculate_total_stock() — read from inventory_location_stock.closed_units
--       instead of inventory_items.closed_stock (which drifts after restocks)
--   3b. consume_from_smart_packages() — also sync inventory_location_stock.closed_units
--       when opening a closed package (keeps location stock consistent)
--   3c. DROP TRIGGER trg_sync_open_pkg_to_item — kills the cascade overwrite
--
-- NOT changed (deferred):
--   - inventory_items.closed_stock column (still maintained as legacy denorm)
--   - TypeScript database.types.ts (closed_stock still present in schema)
--   - calculate_item_totals() function (kept for manual reconciliation, not auto-called)
--   - Full apply_stock_delta() migration of consume_from_smart_packages() FIFO logic
-- ============================================================================

BEGIN;

-- ============================================================================
-- 3a. Update calculate_total_stock() — use inventory_location_stock as source
--
-- Before: reads inventory_items.closed_stock (stale after restocks because
--         transfer_stock() doesn't update closed_stock, only closed_units)
-- After:  reads SUM(inventory_location_stock.closed_units) — always current
--         because apply_stock_delta + trigger updates closed_units on restock
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_total_stock(p_inventory_item_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_open_stock NUMERIC;
    v_closed_units NUMERIC;
    v_package_size NUMERIC;
BEGIN
    -- Stock en paquetes abiertos (from open_packages table — source of truth for FIFO)
    SELECT COALESCE(SUM(remaining), 0)
    INTO v_open_stock
    FROM open_packages
    WHERE inventory_item_id = p_inventory_item_id
      AND is_active = true
      AND remaining > 0;

    -- Paquetes cerrados por ubicación (from inventory_location_stock — updated by trigger on restock)
    -- CHANGED: was reading inventory_items.closed_stock (stale after restocks)
    SELECT COALESCE(SUM(closed_units), 0)
    INTO v_closed_units
    FROM inventory_location_stock
    WHERE item_id = p_inventory_item_id;

    -- Package size
    SELECT COALESCE(package_size, 1)
    INTO v_package_size
    FROM inventory_items
    WHERE id = p_inventory_item_id;

    -- Total = open + (closed_packages * package_size)
    RETURN v_open_stock + (v_closed_units * COALESCE(v_package_size, 1));
END;
$function$;


-- ============================================================================
-- 3b. Update consume_from_smart_packages() — sync inventory_location_stock
--     when opening a closed package
--
-- Before: only decremented inventory_items.closed_stock when opening a package.
--         inventory_location_stock.closed_units was NOT updated, causing drift.
-- After:  also decrements inventory_location_stock.closed_units for the location,
--         keeping both sources consistent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.consume_from_smart_packages(
    p_inventory_item_id uuid,
    p_required_qty numeric,
    p_unit text,
    p_order_id uuid DEFAULT NULL::uuid,
    p_reason text DEFAULT 'sale'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_remaining NUMERIC := p_required_qty;
    v_open_pkg RECORD;
    v_consumed NUMERIC;
    v_closed_qty NUMERIC;
    v_pkg_capacity NUMERIC;
    v_new_pkg_id UUID;
    v_store_id UUID;
    v_location_id UUID;
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

    -- Cross-store validation
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED: No authenticated user');
    END IF;

    SELECT store_id INTO v_caller_store FROM profiles WHERE id = v_caller_id;

    -- Lock item row (FOR UPDATE prevents concurrent race conditions)
    SELECT store_id, name, COALESCE(closed_stock, 0), COALESCE(package_size, 1), unit_type
    INTO v_store_id, v_item_name, v_closed_qty, v_pkg_capacity, v_unit
    FROM inventory_items WHERE id = p_inventory_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item no encontrado');
    END IF;

    -- Validate caller belongs to same store
    IF v_caller_store IS NOT NULL AND v_caller_store != v_store_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED: Item no pertenece a tu local');
    END IF;

    -- Get default location
    SELECT id INTO v_location_id FROM storage_locations
    WHERE store_id = v_store_id AND (is_default = true OR name ILIKE '%Principal%')
    ORDER BY is_default DESC NULLS LAST LIMIT 1;

    -- Calculate total available stock (now uses unified formula reading from location_stock)
    v_total_stock := calculate_total_stock(p_inventory_item_id);

    IF v_total_stock < p_required_qty THEN
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
            p_unit, p_reason, gen_random_uuid()::text, v_location_id, v_caller_id
        );

        v_movements := v_movements || jsonb_build_object(
            'type', 'consume_open',
            'package_id', v_open_pkg.id,
            'consumed', v_consumed
        );

        -- Close package if empty
        IF (v_open_pkg.remaining - v_consumed) <= 0.01 THEN
            UPDATE open_packages
            SET is_active = false, closed_at = now()
            WHERE id = v_open_pkg.id;
        END IF;

        v_remaining := v_remaining - v_consumed;
    END LOOP;

    -- Open closed packages if still needed
    WHILE v_remaining > 0.01 LOOP
        SELECT closed_stock, package_size
        INTO v_closed_qty, v_pkg_capacity
        FROM inventory_items
        WHERE id = p_inventory_item_id;

        IF v_closed_qty <= 0 THEN
            -- Check inventory_location_stock as fallback (in case closed_stock is stale)
            SELECT COALESCE(SUM(closed_units), 0)
            INTO v_closed_qty
            FROM inventory_location_stock
            WHERE item_id = p_inventory_item_id;

            IF v_closed_qty <= 0 THEN
                RETURN jsonb_build_object('success', false, 'error', 'No hay paquetes cerrados disponibles');
            END IF;
        END IF;

        -- Open new package
        INSERT INTO open_packages (
            inventory_item_id, store_id, location_id, package_capacity,
            remaining, unit, opened_at, opened_by, is_active
        )
        VALUES (
            p_inventory_item_id, v_store_id, v_location_id, v_pkg_capacity,
            v_pkg_capacity, p_unit, now(), v_caller_id, true
        )
        RETURNING id INTO v_new_pkg_id;

        -- Decrement closed packages in inventory_items (legacy field)
        UPDATE inventory_items
        SET closed_stock = GREATEST(closed_stock - 1, 0), updated_at = now()
        WHERE id = p_inventory_item_id;

        -- PHASE 3 FIX: Also decrement inventory_location_stock.closed_units
        -- This keeps location_stock consistent with the actual package opened.
        -- Uses GREATEST to prevent going negative (defensive: opens from default location).
        IF v_location_id IS NOT NULL THEN
            UPDATE inventory_location_stock
            SET closed_units = GREATEST(closed_units - 1, 0),
                updated_at = now()
            WHERE item_id = p_inventory_item_id
              AND location_id = v_location_id
              AND store_id = v_store_id;
        END IF;

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
            p_unit, p_reason, gen_random_uuid()::text, v_location_id, v_caller_id
        );

        v_remaining := v_remaining - v_consumed;
    END LOOP;

    -- Recalculate total stock (reads from open_packages + inventory_location_stock.closed_units)
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
$function$;


-- ============================================================================
-- 3c. DROP TRIGGER trg_sync_open_pkg_to_item
--
-- This trigger cascade called calculate_item_totals() on every open_packages
-- change, OVERWRITING current_stock and closed_stock. Now that:
--   - apply_stock_delta() owns current_stock mutations for all tracked ops
--   - consume_from_smart_packages() recalculates correctly at end of function
--   - calculate_total_stock() reads from inventory_location_stock (not stale closed_stock)
-- ...the cascade is no longer needed and causes more harm than good.
-- ============================================================================

DROP TRIGGER IF EXISTS trg_sync_open_pkg_to_item ON open_packages;

-- Note: sync_open_pkg_to_inventory() and calculate_item_totals() functions
-- are intentionally NOT dropped — they remain available for manual reconciliation
-- (e.g., if a DBA needs to force-sync stock after a bulk operation).


-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_trigger_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'trg_sync_open_pkg_to_item'
    ) INTO v_trigger_exists;

    IF v_trigger_exists THEN
        RAISE EXCEPTION 'CRITICAL: trg_sync_open_pkg_to_item still exists after DROP';
    ELSE
        RAISE NOTICE 'OK: trg_sync_open_pkg_to_item successfully dropped';
    END IF;

    RAISE NOTICE '=== SSSMA Phase 3 Applied ===';
    RAISE NOTICE '  3a. calculate_total_stock(): reads inventory_location_stock.closed_units';
    RAISE NOTICE '  3b. consume_from_smart_packages(): syncs inventory_location_stock on package open';
    RAISE NOTICE '  3c. trg_sync_open_pkg_to_item: DROPPED (cascade eliminated)';
    RAISE NOTICE '';
    RAISE NOTICE 'Functions still needing apply_stock_delta migration (future):';
    RAISE NOTICE '  - consume_from_smart_packages() direct stock_movements INSERT';
    RAISE NOTICE '  - compensate_stock_on_order_edit() (no search_path hardening)';
    RAISE NOTICE '  - sync_offline_order() direct current_stock UPDATE';
    RAISE NOTICE '';
    RAISE NOTICE 'Run: SELECT * FROM validate_stock_integrity() WHERE has_drift = true';
END $$;


COMMIT;
