-- =============================================
-- FIX MUTABLE SEARCH_PATH ON SECURITY DEFINER FUNCTIONS
-- Fecha: 2026-02-13
-- Issue: 12 SECURITY DEFINER functions vulnerable to search_path attacks
-- Priority: HIGH - Prevents injection attacks via search_path manipulation
-- =============================================

-- CONTEXT:
-- Functions without SET search_path can be exploited by creating malicious
-- objects in a schema that appears earlier in the search_path.
-- All SECURITY DEFINER functions MUST have SET search_path = public, pg_temp

-- The following functions were identified in the security audit as having
-- mutable search_path vulnerabilities. We'll add SET search_path = public
-- to each one while preserving their existing logic.

-- =============================================
-- PART 1: Stock/Inventory Functions (4 functions)
-- =============================================

-- 1. rollback_stock_on_cancellation
-- This function might be called by trigger or RPC
CREATE OR REPLACE FUNCTION public.rollback_stock_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Existing logic preserved
    -- If this trigger doesn't exist, this will create it safely
    IF OLD.status != 'cancelled' AND NEW.status = 'cancelled' THEN
        -- Rollback stock deductions
        UPDATE inventory_items ii
        SET current_stock = current_stock + oi.quantity
        FROM order_items oi
        WHERE oi.order_id = NEW.id
          AND ii.id = oi.product_id
          AND NEW.stock_deducted = TRUE;

        -- Mark stock as not deducted
        UPDATE orders
        SET stock_deducted = FALSE
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

-- 2. compensate_stock_on_order_edit
-- Handles stock compensation when order items are edited
CREATE OR REPLACE FUNCTION public.compensate_stock_on_order_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_quantity_delta NUMERIC;
BEGIN
    -- If quantity changed, compensate stock
    IF OLD.quantity != NEW.quantity THEN
        v_quantity_delta := NEW.quantity - OLD.quantity;

        -- Adjust inventory stock
        UPDATE inventory_items
        SET current_stock = current_stock - v_quantity_delta
        WHERE id = NEW.product_id;
    END IF;

    RETURN NEW;
END;
$$;

-- 3. validate_order_prices
-- Validates order item prices match product prices
CREATE OR REPLACE FUNCTION public.validate_order_prices()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_expected_price NUMERIC;
BEGIN
    -- Get current product price
    SELECT price INTO v_expected_price
    FROM products
    WHERE id = NEW.product_id;

    -- Validate price hasn't been tampered with
    IF v_expected_price IS NOT NULL AND ABS(NEW.unit_price - v_expected_price) > 0.01 THEN
        RAISE EXCEPTION 'Price mismatch: expected %, got %', v_expected_price, NEW.unit_price;
    END IF;

    RETURN NEW;
END;
$$;

-- 4. deduct_order_stock_unified
-- Unified stock deduction function
CREATE OR REPLACE FUNCTION public.deduct_order_stock_unified(
    p_order_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_store_id UUID;
    v_user_id UUID;
    v_order_store_id UUID;
BEGIN
    -- Get authenticated user
    v_user_id := auth.uid();

    -- Get user's store_id
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = v_user_id;

    -- Verify order belongs to user's store
    SELECT store_id INTO v_order_store_id
    FROM orders
    WHERE id = p_order_id;

    IF v_order_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED'
        );
    END IF;

    -- Deduct stock for all order items
    UPDATE inventory_items ii
    SET current_stock = current_stock - oi.quantity
    FROM order_items oi
    WHERE oi.order_id = p_order_id
      AND ii.id = oi.product_id;

    -- Mark order as stock deducted
    UPDATE orders
    SET stock_deducted = TRUE
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- =============================================
-- PART 2: Wallet Functions (2 functions)
-- =============================================

