-- ============================================================================
-- SSSMA Phase 2: Route all stock mutations through apply_stock_delta()
-- Date: 2026-02-17
--
-- After Phase 1 (apply_stock_delta deployed), Phase 2 migrates the remaining
-- direct current_stock mutations to go through apply_stock_delta():
--
--   2a. apply_stock_delta()           — add p_notes parameter
--   2b. transfer_stock()              — RESTOCK path delegates to apply_stock_delta
--   2c. update_inventory_from_movement— remove 'restock' from skip list
--   2d. rollback_stock_on_cancellation— use apply_stock_delta per reversal
--   2e. finalize_order_stock()        — use apply_stock_delta per deduction
--
-- Post-Phase 2 state:
--   USES apply_stock_delta: adjust_inventory, transfer_stock(restock),
--                           rollback_stock_on_cancellation, finalize_order_stock
--   STILL DIRECT: consume_from_smart_packages (Phase 3)
--
-- Invariant maintained: stock_movements and current_stock are ALWAYS updated
-- together (atomically) via apply_stock_delta.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 2a. Update apply_stock_delta() — add p_notes parameter
--
-- rollback_stock_on_cancellation() uses a 'notes' field to track which
-- original movement was reversed. Adding it here keeps the signature complete.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_stock_delta(
    p_inventory_item_id UUID,
    p_store_id UUID,
    p_qty_delta NUMERIC,
    p_reason TEXT,
    p_location_id UUID DEFAULT NULL,
    p_order_id UUID DEFAULT NULL,
    p_unit_type TEXT DEFAULT 'un',
    p_idempotency_key TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT auth.uid(),
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
    v_movement_id BIGINT;
BEGIN
    -- Validate: delta must not be zero
    IF p_qty_delta = 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'noop', true,
            'message', 'Delta is zero, no change needed'
        );
    END IF;

    -- Validate: reason must be provided
    IF p_reason IS NULL OR p_reason = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MISSING_REASON',
            'message', 'Reason is required for stock mutations'
        );
    END IF;

    -- Lock the item row and get current stock
    SELECT current_stock
    INTO v_current_stock
    FROM inventory_items
    WHERE id = p_inventory_item_id AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ITEM_NOT_FOUND',
            'message', 'Item not found in store'
        );
    END IF;

    -- Validate: negative delta must not exceed current stock
    IF p_qty_delta < 0 AND v_current_stock < ABS(p_qty_delta) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_STOCK',
            'message', format('Stock insuficiente: disponible %s, necesitas %s',
                v_current_stock::text, ABS(p_qty_delta)::text),
            'current_stock', v_current_stock,
            'requested_delta', p_qty_delta
        );
    END IF;

    -- STEP 1: Write to the ledger (source of truth)
    INSERT INTO stock_movements (
        idempotency_key,
        store_id,
        inventory_item_id,
        order_id,
        qty_delta,
        unit_type,
        reason,
        location_id,
        created_by,
        notes,
        created_at
    ) VALUES (
        COALESCE(p_idempotency_key, gen_random_uuid()::text),
        p_store_id,
        p_inventory_item_id,
        p_order_id,
        p_qty_delta,
        p_unit_type,
        p_reason,
        p_location_id,
        COALESCE(p_created_by, auth.uid()),
        p_notes,
        NOW()
    ) RETURNING id INTO v_movement_id;

    -- STEP 2: Update the cache
    UPDATE inventory_items
    SET current_stock = current_stock + p_qty_delta,
        updated_at = NOW()
    WHERE id = p_inventory_item_id;

    -- Read back the new stock value
    v_new_stock := v_current_stock + p_qty_delta;

    RETURN jsonb_build_object(
        'success', true,
        'movement_id', v_movement_id,
        'old_stock', v_current_stock,
        'new_stock', v_new_stock,
        'delta', p_qty_delta,
        'reason', p_reason
    );

