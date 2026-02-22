-- ============================================================================
-- P4: STOCK ADJUSTMENT FIXES (PÉRDIDA / RE-INGRESO)
-- Date: 2026-02-17
--
-- Fixes 9 critical bugs blocking PÉRDIDA and RE-INGRESO operations:
--   1. CHECK constraint missing 'loss' + other valid reasons
--   2. consume_from_smart_packages lacks FOR UPDATE (race condition)
--   3. consume_from_smart_packages lacks cross-store validation
--   4. transfer_stock doesn't log to stock_movements ledger
--   5. rollback/compensate triggers use reasons not in CHECK constraint
--   6. update_inventory_from_movement trigger double-deducts for consumption
--   7. transfer_stock uses wrong column name (inventory_item_id vs item_id)
--   8. transfer_stock INSERT into inventory_movements uses 6 non-existent columns
--      (movement_type, quantity, from_location_id, to_location_id, user_id, notes)
--      Actual schema: tenant_id, type(enum), qty_base_units
--   9. update_inventory_from_movement trigger double-counts for 'restock' reason
--      (trigger + transfer_stock both update inventory_location_stock)
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX 1: Expand stock_movements reason CHECK constraint
-- The existing constraint rejects 'loss', 'physical_count',
-- 'order_cancelled_restock', and 'order_edit_compensation' which are all
-- used by existing functions. This is the ROOT CAUSE of PÉRDIDA not working.
-- ============================================================================

ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_reason_check;

ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_reason_check
CHECK (reason IN (
    -- Original valid reasons:
    'order_paid',
    'adjustment',
    'manual',
    'order_delivered',
    'variant_override',
    'addon_consumed',
    'direct_sale',
    'recipe_consumption',
    'restock',
    'waste',
    'transfer',
    'sale',
    'open_package',
    'cancellation_reversal',
    -- NEW reasons needed by existing functions:
    'loss',                     -- consume_from_smart_packages (WASTE/PÉRDIDA)
    'physical_count',           -- adjust_inventory() default reason
    'stock_transfer',           -- transfer_stock_between_locations()
    'manual_adjustment',        -- general manual adjustments
    'order_cancelled_restock',  -- rollback_stock_on_cancellation() (P3)
    'order_edit_compensation'   -- compensate_stock_on_order_edit() trigger
));