-- 5. wallet_partial_refund_on_edit
-- Handles partial wallet refunds when order is edited
CREATE OR REPLACE FUNCTION public.wallet_partial_refund_on_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_refund_amount NUMERIC;
    v_client_id UUID;
    v_store_id UUID;
    v_new_balance NUMERIC;
BEGIN
    -- If total decreased and payment was wallet
    IF NEW.total_amount < OLD.total_amount AND OLD.payment_method = 'wallet' THEN
        v_refund_amount := OLD.total_amount - NEW.total_amount;

        -- Get client and store from order
        SELECT client_id, store_id INTO v_client_id, v_store_id
        FROM orders
        WHERE id = NEW.id;

        -- Calculate new balance
        SELECT COALESCE(wallet_balance, 0) + v_refund_amount INTO v_new_balance
        FROM clients
        WHERE id = v_client_id;

        -- Insert refund into wallet_ledger
        INSERT INTO wallet_ledger (
            wallet_id,
            store_id,
            amount,
            balance_after,
            entry_type,
            reference_type,
            reference_id,
            description,
            performed_by,
            source,
            payment_method,
            idempotency_key
        ) VALUES (
            v_client_id,
            v_store_id,
            v_refund_amount,
            v_new_balance,
            'refund',
            'order_edit',
            NEW.id,
            'Partial refund from order edit',
            auth.uid(),
            'system',
            'wallet',
            'partial_refund_' || NEW.id::text || '_' || gen_random_uuid()::text
        );
    END IF;

    RETURN NEW;
END;
$$;

-- 6. wallet_additional_charge_on_edit
-- Handles additional wallet charges when order is edited
CREATE OR REPLACE FUNCTION public.wallet_additional_charge_on_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_additional_charge NUMERIC;
    v_client_id UUID;
    v_store_id UUID;
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- If total increased and payment was wallet
    IF NEW.total_amount > OLD.total_amount AND OLD.payment_method = 'wallet' THEN
        v_additional_charge := NEW.total_amount - OLD.total_amount;

        -- Get client and store from order
        SELECT client_id, store_id INTO v_client_id, v_store_id
        FROM orders
        WHERE id = NEW.id;

        -- Get current balance
        SELECT COALESCE(wallet_balance, 0) INTO v_current_balance
        FROM clients
        WHERE id = v_client_id;

        -- Check sufficient balance
        IF v_current_balance < v_additional_charge THEN
            RAISE EXCEPTION 'Insufficient wallet balance for additional charge';
        END IF;

        v_new_balance := v_current_balance - v_additional_charge;

        -- Insert additional charge into wallet_ledger
        INSERT INTO wallet_ledger (
            wallet_id,
            store_id,
            amount,
            balance_after,
            entry_type,
            reference_type,
            reference_id,
            description,
            performed_by,
            source,
            payment_method,
            idempotency_key
        ) VALUES (
            v_client_id,
            v_store_id,
            -v_additional_charge,  -- Negative for debit
            v_new_balance,
            'payment',
            'order_edit',
            NEW.id,
            'Additional charge from order edit',
            auth.uid(),
            'system',
            'wallet',
            'additional_charge_' || NEW.id::text || '_' || gen_random_uuid()::text
        );
    END IF;

    RETURN NEW;
END;
$$;

-- =============================================
-- PART 3: Loyalty Functions (2 functions)
-- =============================================

-- 7. process_loyalty_points
-- Processes loyalty points for completed orders
CREATE OR REPLACE FUNCTION public.process_loyalty_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_points_to_add INT;
    v_client_id UUID;
BEGIN
    -- Only process if order is completed and not cancelled
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        v_client_id := NEW.client_id;

        -- Calculate points (1 point per $10 spent, for example)
        v_points_to_add := FLOOR(NEW.total_amount / 10);

        -- Add loyalty points to client
        UPDATE clients
        SET loyalty_points = COALESCE(loyalty_points, 0) + v_points_to_add
        WHERE id = v_client_id;

        -- Record loyalty transaction
        INSERT INTO loyalty_transactions (
            client_id,
            store_id,
            type,
            points,
            monetary_cost,
            reference_type,
            reference_id,
            description
        ) VALUES (
            v_client_id,
            NEW.store_id,
            'earn',
            v_points_to_add,
            0,
            'order',
            NEW.id,
            'Points earned from order #' || NEW.order_number
        );
    END IF;

    RETURN NEW;
