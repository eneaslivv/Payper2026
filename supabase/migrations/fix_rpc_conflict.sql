-- EMERGENCY FIX: Resolve RPC Conflict AND Fix Delivery Status Update
-- Drop ALL potential variations of conflicting functions to be safe
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, uuid);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, text);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(text, text);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid);

-- Recreate the single, canonical version
CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id UUID, p_staff_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_exists BOOLEAN;
BEGIN
    -- 1. Check if order exists
    SELECT EXISTS(SELECT 1 FROM orders WHERE id = p_order_id) INTO v_order_exists;
    
    IF NOT v_order_exists THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado');
    END IF;

    -- 2. Update Status AND Delivery Details
    -- This fires the finalize_order_stock trigger
    UPDATE orders 
    SET status = 'served',
        delivery_status = 'delivered',     -- CRITICAL: Needed for UI and some triggers
        delivered_at = NOW(),              -- CRITICAL: Audit trail
        delivered_by = p_staff_id,         -- CRITICAL: Audit trail
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 3. Return Success
    RETURN jsonb_build_object('success', true, 'message', 'Pedido entregado y stock descontado');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
