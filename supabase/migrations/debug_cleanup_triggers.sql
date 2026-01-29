-- =========================================================
-- DEBUG: DROP TRIGGERS TO UNBLOCK SYNC
-- =========================================================

-- 1. Drop the V25 Insert Trigger (Suspect #1)
DROP TRIGGER IF EXISTS trg_deduct_stock_on_insert ON public.orders;

-- 2. Drop Legacy Triggers (Suspects #2, #3...)
DROP TRIGGER IF EXISTS deduct_stock_trigger ON public.orders;
DROP TRIGGER IF EXISTS update_stock_trigger ON public.orders;
DROP TRIGGER IF EXISTS trg_update_stock ON public.orders;
DROP TRIGGER IF EXISTS trg_stock_deduction ON public.orders;

-- 3. Drop any trigger on order_items that might exist
DROP TRIGGER IF EXISTS update_inventory_trigger ON public.order_items;

-- 4. Check if these functions exist and drop them if they are orphaned/broken
DROP FUNCTION IF EXISTS public.handle_stock_on_insert() CASCADE;

-- Validation Output
SELECT 'TRIGGERS DROPPED - TRY SYNC NOW' as status;
