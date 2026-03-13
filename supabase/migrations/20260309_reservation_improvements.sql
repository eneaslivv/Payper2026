-- =============================================================================
-- Migration: Reservation Flow Improvements
-- - Extended active_venue_states VIEW (invite_token, credit, client_id)
-- - table_reservations realtime publication
-- - Auto-complete trigger on venue_nodes free
-- - client_notifications table
-- - Updated create_reservation() with client notification
-- =============================================================================

-- 1. Drop + recreate VIEW with additional reservation columns
DROP VIEW IF EXISTS public.active_venue_states;
CREATE VIEW public.active_venue_states AS
SELECT
  vn.id as node_id,
  vn.store_id,
  vn.label,
  vn.type,
  vn.position_x,
  vn.position_y,
  vn.zone_id,
  vn.rotation,
  vn.metadata,
  vn.location_id,
  vn.dispatch_station,
  CASE
    WHEN o.id IS NOT NULL THEN 'occupied'
    WHEN vn.status = 'reserved' THEN 'reserved'
    ELSE 'free'
  END::text as derived_status,
  o.id as active_order_id,
  o.status as order_status,
  o.total_amount as current_total,
  o.created_at as order_start_time,
  tr.id as reservation_id,
  tr.customer_name as reserved_for,
  tr.created_at as reserved_at,
  tr.pax as reservation_pax,
  tr.invite_token as reservation_invite_token,
  tr.initial_credit as reservation_credit,
  tr.remaining_credit as reservation_remaining,
  tr.client_id as reservation_client_id,
  vn.updated_at
FROM public.venue_nodes vn
LEFT JOIN public.orders o
  ON vn.id = o.node_id
  AND o.status IN ('draft', 'pending', 'preparing', 'ready', 'served')
LEFT JOIN public.table_reservations tr
  ON vn.id = tr.node_id
  AND tr.status = 'active';


-- 2. Add table_reservations to realtime publication
ALTER TABLE public.table_reservations REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'table_reservations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.table_reservations;
  END IF;
END $$;


-- 3. Auto-complete reservation when table is freed
CREATE OR REPLACE FUNCTION public.complete_reservation_on_free()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'free' AND OLD.status IN ('occupied', 'reserved') THEN
    UPDATE public.table_reservations
    SET status = 'completed', completed_at = now()
    WHERE node_id = NEW.id
      AND status IN ('active', 'arrived');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_reservation_on_free ON public.venue_nodes;
CREATE TRIGGER trg_complete_reservation_on_free
  AFTER UPDATE OF status ON public.venue_nodes
  FOR EACH ROW
  WHEN (NEW.status = 'free' AND OLD.status IS DISTINCT FROM 'free')
  EXECUTE FUNCTION public.complete_reservation_on_free();


-- 4. Client notifications table
CREATE TABLE IF NOT EXISTS public.client_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id),
  client_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'reservation',
  title TEXT NOT NULL,
  body TEXT,
  data JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Clients can view own notifications" ON public.client_notifications;
CREATE POLICY "Clients can view own notifications"
  ON public.client_notifications FOR SELECT
  USING (client_id IN (
    SELECT id FROM public.clients WHERE auth_user_id = auth.uid()
  ));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'client_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.client_notifications;
  END IF;
END $$;


-- 5. Update create_reservation() to notify registered clients
DROP FUNCTION IF EXISTS public.create_reservation(uuid, uuid, text, text, text, uuid, integer, numeric, uuid, text, uuid);

CREATE FUNCTION public.create_reservation(
  p_store_id UUID,
  p_node_id UUID,
  p_customer_name TEXT,
  p_customer_email TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_client_id UUID DEFAULT NULL,
  p_pax INTEGER DEFAULT 2,
  p_initial_credit NUMERIC DEFAULT 0,
  p_menu_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_reserved_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reservation_id UUID;
  v_invite_token TEXT;
  v_table_label TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE node_id = p_node_id
      AND status IN ('draft', 'pending', 'preparing', 'ready', 'served')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La mesa esta ocupada');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.table_reservations
    WHERE node_id = p_node_id AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La mesa ya tiene una reserva activa');
  END IF;

  INSERT INTO public.table_reservations (
    store_id, node_id, client_id, customer_name,
    customer_email, customer_phone, pax, initial_credit,
    remaining_credit, menu_id, notes, reserved_by
  ) VALUES (
    p_store_id, p_node_id, p_client_id, p_customer_name,
    p_customer_email, p_customer_phone, p_pax, p_initial_credit,
    p_initial_credit, p_menu_id, p_notes, p_reserved_by
  )
  RETURNING id, invite_token INTO v_reservation_id, v_invite_token;

  UPDATE public.venue_nodes SET status = 'reserved' WHERE id = p_node_id;

  -- Notify registered client
  IF p_client_id IS NOT NULL THEN
    SELECT label INTO v_table_label FROM public.venue_nodes WHERE id = p_node_id;

    INSERT INTO public.client_notifications (
      store_id, client_id, type, title, body, data
    ) VALUES (
      p_store_id,
      p_client_id,
      'reservation',
      'Mesa Reservada',
      format('Tu mesa %s esta reservada para %s personas', v_table_label, p_pax),
      jsonb_build_object(
        'reservation_id', v_reservation_id,
        'invite_token', v_invite_token,
        'node_id', p_node_id,
        'table_label', v_table_label,
        'pax', p_pax,
        'initial_credit', p_initial_credit
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'invite_token', v_invite_token
  );
END;
$$;


-- 6. Notify PostgREST
NOTIFY pgrst, 'reload schema';