EXCEPTION
    WHEN check_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CHECK_VIOLATION',
            'message', 'Stock constraint violation: ' || SQLERRM
        );
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'DUPLICATE_MOVEMENT',
            'message', 'Duplicate idempotency key: ' || SQLERRM
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLSTATE,
            'message', SQLERRM
        );
END;
$function$;


-- ============================================================================
-- 2b. Update transfer_stock() — RESTOCK path delegates to apply_stock_delta()
--
-- Before: INSERT inventory_movements + INSERT stock_movements
--         + UPDATE current_stock + UPDATE inventory_location_stock
-- After:  INSERT inventory_movements + apply_stock_delta() (handles ledger+cache)
--         trigger handles inventory_location_stock (see 2c)
--
-- TRANSFER path (both locations): unchanged — no stock_movements, no
-- current_stock change, direct inventory_location_stock update.
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
    v_delta_result JSONB;
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
    IF p_from_location_id IS NULL THEN
        v_movement_enum_type := 'in';       -- Restock = incoming
    ELSIF p_to_location_id IS NULL THEN
        v_movement_enum_type := 'out';      -- Outgoing
    ELSE
        v_movement_enum_type := 'adjustment'; -- Transfer between locations
    END IF;

    -- Create inventory_movements audit record
    INSERT INTO inventory_movements (
        tenant_id, inventory_item_id, type, qty_base_units, reason
    ) VALUES (
        v_store_id,
        p_item_id,
        v_movement_enum_type::inventory_movement_enum,
        p_quantity,
        COALESCE(p_reason, 'Transferencia')
    ) RETURNING id INTO v_movement_id;

    IF p_from_location_id IS NULL THEN
        -- RESTOCK: delegate entirely to apply_stock_delta()
        -- apply_stock_delta handles: stock_movements INSERT + current_stock UPDATE
        -- The trigger update_inventory_from_movement handles: inventory_location_stock UPSERT
        -- (see 2c: 'restock' removed from trigger skip list)
        v_delta_result := apply_stock_delta(
            p_inventory_item_id := p_item_id,
            p_store_id := v_store_id,
            p_qty_delta := p_quantity,
            p_reason := 'restock',
            p_location_id := p_to_location_id,
            p_idempotency_key := v_movement_id::text,
            p_unit_type := COALESCE(v_unit_type, 'un'),
            p_created_by := v_caller_id,
            p_notes := NULLIF(p_notes, '')
        );

        IF NOT (v_delta_result->>'success')::boolean THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', v_delta_result->>'error',
                'message', v_delta_result->>'message'
            );
        END IF;

        v_current_stock := (v_delta_result->>'new_stock')::numeric;

    ELSE
        -- TRANSFER: Deduct from source, add to destination
        -- (no global current_stock change — net-zero operation)
        UPDATE inventory_location_stock
        SET closed_units = closed_units - p_quantity
        WHERE item_id = p_item_id AND location_id = p_from_location_id;

        IF p_to_location_id IS NOT NULL THEN
            INSERT INTO inventory_location_stock (item_id, location_id, store_id, closed_units)
            VALUES (p_item_id, p_to_location_id, v_store_id, p_quantity)
            ON CONFLICT (store_id, item_id, location_id)
            DO UPDATE SET closed_units = inventory_location_stock.closed_units + p_quantity;
        END IF;

        -- Global stock unchanged; touch updated_at only
        UPDATE inventory_items SET updated_at = NOW() WHERE id = p_item_id;
    END IF;

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
-- 2c. Update trigger: remove 'restock' from skip list
--
-- transfer_stock() RESTOCK path now calls apply_stock_delta(), which inserts
-- into stock_movements with reason='restock'. The trigger should update
-- inventory_location_stock for that reason (was previously skipped because
-- transfer_stock handled it directly — now it doesn't).
--
-- Remaining skip list: reasons used by consume_from_smart_packages(), which
-- manages open_packages directly (not migrated until Phase 3).
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
        -- SKIP inventory_location_stock updates ONLY for reasons used by
        -- consume_from_smart_packages(), which manages open_packages directly.
        -- Those functions do NOT deduct from closed_units; the trigger updating
        -- closed_units for those reasons would be wrong.
        --
        -- Reasons to skip (managed by consume_from_smart_packages via open_packages):
        --   loss, sale, recipe_consumption, direct_sale,
        --   variant_override, addon_consumed, order_paid, order_delivered
        --
        -- NOTE: 'restock' REMOVED from skip list (Phase 2b).
        -- transfer_stock() RESTOCK now delegates to apply_stock_delta(), so the
        -- trigger correctly handles inventory_location_stock here.
        IF NEW.reason NOT IN (
            'loss', 'sale', 'recipe_consumption', 'direct_sale',
            'variant_override', 'addon_consumed', 'order_paid', 'order_delivered'
        ) THEN
            -- UPSERT closed_units for: restock, adjustment, order_cancelled_restock,
            -- order_edit_compensation, physical_count, stock_transfer, etc.
            INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
            VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta)
            ON CONFLICT (store_id, item_id, location_id)
            DO UPDATE SET
                closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units,
                updated_at = now();
        END IF;
    END IF;

    -- current_stock is managed exclusively by apply_stock_delta()
    -- consume_from_smart_packages() manages its own current_stock (Phase 3 pending)
    RETURN NEW;
