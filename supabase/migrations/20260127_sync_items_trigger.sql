-- Migration: Sync Order Items Status Trigger
-- Created: 2026-01-27
-- Description: Ensures that when an order status changes (e.g. to 'served', 'cancelled'), 
-- the status of its items is automatically updated to match.
-- This prevents "zombie" items remaining in 'pending' state.

-- 1. Create the synchronization function
CREATE OR REPLACE FUNCTION public.sync_order_items_status()
RETURNS TRIGGER 
SECURITY DEFINER -- CRITICAL: Bypass RLS to ensure items are updated regardless of current user role restrictions (like waiters vs kitchen)
SET search_path = public
AS $$
BEGIN
  -- Only update if status actually changed
  IF OLD.status IS DISTINCT FROM NEW.status THEN
      
      -- Update all items belonging to this order
      -- FIX: Cast ENUM to TEXT explicitly to avoid type mismatch errors
      UPDATE public.order_items
      SET status = NEW.status::text
      WHERE order_id = NEW.id
        AND status IS DISTINCT FROM NEW.status::text; -- Optimización
        
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Create the Trigger
DROP TRIGGER IF EXISTS sync_order_items_status_trigger ON orders;

CREATE TRIGGER sync_order_items_status_trigger
    AFTER UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_order_items_status();

-- 3. Grant permissions (standard practice)
GRANT EXECUTE ON FUNCTION public.sync_order_items_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_order_items_status TO service_role;
