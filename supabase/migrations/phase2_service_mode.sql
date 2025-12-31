-- Phase 2: Service Mode Migration
-- Run this in Supabase SQL Editor

-- 1. Add service_mode column to stores table
ALTER TABLE stores 
ADD COLUMN IF NOT EXISTS service_mode TEXT DEFAULT 'counter';

-- 2. Add comment for documentation
COMMENT ON COLUMN stores.service_mode IS 'Operational mode: counter | table | club';

-- 3. Verify
SELECT id, slug, service_mode FROM stores LIMIT 5;