END;
$trigger_fn$;


-- ============================================================================
-- 2d. Update rollback_stock_on_cancellation() → apply_stock_delta()
--
-- Before: INSERT stock_movements + UPDATE current_stock (two separate ops)
-- After:  apply_stock_delta() (atomic: ledger + cache together)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rollback_stock_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_movement RECORD;
    v_reversal_qty NUMERIC;
    v_delta_result JSONB;
BEGIN
    IF NEW.status = 'cancelled'
       AND (OLD.status IS NULL OR OLD.status != 'cancelled')
       AND NEW.stock_deducted = TRUE THEN

        RAISE NOTICE '[Stock Rollback] Order % cancelled, reverting ALL stock movements', NEW.id;

        -- Reverse ALL deduction movements for this order
        FOR v_movement IN
            SELECT
                sm.id,
                sm.inventory_item_id,
                sm.qty_delta,
                sm.unit_type,
                sm.location_id,
                sm.store_id
            FROM stock_movements sm
            WHERE sm.order_id = NEW.id
              AND sm.qty_delta < 0
              AND sm.reason IN (
                  'recipe_consumption',   -- V6+ recipe ingredients
                  'direct_sale',          -- Direct inventory item sales
                  'variant_override',     -- Variant extra ingredients
                  'addon_consumed',       -- Addon ingredient deductions
                  'recipe_ingredient',    -- Legacy reason name
                  'order_fulfillment'     -- Legacy reason name
              )
        LOOP
            v_reversal_qty := ABS(v_movement.qty_delta);

            -- Atomic ledger + cache update via apply_stock_delta
            v_delta_result := apply_stock_delta(
                p_inventory_item_id := v_movement.inventory_item_id,
                p_store_id := v_movement.store_id,
                p_qty_delta := v_reversal_qty,
                p_reason := 'order_cancelled_restock',
                p_location_id := v_movement.location_id,
                p_order_id := NEW.id,
                p_unit_type := v_movement.unit_type,
                p_notes := 'Automatic restock: cancelled order (reversed movement: ' || v_movement.id || ')'
            );

            IF NOT (v_delta_result->>'success')::boolean THEN
                RAISE WARNING '[Stock Rollback] Failed to restore item % for order %: %',
                    v_movement.inventory_item_id, NEW.id, v_delta_result->>'error';
            ELSE
                RAISE NOTICE '[Stock Rollback] Restored % % of item %',
                    v_reversal_qty, v_movement.unit_type, v_movement.inventory_item_id;
            END IF;
        END LOOP;

        NEW.stock_rolled_back := TRUE;
    END IF;

    RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_rollback_stock_on_cancel ON orders;
CREATE TRIGGER trg_rollback_stock_on_cancel
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION rollback_stock_on_cancellation();


