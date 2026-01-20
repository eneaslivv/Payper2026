-- FIX: Cleanup Legacy Tables & Triggers (V8)
-- Priority: High
-- Reason: Found legacy table 'item_stock_levels' with active trigger 'trigger_update_total_stock' calling 'sync_inventory_item_total_stock'.
-- This appears to be an old implementation of stock tracking that conflicts with 'inventory_location_stock'.
-- The function references 'quantity' which causes errors if schemas don't match.

-- 1. Drop the legacy trigger
DROP TRIGGER IF EXISTS trigger_update_total_stock ON public.item_stock_levels;

-- 2. Drop the legacy function
DROP FUNCTION IF EXISTS public.sync_inventory_item_total_stock() CASCADE;

-- 3. Archive/Drop the legacy table
-- Safest is to rename it so it stops accepting inserts/updates if any code still tries to write to it.
-- If it's truly unused, this effectively disables it.
ALTER TABLE IF EXISTS public.item_stock_levels RENAME TO item_stock_levels_deprecated_v8;

-- 4. Audit: Ensure inventory_items doesn't have bad generated columns
-- (Optional cleanup if exists)
-- DO NOTHING here, manual check via SQL is safer.
