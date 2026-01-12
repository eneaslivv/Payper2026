-- Function to verify market payment and update order status
-- Called by verify-payment-status Edge Function

CREATE OR REPLACE FUNCTION verify_payment(
  p_mp_payment_id text,
  p_order_id uuid,
  p_amount numeric,
  p_status text,
  p_status_detail text,
  p_payment_method text,
  p_payment_type text,
  p_payer_email text,
  p_date_approved text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_status text;
  v_new_status text;
BEGIN
  -- Get current order status
  SELECT status INTO v_order_status FROM orders WHERE id = p_order_id;

  IF p_status = 'approved' THEN
      v_new_status := 'preparing'; -- Auto-advance to preparing if paid
      
      -- Update Order
      UPDATE orders 
      SET 
        payment_status = 'approved',
        is_paid = true,
        status = CASE WHEN status = 'pending' THEN v_new_status ELSE status END, -- Only advance if pending
        payment_provider = 'mercadopago',
        updated_at = now()
      WHERE id = p_order_id;
      
      RETURN json_build_object('success', true, 'message', 'Order marked as paid', 'new_status', v_new_status);
  ELSE
      RETURN json_build_object('success', false, 'message', 'Payment not approved');
  END IF;
END;
$$;
