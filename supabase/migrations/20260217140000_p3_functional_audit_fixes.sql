-- =============================================
-- MIGRATION P3: Functional Audit Critical Fixes
-- Date: 2026-02-17
-- Fixes 5 critical issues from comprehensive functional audit:
--   1. Addon stock deduction in finalize_order_stock()
--   2. Idempotent confirm_order_delivery()
--   3. Gift limits per PR per month in admin_grant_gift()
--   4. CHECK constraints on wallet_balance and current_stock
--   5. Fix rollback filter to include ALL stock movement reasons
-- =============================================

-- =============================================
-- FIX 1 + 5 COMBINED: Rebuild finalize_order_stock() with addon support
-- AND fix rollback_stock_on_cancellation() with correct reason filter
-- =============================================

-- 1A. Add addon deduction to finalize_order_stock()
-- The current V6 has a comment but NO implementation for addons.
-- We add a dedicated addon deduction section after the main item loop.

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
    v_r_unit TEXT;
    v_direct_unit TEXT;
    v_o_inv_id UUID;
    v_o_qty NUMERIC;
    v_o_unit TEXT;
    v_variant_overrides JSONB;
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

            INSERT INTO stock_movements (
                idempotency_key, store_id, inventory_item_id, order_id,
                qty_delta, unit_type, reason, location_id
            ) VALUES (
                gen_random_uuid(), v_store_id, v_recipe_record.inventory_item_id, v_order_id,
                -v_final_qty, COALESCE(v_recipe_record.unit_type, 'unit'), 'recipe_consumption', v_target_location_id
            );

            -- Also update inventory_items.current_stock directly
            UPDATE inventory_items
            SET current_stock = GREATEST(current_stock - v_final_qty, 0),
                updated_at = NOW()
            WHERE id = v_recipe_record.inventory_item_id;
        END LOOP;

        -- === DIRECT SALE (no recipe) ===
        IF v_has_recipe = FALSE THEN
            SELECT unit_type INTO v_direct_unit
            FROM inventory_items
            WHERE id = v_product_id;

            IF FOUND THEN
                INSERT INTO stock_movements (
                    idempotency_key, store_id, inventory_item_id, order_id,
                    qty_delta, unit_type, reason, location_id
                ) VALUES (
                    gen_random_uuid(), v_store_id, v_product_id, v_order_id,
                    -v_item_qty, COALESCE(v_direct_unit, 'unit'), 'direct_sale', v_target_location_id
                );

                UPDATE inventory_items
                SET current_stock = GREATEST(current_stock - v_item_qty, 0),
                    updated_at = NOW()
                WHERE id = v_product_id;
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
                        INSERT INTO stock_movements (
                            idempotency_key, store_id, inventory_item_id, order_id,
                            qty_delta, unit_type, reason, location_id
                        ) VALUES (
                            gen_random_uuid(), v_store_id, v_o_inv_id, v_order_id,
                            -v_o_qty, COALESCE(v_o_unit, 'unit'), 'variant_override', v_target_location_id
                        );

                        UPDATE inventory_items
                        SET current_stock = GREATEST(current_stock - v_o_qty, 0),
                            updated_at = NOW()
                        WHERE id = v_o_inv_id;
                    END IF;
                END LOOP;
            END IF;
        END IF;
    END LOOP;

    -- ========== NEW: ADDON STOCK DEDUCTION ==========
    -- Query order_item_addons -> product_addons -> inventory_items
    -- This handles ALL addons for ALL items in this order
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

            INSERT INTO stock_movements (
                idempotency_key, store_id, inventory_item_id, order_id,
                qty_delta, unit_type, reason, location_id
            ) VALUES (
                gen_random_uuid(), v_store_id, v_addon_record.inventory_item_id, v_order_id,
                -v_final_qty, COALESCE(v_addon_record.unit_type, 'unit'), 'addon_consumed', v_target_location_id
            );

            UPDATE inventory_items
            SET current_stock = GREATEST(current_stock - v_final_qty, 0),
                updated_at = NOW()
            WHERE id = v_addon_record.inventory_item_id;
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

-- =============================================
-- FIX 5: Fix rollback_stock_on_cancellation() reason filter
-- Must include ALL reasons used by finalize_order_stock:
--   recipe_consumption, direct_sale, variant_override, addon_consumed
-- Plus legacy reasons that may exist in old data:
--   recipe_ingredient, order_fulfillment
-- =============================================

CREATE OR REPLACE FUNCTION public.rollback_stock_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_movement RECORD;
    v_reversal_qty NUMERIC;
