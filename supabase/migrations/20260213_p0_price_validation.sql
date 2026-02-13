-- =============================================
-- CRITICAL P0: Price Validation from Source of Truth
-- Date: 2026-02-13
-- Security: Prevent price manipulation attacks
-- =============================================

-- Function to validate and recalculate order total from DB source of truth
CREATE OR REPLACE FUNCTION public.validate_order_total(p_order_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_calculated_total NUMERIC := 0;
    v_item RECORD;
    v_product_price NUMERIC;
    v_store_id UUID;
    v_order_total NUMERIC;
BEGIN
    -- Get store_id and declared total
    SELECT store_id, total_amount INTO v_store_id, v_order_total
    FROM orders
    WHERE id = p_order_id;

    IF v_store_id IS NULL THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Order % does not exist', p_order_id;
    END IF;

    -- Validate each order item against actual product price
    FOR v_item IN
        SELECT product_id, quantity, unit_price
        FROM order_items
        WHERE order_id = p_order_id
    LOOP
        -- Get ACTUAL price from products table (source of truth)
        SELECT price INTO v_product_price
        FROM products
        WHERE id = v_item.product_id
          AND store_id = v_store_id
          AND active = true;

        IF v_product_price IS NULL THEN
            RAISE EXCEPTION 'INVALID_PRODUCT: Product % not found or inactive', v_item.product_id;
        END IF;

        -- Validate client didn't send fake unit_price
        IF ABS(v_item.unit_price - v_product_price) > 0.01 THEN
            RAISE EXCEPTION 'PRICE_MANIPULATION: Product % expected $%, got $%',
                v_item.product_id, v_product_price, v_item.unit_price;
        END IF;

        v_calculated_total := v_calculated_total + (v_product_price * v_item.quantity);
    END LOOP;

    -- TODO: Add tax, discounts, addons validation here
    -- For now, just validate base product total

    RETURN v_calculated_total;
END;
$$;

-- Update complete_wallet_payment to validate prices
CREATE OR REPLACE FUNCTION public.complete_wallet_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id UUID;
    v_client_id UUID;
    v_client_store_id UUID;
    v_order_store_id UUID;
    v_total_amount NUMERIC;
    v_calculated_total NUMERIC;
    v_current_balance NUMERIC;
BEGIN
    -- Get authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UNAUTHORIZED',
            'message', 'User not authenticated'
        );
    END IF;

    -- Get client record
    SELECT id, store_id INTO v_client_id, v_client_store_id
    FROM clients
    WHERE auth_user_id = v_user_id;

    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CLIENT_NOT_FOUND',
            'message', 'Client record not found'
        );
    END IF;

    -- Get order details and validate same store (prevent horizontal escalation)
    SELECT store_id, total_amount INTO v_order_store_id, v_total_amount
    FROM orders
    WHERE id = p_order_id;

    IF v_order_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ORDER_NOT_FOUND',
            'message', 'Order not found'
        );
    END IF;

    -- CRITICAL: Validate client is operating on their own store's order
    IF v_client_store_id != v_order_store_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PERMISSION_DENIED',
            'message', 'Cross-store operation not allowed'
        );
    END IF;

    -- CRITICAL: Validate total amount matches actual product prices
    BEGIN
        v_calculated_total := validate_order_total(p_order_id);
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLSTATE,
            'message', SQLERRM
        );
    END;

    IF ABS(v_calculated_total - v_total_amount) > 0.01 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PRICE_MISMATCH',
            'message', format('Expected total $%s but got $%s', v_calculated_total, v_total_amount)
        );
    END IF;

    -- CRITICAL: Atomic wallet debit with conditional update (prevents TOCTOU race)
    UPDATE clients
    SET wallet_balance = wallet_balance - v_total_amount
    WHERE id = v_client_id
      AND wallet_balance >= v_total_amount
    RETURNING wallet_balance INTO v_current_balance;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_BALANCE',
            'message', 'Insufficient wallet balance'
        );
    END IF;

    -- Update order status
    UPDATE orders
    SET
        payment_status = 'approved',
        payment_method = 'wallet',
        paid_at = NOW(),
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Create ledger entry
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        amount,
        balance_after,
        entry_type,
        payment_method,
        description,
        source,
        reference_type,
        reference_id,
        performed_by,
        idempotency_key
    ) VALUES (
        v_client_id,
        v_client_store_id,
        -v_total_amount,
        v_current_balance,
        'payment',
        'wallet',
        'Order payment #' || p_order_id,
        'app',
        'order',
        p_order_id,
        v_user_id,
        'order_payment_' || p_order_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Payment completed successfully',
        'new_balance', v_current_balance
    );
END;
$$;

COMMENT ON FUNCTION validate_order_total IS 'Validates order total by recalculating from products table (source of truth)';
COMMENT ON FUNCTION complete_wallet_payment IS 'Complete wallet payment with price validation and atomic balance update';

GRANT EXECUTE ON FUNCTION validate_order_total TO authenticated;
GRANT EXECUTE ON FUNCTION complete_wallet_payment TO authenticated;
