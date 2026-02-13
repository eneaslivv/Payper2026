-- =============================================
-- MIGRATION: Add store_id to Critical Tables
-- Date: 2026-02-13
-- Issue: Multi-tenant isolation - 7 tables missing store_id
-- Critical for: Preventing data leakage between tenants
-- =============================================

-- PART 1: Add store_id columns with proper constraints
-- =============================================

-- 1. order_events (CRITICAL - events without tenant isolation)
ALTER TABLE public.order_events
ADD COLUMN IF NOT EXISTS store_id UUID;

-- Populate from orders table
UPDATE public.order_events oe
SET store_id = o.store_id
FROM public.orders o
WHERE oe.order_id = o.id
AND oe.store_id IS NULL;

-- Make NOT NULL after population
ALTER TABLE public.order_events
ALTER COLUMN store_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE public.order_events
ADD CONSTRAINT fk_order_events_store
FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_order_events_store_id
ON public.order_events(store_id);

COMMENT ON COLUMN public.order_events.store_id IS
'Multi-tenant isolation: ensures events belong to specific store';


-- 2. payment_transactions (CRITICAL - payments without tenant isolation)
ALTER TABLE public.payment_transactions
ADD COLUMN IF NOT EXISTS store_id UUID;

-- Populate from orders table
UPDATE public.payment_transactions pt
SET store_id = o.store_id
FROM public.orders o
WHERE pt.order_id = o.id
AND pt.store_id IS NULL;

-- Make NOT NULL after population
ALTER TABLE public.payment_transactions
ALTER COLUMN store_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE public.payment_transactions
ADD CONSTRAINT fk_payment_transactions_store
FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_payment_transactions_store_id
ON public.payment_transactions(store_id);


-- 3. stock_movements (CRITICAL - stock movements without isolation)
ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS store_id UUID;

-- Populate from inventory_items table
UPDATE public.stock_movements sm
SET store_id = ii.store_id
FROM public.inventory_items ii
WHERE sm.inventory_item_id = ii.id
AND sm.store_id IS NULL;

-- Make NOT NULL after population
ALTER TABLE public.stock_movements
ALTER COLUMN store_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE public.stock_movements
ADD CONSTRAINT fk_stock_movements_store
FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_stock_movements_store_id
ON public.stock_movements(store_id);


-- 4. cash_movements (CRITICAL - cash movements without isolation)
ALTER TABLE public.cash_movements
ADD COLUMN IF NOT EXISTS store_id UUID;

-- Populate from cash_sessions table
UPDATE public.cash_movements cm
SET store_id = cs.store_id
FROM public.cash_sessions cs
WHERE cm.session_id = cs.id
AND cm.store_id IS NULL;

-- Make NOT NULL after population
ALTER TABLE public.cash_movements
ALTER COLUMN store_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE public.cash_movements
ADD CONSTRAINT fk_cash_movements_store
FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_cash_movements_store_id
ON public.cash_movements(store_id);


-- 5. loyalty_transactions (HIGH - loyalty points without isolation)
ALTER TABLE public.loyalty_transactions
ADD COLUMN IF NOT EXISTS store_id UUID;

-- Populate from clients table
UPDATE public.loyalty_transactions lt
SET store_id = c.store_id
FROM public.clients c
WHERE lt.client_id = c.id
AND lt.store_id IS NULL;

-- Make NOT NULL after population
ALTER TABLE public.loyalty_transactions
ALTER COLUMN store_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE public.loyalty_transactions
ADD CONSTRAINT fk_loyalty_transactions_store
FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_store_id
ON public.loyalty_transactions(store_id);


-- 6. email_logs (MEDIUM - email logs without isolation)
ALTER TABLE public.email_logs
ADD COLUMN IF NOT EXISTS store_id UUID;

-- Populate store_id based on context
-- For order-related emails, use order's store_id
UPDATE public.email_logs el
SET store_id = o.store_id
FROM public.orders o
WHERE el.metadata->>'order_id' = o.id::text
AND el.store_id IS NULL;

-- For client-related emails, use client's store_id
UPDATE public.email_logs el
SET store_id = c.store_id
FROM public.clients c
WHERE el.recipient = c.email
AND el.store_id IS NULL;

-- For profiles-related emails (staff), use profile's store_id
UPDATE public.email_logs el
SET store_id = p.store_id
FROM public.profiles p
WHERE el.recipient = p.email
AND el.store_id IS NULL;

-- Make NOT NULL after population (allow NULL for system emails)
-- DO NOT enforce NOT NULL on email_logs to allow system-wide emails
-- ALTER TABLE public.email_logs ALTER COLUMN store_id SET NOT NULL;

-- Add FK constraint (nullable)
ALTER TABLE public.email_logs
ADD CONSTRAINT fk_email_logs_store
FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_email_logs_store_id
ON public.email_logs(store_id);

COMMENT ON COLUMN public.email_logs.store_id IS
'Store association (nullable for system-wide emails)';


-- 7. open_packages (MEDIUM - open packages without isolation)
ALTER TABLE public.open_packages
ADD COLUMN IF NOT EXISTS store_id UUID;

-- Populate from inventory_items table
UPDATE public.open_packages op
SET store_id = ii.store_id
FROM public.inventory_items ii
WHERE op.inventory_item_id = ii.id
AND op.store_id IS NULL;

-- Make NOT NULL after population
ALTER TABLE public.open_packages
ALTER COLUMN store_id SET NOT NULL;

-- Add FK constraint
ALTER TABLE public.open_packages
ADD CONSTRAINT fk_open_packages_store
FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;

