-- FIX: Add RLS Policies for Order Items
-- Date: 2026-01-28
-- Context: Missing policies preventing order creation (401 Unauthorized)

-- 1. order_items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store members can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Store members can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Store members can update order items" ON public.order_items;
DROP POLICY IF EXISTS "Store members can delete order items" ON public.order_items;

CREATE POLICY "Store members can view order items"
ON public.order_items FOR SELECT
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Store members can insert order items"
ON public.order_items FOR INSERT
WITH CHECK (store_id = auth.get_user_store_id());

CREATE POLICY "Store members can update order items"
ON public.order_items FOR UPDATE
USING (store_id = auth.get_user_store_id());

-- 2. order_item_addons (likely missing too)
ALTER TABLE public.order_item_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all via tenant_id" ON public.order_item_addons;

CREATE POLICY "Enable all via tenant_id"
ON public.order_item_addons FOR ALL
USING (tenant_id = auth.get_user_store_id())
WITH CHECK (tenant_id = auth.get_user_store_id());

-- 3. Safety: Admin Policy
CREATE POLICY "Super admins can manage order items"
ON public.order_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);
