-- 1. STORAGE LOCATIONS (Barras, Depósitos, Cocinas)
CREATE TABLE IF NOT EXISTS public.storage_locations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('warehouse', 'point_of_sale', 'kitchen')),
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS policies for storage_locations
ALTER TABLE public.storage_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view locations of their store" ON public.storage_locations
  FOR SELECT USING (store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Users can manage locations of their store" ON public.storage_locations
  FOR ALL USING (store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  ));

-- 2. ITEM STOCK LEVELS (Stock exacto por ubicación)
CREATE TABLE IF NOT EXISTS public.item_stock_levels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.storage_locations(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(inventory_item_id, location_id)
);

-- RLS policies for item_stock_levels
ALTER TABLE public.item_stock_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view stock levels" ON public.item_stock_levels
  FOR SELECT USING (inventory_item_id IN (
    SELECT id FROM public.inventory_items WHERE store_id IN (
      SELECT store_id FROM public.profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Users can update stock levels" ON public.item_stock_levels
  FOR ALL USING (inventory_item_id IN (
    SELECT id FROM public.inventory_items WHERE store_id IN (
      SELECT store_id FROM public.profiles WHERE id = auth.uid()
    )
  ));

-- 3. STOCK TRANSFERS (Historial de movimientos)
CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id),
  from_location_id uuid REFERENCES public.storage_locations(id), -- Nullable if adjustment/purchase
  to_location_id uuid REFERENCES public.storage_locations(id), -- Nullable if loss/waste
  quantity numeric NOT NULL,
  user_id uuid REFERENCES public.users(id), -- Using auth.users effectively
  notes text,
  batch_id uuid DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now()
);

-- RLS policies for stock_transfers
ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View transfers" ON public.stock_transfers
  FOR SELECT USING (inventory_item_id IN (
    SELECT id FROM public.inventory_items WHERE store_id IN (
      SELECT store_id FROM public.profiles WHERE id = auth.uid()
    )
  ));

CREATE POLICY "Create transfers" ON public.stock_transfers
  FOR INSERT WITH CHECK (inventory_item_id IN (
    SELECT id FROM public.inventory_items WHERE store_id IN (
      SELECT store_id FROM public.profiles WHERE id = auth.uid()
    )
  ));


-- 4. FUNCTION TO SYNC TOTAL STOCK
-- This trigger ensures that inventory_items.current_stock is ALWAYS the sum of all item_stock_levels
CREATE OR REPLACE FUNCTION public.sync_inventory_item_total_stock()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.inventory_items
  SET current_stock = (
    SELECT COALESCE(SUM(quantity), 0)
    FROM public.item_stock_levels
    WHERE inventory_item_id = COALESCE(NEW.inventory_item_id, OLD.inventory_item_id)
  )
  WHERE id = COALESCE(NEW.inventory_item_id, OLD.inventory_item_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_update_total_stock
AFTER INSERT OR UPDATE OR DELETE ON public.item_stock_levels
FOR EACH ROW EXECUTE FUNCTION public.sync_inventory_item_total_stock();


-- 5. RPC: ATOMIC STOCK TRANSFER
CREATE OR REPLACE FUNCTION public.transfer_stock(
  p_item_id uuid,
  p_from_location_id uuid,
  p_to_location_id uuid,
  p_quantity numeric,
  p_user_id uuid,
  p_notes text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_qty numeric;
  v_transfer_id uuid;
BEGIN
  -- 1. Check if enough stock exists in source (if source is specified)
  IF p_from_location_id IS NOT NULL THEN
    SELECT quantity INTO v_current_qty
    FROM public.item_stock_levels
    WHERE inventory_item_id = p_item_id AND location_id = p_from_location_id;

    IF v_current_qty IS NULL OR v_current_qty < p_quantity THEN
      RAISE EXCEPTION 'Stock insuficiente en la ubicación de origen';
    END IF;

    -- Deduct from source
    UPDATE public.item_stock_levels
    SET quantity = quantity - p_quantity, updated_at = now()
    WHERE inventory_item_id = p_item_id AND location_id = p_from_location_id;
  END IF;

  -- 2. Add to destination (if destination is specified)
  IF p_to_location_id IS NOT NULL THEN
    INSERT INTO public.item_stock_levels (inventory_item_id, location_id, quantity)
    VALUES (p_item_id, p_to_location_id, p_quantity)
    ON CONFLICT (inventory_item_id, location_id)
    DO UPDATE SET quantity = item_stock_levels.quantity + p_quantity, updated_at = now();
  END IF;

  -- 3. Log the transfer
  INSERT INTO public.stock_transfers (inventory_item_id, from_location_id, to_location_id, quantity, user_id, notes)
  VALUES (p_item_id, p_from_location_id, p_to_location_id, p_quantity, p_user_id, p_notes)
  RETURNING id INTO v_transfer_id;

  RETURN json_build_object('success', true, 'transfer_id', v_transfer_id);
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
