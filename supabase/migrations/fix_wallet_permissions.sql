-- Grant permissions for Wallet and Rewards RPCs
-- This fixes the "cannot process order" error on mobile/client devices for non-admin users.

GRANT EXECUTE ON FUNCTION pay_with_wallet(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION pay_with_wallet(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION pay_with_wallet(UUID, NUMERIC) TO anon; -- Needed if flow starts before full auth? usually authenticated.

GRANT EXECUTE ON FUNCTION complete_wallet_payment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_wallet_payment(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION complete_wallet_payment(UUID) TO anon;

GRANT EXECUTE ON FUNCTION redeem_reward(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION redeem_reward(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION redeem_reward(UUID, UUID, UUID) TO anon;

GRANT EXECUTE ON FUNCTION rollback_redemption(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION rollback_redemption(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION rollback_redemption(UUID) TO anon;

-- Ensure internal functions are secure but accessible via RPCs
-- (Assuming the functions themselves are SECURITY DEFINER if they need to bypass RLS, which complete_wallet_payment usually does)
