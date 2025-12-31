-- Refinement Migration V2: Venue Command Center (Altering Existing Tables)

-- 1. Modify venue_nodes: Add location_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_nodes' AND column_name = 'location_id') THEN
        ALTER TABLE public.venue_nodes ADD COLUMN location_id uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 2. Modify orders: Add node_id and source_location_id
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'node_id') THEN
        ALTER TABLE public.orders ADD COLUMN node_id uuid REFERENCES public.venue_nodes(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'source_location_id') THEN
        ALTER TABLE public.orders ADD COLUMN source_location_id uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Modify order_items: Add status (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'order_items' AND column_name = 'status') THEN
        ALTER TABLE public.order_items ADD COLUMN status text DEFAULT 'pending';
    END IF;
    -- check for price_at_time vs unit_price consistency. Existing table hash unit_price. We can use that.
    -- If price_at_time is needed as alias, we can add it, but better to stick to existing unit_price.
END $$;


-- 4. Enforce Single Active Order per Node
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_order_node ON public.orders (node_id) 
WHERE status IN ('draft', 'pending', 'preparing', 'ready', 'served');

-- 5. VIEW for Frontend Map
CREATE OR REPLACE VIEW public.active_venue_states AS
SELECT 
  vn.id as node_id,
  vn.store_id,
  vn.label,
  vn.type,
  vn.position_x,
  vn.position_y,
  vn.zone_id,
  -- Derived Status
  CASE 
    WHEN o.id IS NOT NULL THEN 'occupied'
    ELSE 'free'
  END::text as derived_status,
  -- Active Order Info
  o.id as active_order_id,
  o.status as order_status,
  o.total_amount as current_total,
  o.created_at as order_start_time
FROM public.venue_nodes vn
LEFT JOIN public.orders o ON vn.id = o.node_id AND o.status IN ('draft', 'pending', 'preparing', 'ready', 'served');

-- 6. RPC: Open Table (Safe Creation)
CREATE OR REPLACE FUNCTION public.open_table(
  p_node_id uuid,
  p_store_id uuid,
  p_user_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_order_id uuid;
BEGIN
  -- Check if already occupied
  IF EXISTS (SELECT 1 FROM public.orders WHERE node_id = p_node_id AND status IN ('draft', 'pending', 'preparing', 'ready', 'served')) THEN
    RETURN json_build_object('success', false, 'message', 'La mesa ya está ocupada');
  END IF;

  INSERT INTO public.orders (store_id, node_id, status, created_by_user_id)
  VALUES (p_store_id, p_node_id, 'draft', p_user_id)
  RETURNING id INTO v_new_order_id;

  RETURN json_build_object('success', true, 'order_id', v_new_order_id);
END;
$$;
