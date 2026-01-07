-- RPC to complete wallet payment (bypasses RLS with SECURITY DEFINER)
-- This ensures the order update succeeds regardless of client permissions

CREATE OR REPLACE FUNCTION complete_wallet_payment(
  p_order_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_exists boolean;
BEGIN
  -- Check order exists
  SELECT EXISTS(SELECT 1 FROM orders WHERE id = p_order_id) INTO v_order_exists;
  
  IF NOT v_order_exists THEN
    RETURN json_build_object('success', false, 'message', 'Order not found');
  END IF;

  -- Update order to paid status
  UPDATE orders 
  SET 
    payment_status = 'approved',
    is_paid = true,
    status = CASE WHEN status = 'pending' THEN 'en preparación' ELSE status END,
    updated_at = now()
  WHERE id = p_order_id;
  
  RETURN json_build_object('success', true, 'message', 'Wallet payment completed');
END;
$$;
