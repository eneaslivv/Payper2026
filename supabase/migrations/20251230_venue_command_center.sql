-- 1. Create VENUE_ZONES table
CREATE TABLE IF NOT EXISTS public.venue_zones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL, -- Intentionally NOT referencing stores(id) strictly if not needed, but good practice. Assuming strict RLs elsewhere or loose coupling. Let's stick to simple uuid for now or reference if stores table is guaranteed.
  name text NOT NULL,
  description text,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS for zones
ALTER TABLE public.venue_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage zones of their store" ON public.venue_zones;
CREATE POLICY "Users can manage zones of their store" ON public.venue_zones
  USING (store_id IN (SELECT store_id FROM public.profiles WHERE id = auth.uid()));

-- 2. Modify VENUE_NODES to include zone_id
-- We need to check if column exists first to be safe, or just add it if not.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'venue_nodes' AND column_name = 'zone_id') THEN
        ALTER TABLE public.venue_nodes ADD COLUMN zone_id uuid REFERENCES public.venue_zones(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Create ORDERS table
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL,
  node_id uuid REFERENCES public.venue_nodes(id) ON DELETE SET NULL, -- Link to Table or Bar
  status text NOT NULL CHECK (status IN ('draft', 'pending', 'preparing', 'ready', 'served', 'paid', 'cancelled', 'refunded')),
  total_amount numeric DEFAULT 0,
  payment_method text, -- 'cash', 'card', 'qr', etc.
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage orders of their store" ON public.orders;
CREATE POLICY "Users can manage orders of their store" ON public.orders
  USING (store_id IN (SELECT store_id FROM public.profiles WHERE id = auth.uid()));


-- 4. Create ORDER_ITEMS table
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL, -- Assuming products table exists
  product_name text, -- Snapshot in case product is deleted
  quantity int DEFAULT 1,
  price_at_time numeric NOT NULL,
  status text DEFAULT 'pending', -- 'pending', 'ready', 'delivered'
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage order items of their store" ON public.order_items;
CREATE POLICY "Users can manage order items of their store" ON public.order_items
  USING (order_id IN (SELECT id FROM public.orders)); -- Simplified RLS relying on parent

-- 5. FUNCTION & TRIGGER: Auto-update node status based on orders
-- When an order is created for a node (e.g. table), set node status to 'occupied' (or 'pending_order')
CREATE OR REPLACE FUNCTION public.sync_node_status_from_order()
RETURNS TRIGGER AS $$
BEGIN
  -- If new order is created and active
  IF (TG_OP = 'INSERT') THEN
     IF NEW.status NOT IN ('paid', 'cancelled', 'refunded') AND NEW.node_id IS NOT NULL THEN
       UPDATE public.venue_nodes SET status = 'occupied' WHERE id = NEW.node_id;
     END IF;
  END IF;

  -- If order status changes
  IF (TG_OP = 'UPDATE') THEN
     -- If order becomes paid or cancelled, check if there are other active orders. If not, free the table? 
     -- Actually, usually you keep it occupied until explicit "Free" action or "Close".
     -- But let's say if it goes to 'bill_requested' we update node.
     /* logic can be complex, let's keep it simple for now: 
        Visuals should react to order status. 
        We'll handle explicit status changes in the UI for now to avoid side-effects.
     */
     NULL; 
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS trigger_sync_node_status ON public.orders;
CREATE TRIGGER trigger_sync_node_status
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.sync_node_status_from_order();