-- ============================================================================
-- 2e. Update finalize_order_stock() → apply_stock_delta()
--
-- Before (per deduction): INSERT stock_movements + UPDATE current_stock = GREATEST(...)
-- After  (per deduction): apply_stock_delta() — atomic ledger + cache update
--
-- Behavior change: GREATEST(current_stock - qty, 0) is replaced by
-- apply_stock_delta's INSUFFICIENT_STOCK check. If stock is 0 and an item is
-- ordered, the deduction is skipped (warning logged) instead of silently
-- writing a stock_movement for the full qty with cache clamped to 0.
-- This is STRICTER and CONSISTENT: ledger and cache always agree.
--
-- Note: trigger skip list still includes consumption reasons
-- (recipe_consumption, direct_sale, etc.) so inventory_location_stock.closed_units
-- is NOT updated for order deductions — same behavior as before Phase 2.
-- Phase 3 will address this via consume_from_smart_packages migration.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_order_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    v_target_location_id UUID;
    v_has_recipe BOOLEAN;
    v_final_qty NUMERIC;
    v_direct_unit TEXT;
    v_o_inv_id UUID;
    v_o_qty NUMERIC;
    v_o_unit TEXT;
    v_variant_overrides JSONB;
    v_delta_result JSONB;
BEGIN
    -- Prevent double deduction
    IF NEW.stock_deducted = TRUE THEN
        RETURN NEW;
    END IF;

    -- Only deduct when order is finalized or paid
    IF NOT (
        NEW.status IN ('served', 'delivered', 'entregado', 'finalizado')
        OR NEW.is_paid = TRUE
        OR NEW.payment_status IN ('paid', 'approved')
    ) THEN
        RETURN NEW;
    END IF;

    v_order_id := NEW.id;
    v_store_id := NEW.store_id;
    v_items := NEW.items;

    -- Determine target storage location
    SELECT id INTO v_target_location_id
    FROM storage_locations
    WHERE store_id = v_store_id AND is_default = TRUE
    LIMIT 1;

    -- Build items from order_items table if JSONB is empty
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

    -- ========== MAIN ITEM LOOP ==========
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

        -- Extract variant ID
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

        -- === RECIPE INGREDIENTS ===
        v_recipe_multiplier := 1.0;
        IF v_variant_id IS NOT NULL THEN
            SELECT COALESCE(recipe_multiplier, 1.0) INTO v_recipe_multiplier
            FROM product_variants
            WHERE id = v_variant_id;
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

            v_delta_result := apply_stock_delta(
                p_inventory_item_id := v_recipe_record.inventory_item_id,
                p_store_id := v_store_id,
                p_qty_delta := -v_final_qty,
                p_reason := 'recipe_consumption',
                p_location_id := v_target_location_id,
                p_order_id := v_order_id,
                p_unit_type := COALESCE(v_recipe_record.unit_type, 'unit')
            );

            IF NOT (v_delta_result->>'success')::boolean THEN
                RAISE WARNING '[finalize_order_stock] Recipe deduction failed for item % (order %): %',
                    v_recipe_record.inventory_item_id, v_order_id, v_delta_result->>'error';
            END IF;
        END LOOP;

        -- === DIRECT SALE (no recipe) ===
        IF v_has_recipe = FALSE THEN
            SELECT unit_type INTO v_direct_unit
            FROM inventory_items
            WHERE id = v_product_id;

            IF FOUND THEN
                v_delta_result := apply_stock_delta(
                    p_inventory_item_id := v_product_id,
                    p_store_id := v_store_id,
                    p_qty_delta := -v_item_qty,
                    p_reason := 'direct_sale',
                    p_location_id := v_target_location_id,
                    p_order_id := v_order_id,
                    p_unit_type := COALESCE(v_direct_unit, 'unit')
                );

                IF NOT (v_delta_result->>'success')::boolean THEN
                    RAISE WARNING '[finalize_order_stock] Direct sale deduction failed for item % (order %): %',
                        v_product_id, v_order_id, v_delta_result->>'error';
                END IF;
            END IF;
        END IF;

        -- === VARIANT OVERRIDES (extra ingredients) ===
        IF v_variant_id IS NOT NULL THEN
            SELECT recipe_overrides INTO v_variant_overrides
            FROM product_variants
            WHERE id = v_variant_id;

            IF v_variant_overrides IS NOT NULL AND jsonb_array_length(v_variant_overrides) > 0 THEN
                FOR v_override_item IN SELECT * FROM jsonb_array_elements(v_variant_overrides)
                LOOP
                    v_o_inv_id := (v_override_item->>'inventory_item_id')::UUID;
                    v_o_qty := COALESCE((v_override_item->>'quantity')::NUMERIC, 0) * v_item_qty;
                    SELECT unit_type INTO v_o_unit FROM inventory_items WHERE id = v_o_inv_id;
                    IF v_o_unit = 'unit' THEN v_o_qty := ROUND(v_o_qty); END IF;

                    IF v_o_inv_id IS NOT NULL AND v_o_qty > 0 THEN
                        v_delta_result := apply_stock_delta(
                            p_inventory_item_id := v_o_inv_id,
                            p_store_id := v_store_id,
                            p_qty_delta := -v_o_qty,
                            p_reason := 'variant_override',
                            p_location_id := v_target_location_id,
                            p_order_id := v_order_id,
                            p_unit_type := COALESCE(v_o_unit, 'unit')
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

    -- ========== ADDON STOCK DEDUCTION ==========
    BEGIN
        FOR v_addon_record IN
            SELECT
                pa.inventory_item_id,
                pa.quantity_consumed,
                oi.quantity AS item_qty,
                ii.unit_type
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

            v_delta_result := apply_stock_delta(
                p_inventory_item_id := v_addon_record.inventory_item_id,
                p_store_id := v_store_id,
                p_qty_delta := -v_final_qty,
                p_reason := 'addon_consumed',
                p_location_id := v_target_location_id,
                p_order_id := v_order_id,
                p_unit_type := COALESCE(v_addon_record.unit_type, 'unit')
            );

            IF NOT (v_delta_result->>'success')::boolean THEN
                RAISE WARNING '[finalize_order_stock] Addon deduction failed for item % (order %): %',
                    v_addon_record.inventory_item_id, v_order_id, v_delta_result->>'error';
            END IF;
        END LOOP;
    EXCEPTION WHEN undefined_table THEN
        -- product_addons or order_item_addons table may not exist in all environments
        RAISE NOTICE 'Addon tables not found, skipping addon deduction for order %', v_order_id;
    END;

    -- Mark as deducted
    NEW.stock_deducted := TRUE;
    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'finalize_order_stock failed for order %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS trg_finalize_stock ON orders;
CREATE TRIGGER trg_finalize_stock
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION finalize_order_stock();


-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '=== SSSMA Phase 2 Applied ===';
    RAISE NOTICE '  2a. apply_stock_delta(): now accepts p_notes parameter';
    RAISE NOTICE '  2b. transfer_stock(): RESTOCK path delegates to apply_stock_delta()';
    RAISE NOTICE '  2c. trigger update_inventory_from_movement: restock removed from skip list';
    RAISE NOTICE '  2d. rollback_stock_on_cancellation(): uses apply_stock_delta() per reversal';
    RAISE NOTICE '  2e. finalize_order_stock(): uses apply_stock_delta() per deduction';
    RAISE NOTICE '';
    RAISE NOTICE 'Functions still using direct current_stock mutation (Phase 3):';
    RAISE NOTICE '  - consume_from_smart_packages() (manages open_packages FIFO)';
    RAISE NOTICE '  - calculate_item_totals() (trigger cascade via trg_sync_open_pkg_to_item)';
    RAISE NOTICE '';
    RAISE NOTICE 'Run validate_stock_integrity() to check for drift.';
END $$;


COMMIT;
