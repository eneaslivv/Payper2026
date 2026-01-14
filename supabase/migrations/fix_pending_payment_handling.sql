-- Update verify_payment to handle pending/in_process statuses
-- This ensures that if a payment is found but not yet approved, the order status reflects that instead of saying "not found"

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
  
  IF v_order_status IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Order not found: ' || p_order_id::text);
  END IF;

  -- CASE 1: Payment Approved
  IF p_status = 'approved' THEN
      v_new_status := 'preparing'; -- Auto-advance to preparing if paid
      
      -- Update Order
      UPDATE orders 
      SET 
        payment_status = 'approved',
        is_paid = true,
        status = CASE WHEN status = 'pending' THEN v_new_status ELSE status END,
        payment_provider = 'mercadopago',
        updated_at = now()
      WHERE id = p_order_id;
      
      RETURN json_build_object('success', true, 'message', 'Order marked as paid', 'new_status', v_new_status);

  -- CASE 2: Payment Pending or In Process
  ELSIF p_status = 'pending' OR p_status = 'in_process' THEN
       -- Update Order to reflect pending payment
      UPDATE orders 
      SET 
        payment_status = p_status, -- 'pending' or 'in_process'
        is_paid = false,
        -- Do NOT advance order status yet, keep it as it was (likely 'pending')
        payment_provider = 'mercadopago',
        updated_at = now()
      WHERE id = p_order_id;

      RETURN json_build_object('success', true, 'message', 'Payment found but pending', 'status', p_status);

  -- CASE 3: Payment Rejected or Cancelled
  ELSE
       -- Update Order to reflect failure if needed, or just return unsuccessful
       -- Ideally we might want to log this but not cancel the order immediately to allow retry?
       -- For now, let's just return false but update payment_status if useful
      UPDATE orders 
      SET 
        payment_status = p_status,
        updated_at = now()
      WHERE id = p_order_id;

      RETURN json_build_object('success', false, 'message', 'Payment status: ' || p_status);
  END IF;
END;
$$;
