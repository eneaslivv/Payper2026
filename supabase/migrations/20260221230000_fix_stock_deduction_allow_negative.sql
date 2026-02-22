-- ============================================================================
-- Fix: Stock deduction not working for orders when ingredients have 0 stock
-- Date: 2026-02-21
--
-- Root cause (3 bugs):
--
-- BUG 1: apply_stock_delta() returns INSUFFICIENT_STOCK when stock = 0 and
--   a negative delta is requested. For order fulfillment (recipe consumption),
--   the deduction should ALWAYS be recorded in the ledger. A bartender making
--   a drink uses the ingredients regardless of what the system says.
--
-- BUG 2: finalize_order_stock() was corrupted on the live DB by a debug
--   breadcrumb INSERT that fails on idempotency_key NOT NULL constraint,
--   causing the outer EXCEPTION handler to swallow the error and return NEW
--   without setting stock_deducted = TRUE.
--
-- BUG 3: finalize_order_stock() compared NEW.status (order_status_enum) with
--   string literals 'entregado' and 'finalizado' which are NOT valid enum values.
--   PostgreSQL casts IN(...) literals to the enum type → 22P02 crash.
--   Fix: cast NEW.status::text and NEW.payment_status::text before comparison.
--
-- Fix:
-- 1. Add p_allow_negative parameter to apply_stock_delta()
--    - When TRUE: skip INSUFFICIENT_STOCK guard, clamp current_stock to 0
--    - Ledger (stock_movements) always records the FULL delta
--    - Cache (current_stock) clamped to GREATEST(stock + delta, 0)
--    - validate_stock_integrity() will flag the expected drift
--
-- 2. Restore finalize_order_stock() to clean version (remove debug artifacts)
--    - All deductions use p_allow_negative := true
--    - Order fulfillment ALWAYS records stock consumption
--
-- 3. Clean up debug function test_finalize_debug()
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Upgrade apply_stock_delta() — add p_allow_negative parameter
--
-- Must DROP old signature first because adding a parameter creates an overload.
-- Existing callers use named parameters, so they auto-match the new signature.
-- ============================================================================

DROP FUNCTION IF EXISTS public.apply_stock_delta(UUID, UUID, NUMERIC, TEXT, UUID, UUID, TEXT, TEXT, UUID, TEXT);

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
    p_notes TEXT DEFAULT NULL,
    p_allow_negative BOOLEAN DEFAULT FALSE
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
    -- UNLESS p_allow_negative is TRUE (used by order fulfillment / recipe consumption)
    IF p_qty_delta < 0 AND v_current_stock < ABS(p_qty_delta) THEN
        IF NOT p_allow_negative THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'INSUFFICIENT_STOCK',
                'message', format('Stock insuficiente: disponible %s, necesitas %s',
                    v_current_stock::text, ABS(p_qty_delta)::text),
                'current_stock', v_current_stock,
                'requested_delta', p_qty_delta
            );
        END IF;
        -- When allowing negative: ledger records FULL delta, cache clamped to 0
    END IF;

    -- STEP 1: Write to the ledger (source of truth) — ALWAYS the full delta
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

    -- STEP 2: Update the cache — clamp to 0 when allow_negative
    -- (CHECK constraint chk_current_stock_non_negative prevents going below 0)
    IF p_allow_negative THEN
        UPDATE inventory_items
        SET current_stock = GREATEST(current_stock + p_qty_delta, 0),
            updated_at = NOW()
        WHERE id = p_inventory_item_id;

        v_new_stock := GREATEST(v_current_stock + p_qty_delta, 0);
    ELSE
        UPDATE inventory_items
        SET current_stock = current_stock + p_qty_delta,
            updated_at = NOW()
        WHERE id = p_inventory_item_id;

        v_new_stock := v_current_stock + p_qty_delta;
    END IF;

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
-- 2. Restore finalize_order_stock() — clean version, p_allow_negative := true
--
-- All recipe/direct/variant/addon deductions use p_allow_negative := true
-- so order fulfillment ALWAYS records the consumption in the ledger.
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
    -- Cast to TEXT to avoid invalid enum value crash (BUG 3: 'entregado'/'finalizado' not in enum)
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
                p_unit_type := COALESCE(v_recipe_record.unit_type, 'unit'),
                p_allow_negative := true
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
                    p_unit_type := COALESCE(v_direct_unit, 'unit'),
                    p_allow_negative := true
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
                            p_unit_type := COALESCE(v_o_unit, 'unit'),
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
                p_unit_type := COALESCE(v_addon_record.unit_type, 'unit'),
                p_allow_negative := true
            );

            IF NOT (v_delta_result->>'success')::boolean THEN
                RAISE WARNING '[finalize_order_stock] Addon deduction failed for item % (order %): %',
                    v_addon_record.inventory_item_id, v_order_id, v_delta_result->>'error';
            END IF;
        END LOOP;
    EXCEPTION WHEN undefined_table THEN
        -- product_addons or order_item_addons table may not exist
        RAISE NOTICE 'Addon tables not found, skipping addon deduction for order %', v_order_id;
    END;

    -- Mark as deducted
    NEW.stock_deducted := TRUE;
    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'finalize_order_stock failed for order %: % [%]', NEW.id, SQLERRM, SQLSTATE;
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
-- 3. Clean up debug artifacts
-- ============================================================================

DROP FUNCTION IF EXISTS public.test_finalize_debug();


-- ============================================================================
-- 4. Re-process affected order: reset stock_deducted so trigger re-fires
--    The UPDATE itself triggers trg_finalize_stock which will now succeed.
-- ============================================================================

UPDATE orders
SET stock_deducted = false
WHERE id = 'de83b4f8-37e1-4b2b-ad77-e9f550d1d42d'
  AND stock_deducted = false;


-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_deducted BOOLEAN;
    v_movements INT;
BEGIN
    -- Check if stock was deducted
    SELECT stock_deducted INTO v_deducted
    FROM orders
    WHERE id = 'de83b4f8-37e1-4b2b-ad77-e9f550d1d42d';

    -- Count stock movements for this order
    SELECT COUNT(*) INTO v_movements
    FROM stock_movements
    WHERE order_id = 'de83b4f8-37e1-4b2b-ad77-e9f550d1d42d';

    RAISE NOTICE '=== Stock Deduction Fix Applied ===';
    RAISE NOTICE '  apply_stock_delta(): now supports p_allow_negative parameter';
    RAISE NOTICE '  finalize_order_stock(): clean version, all deductions allow negative';
    RAISE NOTICE '  test_finalize_debug(): dropped (debug artifact)';
    RAISE NOTICE '';
    RAISE NOTICE '  Order DE83B4F8: stock_deducted = %', v_deducted;
    RAISE NOTICE '  Order DE83B4F8: stock_movements count = %', v_movements;
    RAISE NOTICE '';
    RAISE NOTICE 'NOTE: current_stock is clamped to 0 when allow_negative.';
    RAISE NOTICE 'The ledger (stock_movements) records the FULL deduction.';
    RAISE NOTICE 'validate_stock_integrity() will show expected drift for items at 0.';
END $$;

COMMIT;
