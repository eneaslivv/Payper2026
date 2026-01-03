-- Drop the unique constraint index that prevents multiple active orders per node
DROP INDEX IF EXISTS public.unique_active_order_node;
