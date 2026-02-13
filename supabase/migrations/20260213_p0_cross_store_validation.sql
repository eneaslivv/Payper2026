-- =============================================
-- CRITICAL P0: Horizontal Privilege Escalation Prevention
-- Date: 2026-02-13
-- Security: Prevent cross-store operations
-- =============================================

-- Helper function to get client's store_id
CREATE OR REPLACE FUNCTION get_client_store_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_store_id UUID;
BEGIN
    SELECT store_id INTO v_store_id
    FROM clients
    WHERE auth_user_id = auth.uid();

    RETURN v_store_id;
END;
$$;

-- Update pay_with_wallet to validate cross-store
CREATE OR REPLACE FUNCTION public.pay_with_wallet(p_client_id uuid, p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id UUID;
    v_client_store_id UUID;
    v_target_client_store_id UUID;
    v_new_balance NUMERIC;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UNAUTHORIZED',
            'message', 'User not authenticated'
        );
    END IF;

    -- Get authenticated client's store
    SELECT store_id INTO v_client_store_id
    FROM clients
    WHERE auth_user_id = v_user_id;

    IF v_client_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CLIENT_NOT_FOUND',
            'message', 'Client record not found'
        );
    END IF;

    -- Get target client's store
    SELECT store_id INTO v_target_client_store_id
    FROM clients
    WHERE id = p_client_id;

    -- CRITICAL: Prevent cross-store wallet operations
    IF v_client_store_id != v_target_client_store_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PERMISSION_DENIED',
            'message', 'Cross-store wallet operation not allowed'
        );
    END IF;

    -- CRITICAL: Atomic conditional UPDATE prevents TOCTOU race
    UPDATE clients
    SET wallet_balance = wallet_balance - p_amount
    WHERE id = p_client_id
      AND wallet_balance >= p_amount
    RETURNING wallet_balance INTO v_new_balance;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_BALANCE',
            'message', 'Insufficient wallet balance'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Wallet debited successfully',
        'new_balance', v_new_balance
    );
END;
$$;

-- Update redeem_points to add idempotency and cross-store validation
CREATE OR REPLACE FUNCTION public.redeem_points(p_reward_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id UUID;
    v_client_id UUID;
    v_client_store_id UUID;
    v_reward RECORD;
    v_current_points INTEGER;
    v_idempotency_key TEXT;
BEGIN
    v_user_id := auth.uid();

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'UNAUTHORIZED',
            'message', 'User not authenticated'
        );
    END IF;

    -- Get client and their store
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

    -- Get reward details
    SELECT id, store_id, name, points_cost INTO v_reward
    FROM loyalty_rewards
    WHERE id = p_reward_id
      AND active = true;

    IF v_reward IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'REWARD_NOT_FOUND',
            'message', 'Reward not found or inactive'
        );
    END IF;

    -- CRITICAL: Validate same store
    IF v_client_store_id != v_reward.store_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PERMISSION_DENIED',
            'message', 'Cannot redeem reward from different store'
        );
    END IF;

    -- Check points with row lock
    SELECT loyalty_points INTO v_current_points
    FROM clients
    WHERE id = v_client_id
    FOR UPDATE NOWAIT;

    IF v_current_points < v_reward.points_cost THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_POINTS',
            'message', 'Insufficient loyalty points'
        );
    END IF;

    -- Generate idempotency key
    v_idempotency_key := 'redeem_' || p_reward_id || '_' || v_user_id;

    -- Deduct points atomically
    UPDATE clients
    SET loyalty_points = loyalty_points - v_reward.points_cost
    WHERE id = v_client_id;

    -- Create transaction with idempotency
    BEGIN
        INSERT INTO loyalty_transactions (
            store_id,
            client_id,
            type,
            points,
            description,
            idempotency_key,
            created_at
        ) VALUES (
            v_reward.store_id,
            v_client_id,
            'burn',
            -v_reward.points_cost,
            'Canje: ' || v_reward.name,
            v_idempotency_key,
            NOW()
        );
    EXCEPTION
        WHEN unique_violation THEN
            -- Rollback points deduction
            UPDATE clients
            SET loyalty_points = loyalty_points + v_reward.points_cost
            WHERE id = v_client_id;

            RETURN jsonb_build_object(
                'success', false,
                'error', 'ALREADY_REDEEMED',
                'message', 'This reward was already redeemed'
            );
    END;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Reward redeemed successfully',
        'remaining_points', v_current_points - v_reward.points_cost
    );
END;
$$;

-- Add idempotency_key column to loyalty_transactions if not exists
ALTER TABLE loyalty_transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Create unique index for redemption idempotency
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_loyalty_transactions_idempotency
ON loyalty_transactions(idempotency_key)
WHERE idempotency_key IS NOT NULL;

COMMENT ON FUNCTION get_client_store_id IS 'Helper to get authenticated client store_id';
COMMENT ON FUNCTION pay_with_wallet IS 'Pay with wallet with cross-store validation and atomic balance update';
COMMENT ON FUNCTION redeem_points IS 'Redeem loyalty points with idempotency and cross-store validation';

GRANT EXECUTE ON FUNCTION get_client_store_id TO authenticated;
GRANT EXECUTE ON FUNCTION pay_with_wallet TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_points TO authenticated;

-- Verify constraints
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_loyalty_transactions_idempotency'
    ) THEN
        RAISE NOTICE 'Loyalty idempotency constraint created successfully';
    ELSE
        RAISE WARNING 'Loyalty idempotency constraint creation failed';
    END IF;
END $$;
