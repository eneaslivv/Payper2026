-- ============================================================================
-- Fix: PostgREST PGRST200 error "Could not find a relationship between
--      'order_items' and 'inventory_items' in the schema cache"
-- Date: 2026-02-21
--
-- Root cause: order_items.product_id references inventory_items.id but
--   the foreign key constraint was never created. PostgREST uses FK
--   relationships for join syntax (e.g., product:inventory_items(name)).
--
-- Fix: Add the missing FK constraint.
-- ============================================================================

ALTER TABLE public.order_items
ADD CONSTRAINT order_items_product_id_fkey
FOREIGN KEY (product_id) REFERENCES public.inventory_items(id);

-- Force PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