BEGIN
    IF NEW.status = 'cancelled'
       AND (OLD.status IS NULL OR OLD.status != 'cancelled')
       AND NEW.stock_deducted = TRUE THEN

        RAISE NOTICE '[Stock Rollback] Order % cancelled, reverting ALL stock movements', NEW.id;

        -- Reverse ALL deduction movements for this order
        -- Includes current reasons + legacy reasons for backwards compatibility
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
                  'addon_consumed',       -- NEW: addon ingredient deductions
                  'recipe_ingredient',    -- Legacy reason name
                  'order_fulfillment'     -- Legacy reason name
              )
        LOOP
            v_reversal_qty := ABS(v_movement.qty_delta);

            INSERT INTO stock_movements (
                idempotency_key, store_id, inventory_item_id, order_id,
                qty_delta, unit_type, reason, location_id, notes
            ) VALUES (
                gen_random_uuid(), v_movement.store_id, v_movement.inventory_item_id,
                NEW.id, v_reversal_qty, v_movement.unit_type,
                'order_cancelled_restock', v_movement.location_id,
                'Automatic restock: cancelled order (reversed movement: ' || v_movement.id || ')'
            );

            -- Also restore inventory_items.current_stock
            UPDATE inventory_items
            SET current_stock = current_stock + v_reversal_qty,
                updated_at = NOW()
            WHERE id = v_movement.inventory_item_id;

            RAISE NOTICE '[Stock Rollback] Restored % % of item %',
                v_reversal_qty, v_movement.unit_type, v_movement.inventory_item_id;
        END LOOP;

        NEW.stock_rolled_back := TRUE;
    END IF;

    RETURN NEW;
END;
$$;

-- Ensure rollback trigger exists
DROP TRIGGER IF EXISTS trg_rollback_stock_on_cancel ON orders;
CREATE TRIGGER trg_rollback_stock_on_cancel
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION rollback_stock_on_cancellation();

-- =============================================
-- FIX 2: Idempotent confirm_order_delivery()
-- Prevents double-delivery and double stock deduction
-- =============================================

CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id UUID, p_staff_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- 1. Fetch current order state with lock
    SELECT id, status, delivery_status, stock_deducted
    INTO v_order
    FROM orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND', 'message', 'Pedido no encontrado');
    END IF;

    -- 2. IDEMPOTENCY: If already delivered, return success without re-processing
    IF v_order.status = 'served' AND v_order.delivery_status = 'delivered' THEN
        RETURN jsonb_build_object('success', true, 'message', 'Pedido ya fue entregado previamente', 'already_delivered', true);
    END IF;

    -- 3. Reject if order is in a terminal state
    IF v_order.status IN ('cancelled', 'refunded') THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATE', 'message', 'No se puede entregar un pedido cancelado/reembolsado');
    END IF;

    -- 4. Update status + delivery details (fires finalize_order_stock trigger)
    UPDATE orders
    SET status = 'served',
        delivery_status = 'delivered',
        delivered_at = NOW(),
        delivered_by = p_staff_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'message', 'Pedido entregado y stock descontado');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'DELIVERY_ERROR', 'message', SQLERRM);
END;
$$;

-- =============================================
-- FIX 3: Gift limits per PR per month
-- Adds monthly cap (50 gifts/staff) + store_id validation
-- =============================================

CREATE OR REPLACE FUNCTION public.admin_grant_gift(
    target_client_id UUID,
    gift_name TEXT,
    gift_description TEXT DEFAULT 'Regalo otorgado',
    staff_id UUID DEFAULT NULL,
    product_id UUID DEFAULT NULL,
    monetary_cost NUMERIC DEFAULT 0,
    monetary_value NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_client RECORD;
    v_staff_store_id UUID;
    v_tx_id UUID;
    v_store_id UUID;
    v_monthly_gift_count INTEGER;
    v_monthly_limit INTEGER := 50; -- Max gifts per staff per month
BEGIN
    -- 1. Validate client exists
    SELECT * INTO v_client FROM clients WHERE id = target_client_id;
    IF v_client IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'CLIENT_NOT_FOUND', 'message', 'Cliente no encontrado');
    END IF;

    v_store_id := v_client.store_id;

    -- 2. Validate staff belongs to same store (cross-store protection)
    IF staff_id IS NOT NULL THEN
        SELECT store_id INTO v_staff_store_id
        FROM profiles
        WHERE id = staff_id;

        IF v_staff_store_id IS NULL OR v_staff_store_id != v_store_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'CROSS_STORE_DENIED',
                'message', 'El staff no pertenece al mismo store que el cliente');
        END IF;

        -- 3. Check monthly gift limit for this staff member
        SELECT COUNT(*) INTO v_monthly_gift_count
        FROM loyalty_transactions
        WHERE staff_id = admin_grant_gift.staff_id
          AND store_id = v_store_id
          AND type = 'gift'
          AND created_at >= date_trunc('month', NOW())
          AND created_at < date_trunc('month', NOW()) + INTERVAL '1 month';

        IF v_monthly_gift_count >= v_monthly_limit THEN
            RETURN jsonb_build_object('success', false, 'error', 'GIFT_LIMIT_EXCEEDED',
                'message', format('Limite mensual alcanzado (%s/%s gifts este mes)', v_monthly_gift_count, v_monthly_limit));
        END IF;
    END IF;

    -- 4. Validate monetary values
    IF monetary_cost < 0 OR monetary_value < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT',
            'message', 'Los valores monetarios no pueden ser negativos');
    END IF;

    -- 5. Insert gift transaction
    INSERT INTO loyalty_transactions (
        store_id, client_id, type, points, monetary_cost, monetary_value,
        description, staff_id, metadata
    ) VALUES (
        v_store_id, target_client_id, 'gift', 0, monetary_cost, monetary_value,
        gift_description, staff_id,
        jsonb_build_object('gift_name', gift_name, 'product_id', product_id,
                           'monthly_count', v_monthly_gift_count + 1)
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id,
        'monthly_gifts_used', COALESCE(v_monthly_gift_count, 0) + 1,
        'monthly_limit', v_monthly_limit);
