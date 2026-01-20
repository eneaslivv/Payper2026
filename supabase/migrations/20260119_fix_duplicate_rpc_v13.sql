-- FIX: Drop duplicate/legacy function signatures (V13)
-- Priority: Critical
-- Reason: Found TWO definitions of confirm_order_delivery.
-- 1. confirm_order_delivery(uuid, text) [LEGACY - DOES NOT UPDATE delivery_status]
-- 2. confirm_order_delivery(uuid, uuid) [NEW - Correct]
-- The legacy one is being called, causing "served" status but "pending" delivery_status (stuck UI).

-- 1. Drop ALL variants
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, uuid);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, text);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(text, text);

-- 2. Re-create Correct V12 Logic (UUID, UUID)
CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order_store_id UUID;
    v_status TEXT;
    v_is_paid BOOLEAN;
BEGIN
    SELECT status, is_paid, store_id
    INTO v_status, v_is_paid, v_order_store_id
    FROM orders WHERE id = p_order_id FOR UPDATE;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado');
    END IF;
    
    -- Force BOTH statuses to 'delivered'/'served'
    UPDATE orders SET 
        status = 'served',             
        delivery_status = 'delivered', 
        delivered_at = NOW(),
        delivered_by = p_staff_id,
        updated_at = NOW()
    WHERE id = p_order_id;
    
    -- The trigger trg_finalize_stock will run here automatically

    RETURN jsonb_build_object('success', true, 'message', 'Orden entregada correctamente');
END;
$function$;

-- 3. Also create a TEXT override just in case the frontend sends string, but internally cast to UUID
--    This ensures legacy calls don't fail, but route to the NEW logic.
CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id uuid, p_staff_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Cast string to UUID (handle empty/null)
    RETURN public.confirm_order_delivery(
        p_order_id, 
        CASE WHEN p_staff_id = '' THEN NULL ELSE p_staff_id::uuid END
    );
EXCEPTION WHEN OTHERS THEN
    -- Fallback for invalid UUID string
    RETURN public.confirm_order_delivery(p_order_id, NULL::uuid);
END;
$function$;

-- 4. Manual Fix for the specific stuck order (c9f34a9a...)
UPDATE orders 
SET delivery_status = 'delivered', status = 'served' 
WHERE id = 'c9f34a9a-325c-4260-8548-a16571f9b94e';
