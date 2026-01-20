-- FIX: Cleanup Duplicate Triggers (V7)
-- Priority: Critical
-- Reason: Found duplicate trigger 'trigger_finalize_order_stock_v5' running alongside 'trg_finalize_stock'.
--         The old trigger calls a function that references the non-existent 'quantity' column, causing the crash.

-- 1. Drop the Rogue Trigger
DROP TRIGGER IF EXISTS trigger_finalize_order_stock_v5 ON orders;

-- 2. Drop the Rogue Function
DROP FUNCTION IF EXISTS public.finalize_order_stock_trigger_v5() CASCADE;

-- 3. Safety Check: Drop any other known old variants just in case
DROP TRIGGER IF EXISTS trg_deduct_stock_on_delivery ON orders;
DROP FUNCTION IF EXISTS deduct_stock_on_delivery() CASCADE;