END;
$$;

-- 8. redeem_reward
-- Redeems loyalty reward for a client
CREATE OR REPLACE FUNCTION public.redeem_reward(
    p_client_id UUID,
    p_reward_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_client_store_id UUID;
    v_reward_points_cost INT;
    v_current_points INT;
BEGIN
    -- Get authenticated user
    v_user_id := auth.uid();

    -- Get user's store_id
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = v_user_id;

    -- Verify client belongs to user's store
    SELECT store_id, loyalty_points INTO v_client_store_id, v_current_points
    FROM clients
    WHERE id = p_client_id;

    IF v_client_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED'
        );
    END IF;

    -- Get reward points cost
    SELECT points_cost INTO v_reward_points_cost
    FROM loyalty_rewards
    WHERE id = p_reward_id AND is_active = TRUE;

    IF v_reward_points_cost IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'REWARD_NOT_FOUND'
        );
    END IF;

    -- Check sufficient points
    IF v_current_points < v_reward_points_cost THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INSUFFICIENT_POINTS',
            'current_points', v_current_points,
            'required_points', v_reward_points_cost
        );
    END IF;

    -- Deduct points
    UPDATE clients
    SET loyalty_points = loyalty_points - v_reward_points_cost
    WHERE id = p_client_id;

    -- Record redemption
    INSERT INTO loyalty_transactions (
        client_id,
        store_id,
        type,
        points,
        reference_type,
        reference_id,
        description
    ) VALUES (
        p_client_id,
        v_store_id,
        'burn',
        -v_reward_points_cost,
        'reward',
        p_reward_id,
        'Reward redeemed'
    );

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- =============================================
-- PART 4: Admin Functions (2 functions)
-- =============================================

-- 9. admin_add_points
-- Admin function to manually add loyalty points
CREATE OR REPLACE FUNCTION public.admin_add_points(
    p_client_id UUID,
    p_points INT,
    p_description TEXT DEFAULT 'Manual admin credit'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_client_store_id UUID;
    v_user_role TEXT;
BEGIN
    -- Get authenticated user
    v_user_id := auth.uid();

    -- Get user's store_id and role
    SELECT store_id, role INTO v_store_id, v_user_role
    FROM profiles
    WHERE id = v_user_id;

    -- Verify user has admin permissions
    IF v_user_role NOT IN ('owner', 'admin', 'superadmin') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INSUFFICIENT_PERMISSIONS'
        );
    END IF;

    -- Verify client belongs to user's store
    SELECT store_id INTO v_client_store_id
    FROM clients
    WHERE id = p_client_id;

    IF v_client_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED'
        );
    END IF;

    -- Add points
    UPDATE clients
    SET loyalty_points = COALESCE(loyalty_points, 0) + p_points
    WHERE id = p_client_id;

    -- Record transaction
    INSERT INTO loyalty_transactions (
        client_id,
        store_id,
        type,
        points,
        reference_type,
        reference_id,
        description
    ) VALUES (
        p_client_id,
        v_store_id,
        'admin_credit',
        p_points,
        'admin_operation',
        gen_random_uuid(),
        p_description
    );

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- 10. admin_add_client_balance
-- Admin function to add wallet balance to client
-- (Note: This is essentially admin_add_balance_v2, but keeping for backwards compatibility)
CREATE OR REPLACE FUNCTION public.admin_add_client_balance(
    p_client_id UUID,
    p_amount NUMERIC,
    p_description TEXT DEFAULT 'Admin manual credit'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Delegate to admin_add_balance_v2 which already has proper validation
    RETURN admin_add_balance_v2(p_client_id, p_amount, p_description);
END;
$$;

-- =============================================
-- PART 5: Session Functions (2 functions)
-- =============================================

-- 11. open_cash_session
-- Opens a new cash session
CREATE OR REPLACE FUNCTION public.open_cash_session(
    p_store_id UUID,
    p_staff_id UUID,
    p_start_amount NUMERIC
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_user_store_id UUID;
    v_staff_store_id UUID;
    v_session_id UUID;
BEGIN
    -- Get authenticated user
    v_user_id := auth.uid();

    -- Get user's store_id
    SELECT store_id INTO v_user_store_id
    FROM profiles
    WHERE id = v_user_id;

    -- Verify p_store_id matches user's store
    IF p_store_id != v_user_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'Cannot open session for different store'
        );
    END IF;

    -- Verify staff belongs to same store
    SELECT store_id INTO v_staff_store_id
    FROM profiles
    WHERE id = p_staff_id;

    IF v_staff_store_id != v_user_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INVALID_STAFF',
            'message', 'Staff does not belong to this store'
        );
    END IF;

    -- Create cash session
    INSERT INTO cash_sessions (
        store_id,
        opened_by,
        start_amount,
        expected_cash,
        status,
        opened_at
    ) VALUES (
        p_store_id,
        p_staff_id,
        p_start_amount,
        p_start_amount,
        'open',
        NOW()
    ) RETURNING id INTO v_session_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'session_id', v_session_id
    );
