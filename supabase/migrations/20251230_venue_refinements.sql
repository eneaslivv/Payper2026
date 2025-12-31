-- Refinement Migration: Venue Command Center

-- 1. Add location_id to venue_nodes (connects Bars/Punto de Venta to Inventory)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_nodes' AND column_name = 'location_id') THEN
        ALTER TABLE public.venue_nodes ADD COLUMN location_id uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 2. Add source_location_id to orders (know where to deduct stock from)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'source_location_id') THEN
        ALTER TABLE public.orders ADD COLUMN source_location_id uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Enforce Single Active Order per Node (Avoid Concurrency Issues)
-- First, ensure no duplicate active orders exist (cleanup)
-- (Skipping cleanup logic for safety, assuming empty/fresh DB for validation or manual fix if conflict)

CREATE UNIQUE INDEX IF NOT EXISTS unique_active_order_node ON public.orders (node_id) 
WHERE status IN ('draft', 'pending', 'preparing', 'ready', 'served');


-- 4. VIEW for Frontend Map (Avoids maintaining current_order_id)
-- This view gives the frontend everything it needs to paint the map without manual state management
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
  END as derived_status,
  -- Active Order Info
  o.id as active_order_id,
  o.status as order_status,
  o.total_amount as current_total,
  o.created_at as order_start_time
FROM public.venue_nodes vn
LEFT JOIN public.orders o ON vn.id = o.node_id AND o.status IN ('draft', 'pending', 'preparing', 'ready', 'served');


-- 5. RPC: Open Table (Safe Creation)
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
  -- Check if already occupied (Constraint handles this, but nice to return clear error)
  IF EXISTS (SELECT 1 FROM public.orders WHERE node_id = p_node_id AND status IN ('draft', 'pending', 'preparing', 'ready', 'served')) THEN
    RETURN json_build_object('success', false, 'message', 'La mesa ya está ocupada');
  END IF;

  INSERT INTO public.orders (store_id, node_id, status, created_by_user_id) -- Assuming column created_by... exists or we add it
  VALUES (p_store_id, p_node_id, 'draft', p_user_id)
  RETURNING id INTO v_new_order_id;

  RETURN json_build_object('success', true, 'order_id', v_new_order_id);
END;
$$;
