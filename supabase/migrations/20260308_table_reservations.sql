-- =============================================================================
-- Migration: Table Reservations System
-- - create_reservation RPC (matches existing table_reservations schema)
-- - Updated active_venue_states VIEW (reservation-aware + stock location fields)
-- - Updated open_table() RPC (passes stock location + handles reservation arrival)
-- =============================================================================

-- NOTE: table_reservations already exists with columns:
-- id, store_id, node_id, customer_name, customer_email, customer_phone,
-- client_id, pax, reserved_by, initial_credit, remaining_credit, consumed_credit,
-- invite_token, invite_claimed_at, menu_id, status, arrived_at, completed_at,
-- cancelled_at, notes, created_at, updated_at

-- Drop existing objects to allow column/param changes
DROP VIEW IF EXISTS public.active_venue_states;
DROP FUNCTION IF EXISTS public.open_table(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.create_reservation(uuid, uuid, text, text, text, uuid, integer, numeric, uuid, text, uuid);

-- 1. VIEW: active_venue_states (reservation-aware)
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
  tr.customer_name as reserved_for,
  tr.created_at as reserved_at,
  tr.pax as reservation_pax,
  vn.updated_at
FROM public.venue_nodes vn
LEFT JOIN public.orders o
  ON vn.id = o.node_id
  AND o.status IN ('draft', 'pending', 'preparing', 'ready', 'served')
LEFT JOIN public.table_reservations tr
  ON vn.id = tr.node_id
  AND tr.status = 'active';


-- 2. RPC: create_reservation
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
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE node_id = p_node_id
      AND status IN ('draft', 'pending', 'preparing', 'ready', 'served')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'La mesa está ocupada');
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

  RETURN jsonb_build_object(
    'success', true,
    'reservation_id', v_reservation_id,
    'invite_token', v_invite_token
  );
END;
$$;


-- 3. RPC: open_table (stock location + reservation arrival)
CREATE FUNCTION public.open_table(
  p_node_id UUID,
  p_store_id UUID,
  p_user_id UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_order_id UUID;
  v_dispatch_station TEXT;
  v_location_id UUID;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE node_id = p_node_id
      AND status IN ('draft', 'pending', 'preparing', 'ready', 'served')
  ) THEN
    RETURN json_build_object('success', false, 'message', 'La mesa ya está ocupada');
  END IF;

  SELECT dispatch_station, location_id
  INTO v_dispatch_station, v_location_id
  FROM public.venue_nodes
  WHERE id = p_node_id;

  IF v_location_id IS NULL AND v_dispatch_station IS NOT NULL THEN
    SELECT storage_location_id INTO v_location_id
    FROM public.dispatch_stations
    WHERE store_id = p_store_id
      AND name = v_dispatch_station
      AND storage_location_id IS NOT NULL
    LIMIT 1;
  END IF;

  INSERT INTO public.orders (
    store_id, node_id, status, created_by_user_id,
    dispatch_station, source_location_id
  ) VALUES (
    p_store_id, p_node_id, 'draft', p_user_id,
    v_dispatch_station, v_location_id
  )
  RETURNING id INTO v_new_order_id;

  UPDATE public.table_reservations
  SET status = 'arrived', arrived_at = now()
  WHERE node_id = p_node_id AND status = 'active';

  UPDATE public.venue_nodes SET status = 'occupied' WHERE id = p_node_id;

  RETURN json_build_object('success', true, 'order_id', v_new_order_id);
END;
$$;


-- 4. Notify PostgREST
NOTIFY pgrst, 'reload schema';
