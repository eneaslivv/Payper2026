-- Migration: Fix Legacy 'delivered' Status
-- Created: 2026-01-27
-- Context: 5 orders found with status='delivered' (legacy enum value) and delivery_status='pending'.
--          Stock is already deducted, so safe to update.

-- 1. Standardize these orders to the correct schema (V12)
UPDATE public.orders
SET 
  status = 'served',               -- Standard Backend Status
  delivery_status = 'delivered'    -- Standard Frontend Status
WHERE status = 'delivered';        -- The legacy value found

-- Note: We are NOT removing 'delivered' from the ENUM yet to avoid breaking other legacy dependencies,
-- but we are cleaning the data so no active rows use it.
