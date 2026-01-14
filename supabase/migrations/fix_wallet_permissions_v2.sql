-- CORRECTED GRANT MIGRATION
-- The previous one failed because we missed the optional 3rd argument in the signature.

-- pay_with_wallet has 3 arguments: (client_id, amount, order_id)
GRANT EXECUTE ON FUNCTION pay_with_wallet(UUID, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION pay_with_wallet(UUID, NUMERIC, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION pay_with_wallet(UUID, NUMERIC, UUID) TO anon;

-- complete_wallet_payment has 1 argument: (order_id)
GRANT EXECUTE ON FUNCTION complete_wallet_payment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_wallet_payment(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION complete_wallet_payment(UUID) TO anon;

-- redeem_reward has 3 arguments: (client_id, reward_id, order_id)
GRANT EXECUTE ON FUNCTION redeem_reward(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_reward(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION redeem_reward(UUID, UUID, UUID) TO anon;

-- rollback_redemption has 1 argument: (order_id)
GRANT EXECUTE ON FUNCTION rollback_redemption(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rollback_redemption(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rollback_redemption(UUID) TO anon;