-- ============================================================================
-- FIX 2 + 3: Harden consume_from_smart_packages()
--   - Add FOR UPDATE on inventory_items to prevent race conditions
--   - Add cross-store validation (auth.uid() must belong to item's store)
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

    -- FIX 3: Cross-store validation
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED: No authenticated user');
    END IF;

    SELECT store_id INTO v_caller_store FROM profiles WHERE id = v_caller_id;

    -- FIX 2: Add FOR UPDATE to prevent concurrent race conditions
    SELECT store_id, name, COALESCE(closed_stock, 0), COALESCE(package_size, 1), unit_type
    INTO v_store_id, v_item_name, v_closed_qty, v_pkg_capacity, v_unit
    FROM inventory_items WHERE id = p_inventory_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item no encontrado');
    END IF;

    -- FIX 3: Validate caller belongs to the same store
    IF v_caller_store IS NOT NULL AND v_caller_store != v_store_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED: Item no pertenece a tu local');
    END IF;

    -- Get default location
    SELECT id INTO v_location_id FROM storage_locations
    WHERE store_id = v_store_id AND (is_default = true OR name ILIKE '%Principal%')
    ORDER BY is_default DESC NULLS LAST LIMIT 1;

    -- Calculate total available stock
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
            RETURN jsonb_build_object('success', false, 'error', 'No hay paquetes cerrados disponibles');
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

        -- Decrement closed packages
        UPDATE inventory_items
        SET closed_stock = closed_stock - 1, updated_at = now()
        WHERE id = p_inventory_item_id;

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
$function$;


-- ============================================================================
-- FIX 4 + 7 + 8: Harden transfer_stock()
--   - Bridge to stock_movements ledger for PURCHASE/RESTOCK operations
--   - Fix column names: item_id (not inventory_item_id) in inventory_location_stock
--   - Fix ON CONFLICT to use (store_id, item_id, location_id)
--   - FIX 8: Fix INSERT into inventory_movements to match ACTUAL table schema:
--     Actual columns: id(auto), tenant_id(NOT NULL), inventory_item_id, lot_id,
--     type(inventory_movement_enum: 'in'|'out'|'adjustment'), qty_base_units, reason,
--     ref_order_id, created_at(auto)
--     OLD (BROKEN): used movement_type, quantity, from_location_id, to_location_id,
--     user_id, notes — NONE of these columns exist in the actual table!
-- ============================================================================

CREATE OR REPLACE FUNCTION public.transfer_stock(
    p_item_id uuid,
    p_from_location_id uuid,
    p_to_location_id uuid,
    p_quantity numeric,
    p_user_id uuid DEFAULT auth.uid(),
    p_notes text DEFAULT ''::text,
    p_movement_type text DEFAULT 'transfer'::text,
    p_reason text DEFAULT 'Transferencia'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_store_id uuid;
    v_item_name text;
    v_movement_id uuid;
    v_current_stock numeric;
    v_from_stock numeric;
    v_caller_id UUID;
    v_caller_store UUID;
    v_unit_type text;
    v_movement_enum_type text;
BEGIN
    -- Auth check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Get caller store
    SELECT store_id INTO v_caller_store FROM profiles WHERE id = v_caller_id;

    -- Get item details with row lock
    SELECT store_id, name, current_stock, unit_type
    INTO v_store_id, v_item_name, v_current_stock, v_unit_type
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
        WHERE item_id = p_item_id AND location_id = p_from_location_id;

        IF NOT FOUND OR COALESCE(v_from_stock, 0) < p_quantity THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'INSUFFICIENT_STOCK',
                'message', format('Stock insuficiente en origen. Disponible: %s, Requerido: %s',
                    COALESCE(v_from_stock, 0)::text, p_quantity::text)
            );
        END IF;
    END IF;

    -- Determine inventory_movement_enum type
    -- Enum values: 'in', 'out', 'adjustment'
    IF p_from_location_id IS NULL THEN
        v_movement_enum_type := 'in';       -- Restock = incoming
    ELSIF p_to_location_id IS NULL THEN
        v_movement_enum_type := 'out';      -- Outgoing
    ELSE
        v_movement_enum_type := 'adjustment'; -- Transfer between locations
    END IF;

    -- FIX 8: Create movement record matching ACTUAL inventory_movements schema
    -- Actual columns: id(auto), tenant_id(NOT NULL), inventory_item_id, lot_id,
    --   type(inventory_movement_enum), qty_base_units, reason, ref_order_id, created_at(auto)
    INSERT INTO inventory_movements (
        tenant_id, inventory_item_id, type, qty_base_units, reason
    ) VALUES (
        v_store_id,
        p_item_id,
        v_movement_enum_type::inventory_movement_enum,
        p_quantity,
        COALESCE(p_reason, 'Transferencia')
    ) RETURNING id INTO v_movement_id;

    -- FIX 4: Also log to stock_movements ledger for PURCHASE/RESTOCK operations
    IF p_from_location_id IS NULL AND p_to_location_id IS NOT NULL THEN
        INSERT INTO stock_movements (
            store_id, inventory_item_id, order_id, qty_delta,
            unit_type, reason, idempotency_key, location_id, created_by
        ) VALUES (
            v_store_id, p_item_id, NULL, p_quantity,
            COALESCE(v_unit_type, 'un'), 'restock',
            v_movement_id::text, p_to_location_id, v_caller_id
        );
    END IF;

    -- Update stock based on operation type
    IF p_from_location_id IS NULL THEN
        -- RESTOCK: Add to global stock
        UPDATE inventory_items
        SET current_stock = current_stock + p_quantity, updated_at = NOW()
        WHERE id = p_item_id;

        -- Update location stock
        IF p_to_location_id IS NOT NULL THEN
            INSERT INTO inventory_location_stock (item_id, location_id, store_id, closed_units)
            VALUES (p_item_id, p_to_location_id, v_store_id, p_quantity)
            ON CONFLICT (store_id, item_id, location_id)
            DO UPDATE SET closed_units = inventory_location_stock.closed_units + p_quantity;
        END IF;
    ELSE
        -- TRANSFER: Deduct from source, add to destination
        UPDATE inventory_location_stock
        SET closed_units = closed_units - p_quantity
        WHERE item_id = p_item_id AND location_id = p_from_location_id;

        IF p_to_location_id IS NOT NULL THEN
            INSERT INTO inventory_location_stock (item_id, location_id, store_id, closed_units)
            VALUES (p_item_id, p_to_location_id, v_store_id, p_quantity)
            ON CONFLICT (store_id, item_id, location_id)
            DO UPDATE SET closed_units = inventory_location_stock.closed_units + p_quantity;
        END IF;

        -- Global stock stays the same for transfers
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
$function$;


-- ============================================================================
-- FIX 6 + 9: Fix update_inventory_from_movement trigger
-- Problem: trigger blindly applies qty_delta to inventory_location_stock.closed_units
-- for ALL stock_movements inserts. But consume_from_smart_packages already handles
-- stock changes for consumption operations (loss, sale, etc.) via open_packages
-- and inventory_items directly. The trigger was double-deducting and also causing
-- CHECK constraint violations when trying to INSERT negative values.
--
-- FIX 9: Also skip 'restock' because transfer_stock() already handles
-- inventory_location_stock directly. Without this, restocks are double-counted
-- (trigger adds + function adds = 2x the expected stock increase).
--
-- Fix: Skip inventory_location_stock update for consumption + restock reasons.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_inventory_from_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $trigger_fn$
BEGIN
    -- Basic validation
    IF NEW.inventory_item_id IS NULL THEN
        RAISE EXCEPTION 'Stock movement must have an inventory_item_id';
    END IF;

    -- Only track if has location_id
    IF NEW.location_id IS NOT NULL THEN
        -- SKIP inventory_location_stock updates for reasons that are handled
        -- by their respective RPC functions directly:
        -- - consume_from_smart_packages: manages open_packages + inventory_items.closed_stock
        -- - transfer_stock: manages inventory_location_stock directly for restocks
        -- - finalize_order_stock: manages stock through consume_from_smart_packages
        -- Applying qty_delta here would cause double-deduction or double-counting.
        IF NEW.reason NOT IN (
            'loss', 'sale', 'recipe_consumption', 'direct_sale',
            'variant_override', 'addon_consumed', 'order_paid', 'order_delivered',
            'restock'  -- FIX 9: transfer_stock() handles this directly
        ) THEN
            -- UPSERT: update closed_units for transfers, adjustments, reversals
            INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
            VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta)
            ON CONFLICT (store_id, item_id, location_id)
            DO UPDATE SET
                closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units,
                updated_at = now();
        END IF;
    END IF;

    -- NO actualizamos inventory_items aquí — v7 (consume_from_smart_packages) ya lo hace

    RETURN NEW;
END;
$trigger_fn$;


COMMIT;