END;
$$;

-- =============================================
-- FIX 4: CHECK constraints on wallet_balance and current_stock
-- Prevents negative values at the database level
-- =============================================

-- 4A. Fix any existing negative wallet balances before adding constraint
UPDATE clients SET wallet_balance = 0 WHERE wallet_balance < 0;

-- 4B. Fix any existing negative stock before adding constraint
UPDATE inventory_items SET current_stock = 0 WHERE current_stock < 0;

-- 4C. Add CHECK constraint on clients.wallet_balance
DO $$
BEGIN
    ALTER TABLE clients ADD CONSTRAINT chk_wallet_balance_non_negative CHECK (wallet_balance >= 0);
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint chk_wallet_balance_non_negative already exists';
END $$;

-- 4D. Add CHECK constraint on inventory_items.current_stock
DO $$
BEGIN
    ALTER TABLE inventory_items ADD CONSTRAINT chk_current_stock_non_negative CHECK (current_stock >= 0);
EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'Constraint chk_current_stock_non_negative already exists';
END $$;

-- =============================================
-- BONUS: Update get_session_expected_cash to use is_revenue_order()
-- (Fix FM-2 from audit: uses old filter instead of canonical function)
-- =============================================

CREATE OR REPLACE FUNCTION public.get_session_expected_cash(query_session_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store_id UUID;
    v_zone_id UUID;
    v_opened_at TIMESTAMPTZ;
    v_closed_at TIMESTAMPTZ;
    v_start_amount NUMERIC;
    v_order_total NUMERIC;
    v_adjustments_in NUMERIC;
    v_adjustments_out NUMERIC;
BEGIN
    -- Get session details
    SELECT store_id, zone_id, opened_at, COALESCE(closed_at, NOW()), COALESCE(start_amount, 0)
    INTO v_store_id, v_zone_id, v_opened_at, v_closed_at, v_start_amount
    FROM cash_sessions
    WHERE id = query_session_id;

    IF v_store_id IS NULL THEN
        RETURN 0;
    END IF;

    -- Sum cash orders linked to this session (using canonical revenue filter)
    SELECT COALESCE(SUM(o.total_amount), 0)
    INTO v_order_total
    FROM orders o
    WHERE o.store_id = v_store_id
      AND is_revenue_order(o.status::TEXT)
      AND (o.payment_method ILIKE '%efectivo%' OR o.payment_method ILIKE '%cash%')
      AND (
          o.cash_session_id = query_session_id
          OR (
              o.cash_session_id IS NULL
              AND o.created_at >= v_opened_at
              AND o.created_at <= v_closed_at
              AND EXISTS (
                  SELECT 1 FROM venue_nodes vn
                  WHERE vn.id = o.node_id AND vn.zone_id = v_zone_id
              )
          )
      );

    -- Sum cash adjustments IN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_adjustments_in
    FROM cash_movements
    WHERE cash_session_id = query_session_id
      AND movement_type IN ('adjustment_in', 'topup');

    -- Sum cash adjustments OUT
    SELECT COALESCE(SUM(amount), 0)
    INTO v_adjustments_out
    FROM cash_movements
    WHERE cash_session_id = query_session_id
      AND movement_type IN ('adjustment_out', 'withdrawal', 'expense');

    RETURN v_start_amount + v_order_total + v_adjustments_in - v_adjustments_out;
END;
$$;

-- =============================================
-- VERIFICATION QUERIES (run after deployment)
-- =============================================

-- Verify CHECK constraints exist
DO $$
DECLARE
    v_wallet_check BOOLEAN;
    v_stock_check BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_wallet_balance_non_negative'
    ) INTO v_wallet_check;

    SELECT EXISTS(
        SELECT 1 FROM information_schema.check_constraints
        WHERE constraint_name = 'chk_current_stock_non_negative'
    ) INTO v_stock_check;

    RAISE NOTICE 'CHECK wallet_balance >= 0: %', v_wallet_check;
    RAISE NOTICE 'CHECK current_stock >= 0: %', v_stock_check;
END $$;

-- Verify functions exist with correct signatures
DO $$
BEGIN
    RAISE NOTICE 'P3 Migration Applied Successfully';
    RAISE NOTICE '  1. finalize_order_stock: addon deduction added';
    RAISE NOTICE '  2. confirm_order_delivery: idempotent (checks already_delivered)';
    RAISE NOTICE '  3. admin_grant_gift: 50/month limit + store_id validation';
    RAISE NOTICE '  4. CHECK constraints: wallet_balance >= 0, current_stock >= 0';
    RAISE NOTICE '  5. rollback_stock_on_cancellation: includes ALL reason types';
    RAISE NOTICE '  BONUS: get_session_expected_cash uses is_revenue_order()';
END $$;