-- Add index
CREATE INDEX IF NOT EXISTS idx_open_packages_store_id
ON public.open_packages(store_id);


-- PART 2: Update RLS policies to use store_id
-- =============================================

-- Enable RLS on all tables if not already enabled
ALTER TABLE public.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.open_packages ENABLE ROW LEVEL SECURITY;


-- Drop existing policies (if any) to recreate with store_id validation
DROP POLICY IF EXISTS "Users can view their store order events" ON public.order_events;
DROP POLICY IF EXISTS "Users can insert order events" ON public.order_events;
DROP POLICY IF EXISTS "Users can view their store payment transactions" ON public.payment_transactions;
DROP POLICY IF EXISTS "Users can view their store stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Users can view their store cash movements" ON public.cash_movements;
DROP POLICY IF EXISTS "Users can view their store loyalty transactions" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "Users can view their store email logs" ON public.email_logs;
DROP POLICY IF EXISTS "Users can view their store open packages" ON public.open_packages;


-- Create new policies with store_id validation

-- order_events policies
CREATE POLICY "Users can view their store order events"
ON public.order_events
FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can insert order events for their store"
ON public.order_events
FOR INSERT
TO authenticated
WITH CHECK (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);


-- payment_transactions policies
CREATE POLICY "Users can view their store payment transactions"
ON public.payment_transactions
FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can insert payment transactions for their store"
ON public.payment_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);


-- stock_movements policies
CREATE POLICY "Users can view their store stock movements"
ON public.stock_movements
FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can insert stock movements for their store"
ON public.stock_movements
FOR INSERT
TO authenticated
WITH CHECK (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);


-- cash_movements policies
CREATE POLICY "Users can view their store cash movements"
ON public.cash_movements
FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can insert cash movements for their store"
ON public.cash_movements
FOR INSERT
TO authenticated
WITH CHECK (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);


-- loyalty_transactions policies
CREATE POLICY "Users can view their store loyalty transactions"
ON public.loyalty_transactions
FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can insert loyalty transactions for their store"
ON public.loyalty_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);


-- email_logs policies (allow NULL store_id for system emails)
CREATE POLICY "Users can view their store email logs"
ON public.email_logs
FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
  OR store_id IS NULL  -- System-wide emails visible to all
);


-- open_packages policies
CREATE POLICY "Users can view their store open packages"
ON public.open_packages
FOR SELECT
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Users can manage open packages for their store"
ON public.open_packages
FOR ALL
TO authenticated
USING (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  store_id IN (
    SELECT store_id FROM public.profiles WHERE id = auth.uid()
  )
);


-- PART 3: Verification queries
-- =============================================

-- Verify all tables now have store_id
DO $$
DECLARE
  v_missing_store_id TEXT[];
BEGIN
  SELECT ARRAY_AGG(table_name)
  INTO v_missing_store_id
  FROM (
    SELECT 'order_events' AS table_name
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'order_events' AND column_name = 'store_id'
    )
    UNION ALL
    SELECT 'payment_transactions'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'payment_transactions' AND column_name = 'store_id'
    )
    UNION ALL
    SELECT 'stock_movements'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'stock_movements' AND column_name = 'store_id'
    )
    UNION ALL
    SELECT 'cash_movements'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'cash_movements' AND column_name = 'store_id'
    )
    UNION ALL
    SELECT 'loyalty_transactions'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'loyalty_transactions' AND column_name = 'store_id'
    )
    UNION ALL
    SELECT 'email_logs'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'email_logs' AND column_name = 'store_id'
    )
    UNION ALL
    SELECT 'open_packages'
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'open_packages' AND column_name = 'store_id'
    )
  ) t;

  IF v_missing_store_id IS NOT NULL THEN
    RAISE EXCEPTION 'Missing store_id columns in tables: %', ARRAY_TO_STRING(v_missing_store_id, ', ');
  ELSE
    RAISE NOTICE 'SUCCESS: All 7 critical tables now have store_id column';
  END IF;
END $$;

-- Verify RLS is enabled on all tables
SELECT
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
  'order_events',
  'payment_transactions',
  'stock_movements',
  'cash_movements',
  'loyalty_transactions',
  'email_logs',
  'open_packages'
)
ORDER BY tablename;

-- Expected: rowsecurity = true for all 7 tables

-- Count policies per table
SELECT
  schemaname,
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN (
  'order_events',
  'payment_transactions',
  'stock_movements',
  'cash_movements',
  'loyalty_transactions',
  'email_logs',
  'open_packages'
)
GROUP BY schemaname, tablename
ORDER BY tablename;

-- Expected: At least 1 policy per table

COMMENT ON COLUMN public.order_events.store_id IS
'Added 2026-02-13: Multi-tenant isolation to prevent event data leakage';

COMMENT ON COLUMN public.payment_transactions.store_id IS
'Added 2026-02-13: Multi-tenant isolation to prevent payment data leakage';

COMMENT ON COLUMN public.stock_movements.store_id IS
'Added 2026-02-13: Multi-tenant isolation to prevent stock data leakage';

COMMENT ON COLUMN public.cash_movements.store_id IS
'Added 2026-02-13: Multi-tenant isolation to prevent cash data leakage';

COMMENT ON COLUMN public.loyalty_transactions.store_id IS
'Added 2026-02-13: Multi-tenant isolation to prevent loyalty data leakage';

COMMENT ON COLUMN public.open_packages.store_id IS
'Added 2026-02-13: Multi-tenant isolation to prevent package data leakage';