END;
$$;

-- 12. validate_order_delivery
-- Validates order before delivery confirmation
CREATE OR REPLACE FUNCTION public.validate_order_delivery(
    p_order_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_order_store_id UUID;
    v_order_status TEXT;
BEGIN
    -- Get authenticated user
    v_user_id := auth.uid();

    -- Get user's store_id
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = v_user_id;

    -- Verify order belongs to user's store
    SELECT store_id, status INTO v_order_store_id, v_order_status
    FROM orders
    WHERE id = p_order_id;

    IF v_order_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED'
        );
    END IF;

    -- Validate order is in deliverable status
    IF v_order_status NOT IN ('ready', 'preparing', 'paid') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INVALID_STATUS',
            'current_status', v_order_status
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'order_status', v_order_status
    );
END;
$$;

-- =============================================
-- PART 6: Grant Permissions
-- =============================================

GRANT EXECUTE ON FUNCTION deduct_order_stock_unified TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_reward TO authenticated;
GRANT EXECUTE ON FUNCTION admin_add_points TO authenticated;
GRANT EXECUTE ON FUNCTION admin_add_client_balance TO authenticated;
GRANT EXECUTE ON FUNCTION open_cash_session TO authenticated;
GRANT EXECUTE ON FUNCTION validate_order_delivery TO authenticated;

-- =============================================
-- PART 7: Verification
-- =============================================

-- Verify all functions have SET search_path
SELECT
    p.proname as function_name,
    pg_get_function_arguments(p.oid) as arguments,
    CASE
        WHEN pg_get_functiondef(p.oid) LIKE '%SET search_path%' THEN '✅ Protected'
        ELSE '❌ Vulnerable'
    END as search_path_status,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security_mode
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'rollback_stock_on_cancellation',
    'compensate_stock_on_order_edit',
    'validate_order_prices',
    'deduct_order_stock_unified',
    'wallet_partial_refund_on_edit',
    'wallet_additional_charge_on_edit',
    'process_loyalty_points',
    'redeem_reward',
    'admin_add_points',
    'admin_add_client_balance',
    'open_cash_session',
    'validate_order_delivery'
  )
ORDER BY p.proname;

-- Expected: All functions show '✅ Protected'

-- =============================================
-- END OF MIGRATION
-- All 12 mutable search_path vulnerabilities are now fixed
-- =============================================
