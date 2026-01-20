-- =============================================
-- REDEEM POINTS RPC
-- Secure function to handle loyalty point redemption
-- =============================================

CREATE OR REPLACE FUNCTION redeem_points(p_reward_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with privileges of the creator (to update profiles/transactions)
AS $$
DECLARE
    v_user_id UUID;
    v_reward RECORD;
    v_current_points INTEGER;
    v_new_balance INTEGER;
BEGIN
    -- 1. Get current Authenticated User
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Fetch Reward Details
    SELECT * INTO v_reward
    FROM loyalty_rewards
    WHERE id = p_reward_id AND is_active = true;

    IF v_reward.id IS NULL THEN
        RAISE EXCEPTION 'Reward not found or inactive';
    END IF;

    -- 3. Check User Balance (Lock row for update to prevent race conditions)
    SELECT points_balance INTO v_current_points
    FROM profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF v_current_points IS NULL THEN
        v_current_points := 0;
    END IF;

    IF v_current_points < v_reward.points THEN
        RAISE EXCEPTION 'Insufficient points (Balance: %, Required: %)', v_current_points, v_reward.points;
    END IF;

    -- 4. Deduct Points from Profile
    v_new_balance := v_current_points - v_reward.points;

    UPDATE profiles
    SET points_balance = v_new_balance
    WHERE id = v_user_id;

    -- 5. Log Transaction
    INSERT INTO loyalty_transactions (
        store_id,
        client_id,
        type,
        points,
        description
    ) VALUES (
        v_reward.store_id,
        v_user_id,
        'redeem',
        -v_reward.points, -- Negative value for redemption
        'Canje: ' || v_reward.name
    );

    -- 6. Return Success & New Balance
    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'message', 'Redemption successful',
        'reward_name', v_reward.name
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION redeem_points(UUID) TO authenticated;
