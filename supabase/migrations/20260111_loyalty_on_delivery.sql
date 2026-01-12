-- =============================================
-- LOYALTY POINTS ON DELIVERY TRIGGER
-- Complementa loyalty_engine.sql
-- Otorga puntos cuando el status cambia a 'Entregado'
-- (Para pedidos del POS que no usan payment_status)
-- =============================================

-- ============================================
-- TRIGGER FUNCTION: EARN ON DELIVERY
-- Solo procesa si el status cambia A 'Entregado'
-- y el pedido tiene cliente y está pagado
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_process_loyalty_on_delivery()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_points_earned INTEGER;
    v_current_balance INTEGER;
    v_existing_tx UUID;
BEGIN
    -- STRICT: Solo si status cambia A 'Entregado' desde algo diferente
    IF NEW.status = 'Entregado' AND (OLD.status IS DISTINCT FROM 'Entregado') THEN
       
       -- Skip si no hay cliente asociado
       IF NEW.client_id IS NULL THEN RETURN NEW; END IF;
       
       -- Skip si el pedido no está pagado
       IF NOT COALESCE(NEW.is_paid, false) AND NEW.payment_status != 'approved' THEN 
           RETURN NEW; 
       END IF;

       -- Check si ya existe un earn transaction para esta orden (idempotencia)
       SELECT id INTO v_existing_tx 
       FROM public.loyalty_transactions 
       WHERE order_id = NEW.id AND type = 'earn' AND is_rolled_back = false;
       
       IF v_existing_tx IS NOT NULL THEN
           -- Ya se procesaron los puntos (por payment_status trigger)
           RETURN NEW;
       END IF;

       v_points_earned := public.calculate_order_points(NEW.id);
       IF v_points_earned <= 0 THEN RETURN NEW; END IF;

       SELECT COALESCE(loyalty_points, 0) INTO v_current_balance 
       FROM public.clients WHERE id = NEW.client_id;

       -- Idempotent Insert (UNIQUE index prevents duplicates)
       INSERT INTO public.loyalty_transactions (
           store_id, client_id, order_id, type, points, description
       ) VALUES (
           NEW.store_id, 
           NEW.client_id, 
           NEW.id, 
           'earn', 
           v_points_earned, 
           'Puntos por compra entregada #' || LEFT(NEW.id::text, 8)
       )
       ON CONFLICT DO NOTHING;

       -- Only update balance if insert succeeded
       IF FOUND THEN
           UPDATE public.clients 
           SET loyalty_points = COALESCE(loyalty_points, 0) + v_points_earned 
           WHERE id = NEW.client_id;
       END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- Create trigger on status change
DROP TRIGGER IF EXISTS on_order_delivered_loyalty ON public.orders;
CREATE TRIGGER on_order_delivered_loyalty
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_process_loyalty_on_delivery();

-- ============================================
-- COMMENT
-- ============================================
COMMENT ON FUNCTION public.trigger_process_loyalty_on_delivery() IS 
'Otorga puntos de fidelidad cuando un pedido cambia a status Entregado. 
Complementa el trigger existente que procesa por payment_status=approved.
Idempotente: evita duplicar puntos si ya se otorgaron por otro trigger.';
