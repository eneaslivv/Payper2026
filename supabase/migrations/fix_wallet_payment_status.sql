-- FIX: Wallet Payment Status Auto-Advance
-- Update complete_wallet_payment to set status='received' so it shows as Active/Paid immediately.

CREATE OR REPLACE FUNCTION public.complete_wallet_payment(p_order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  UPDATE orders 
  SET 
    payment_status = 'approved',
    is_paid = true,
    status = 'received', -- Auto-advance from 'pending' to 'received'
    updated_at = now()
  WHERE id = p_order_id;
  
  RETURN json_build_object('success', true, 'message', 'Wallet payment completed');
END;
$function$;
