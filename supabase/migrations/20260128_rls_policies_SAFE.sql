-- =====================================================
-- MIGRATION: Add RLS Policies to Missing Tables (SAFE VERSION)
-- =====================================================
-- Date: 2026-01-28
-- Risk: LOW (updates existing policies for established tables)
-- Excludes: dispatch_sessions (table does not exist)
-- =====================================================

-- STEP 1: payment_webhooks
ALTER TABLE public.payment_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins View Store Webhooks" ON public.payment_webhooks;
DROP POLICY IF EXISTS "Store members can view payment webhooks" ON public.payment_webhooks;
DROP POLICY IF EXISTS "Super admins can view payment webhooks" ON public.payment_webhooks;
DROP POLICY IF EXISTS "Service role can manage payment webhooks" ON public.payment_webhooks;
DROP POLICY IF EXISTS "payment_webhooks_store_access" ON public.payment_webhooks; -- Dropping the too permissive one mentioned in guide

CREATE POLICY "Store members can view payment webhooks"
ON public.payment_webhooks
FOR SELECT
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Super admins can view payment webhooks"
ON public.payment_webhooks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

CREATE POLICY "Service role can manage payment webhooks"
ON public.payment_webhooks
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- STEP 2: wallet_transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store members can view wallet transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Clients can view own wallet transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Super admins can view wallet transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Service role can manage wallet transactions" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Clients can view own transactions" ON public.wallet_transactions; -- Old name
DROP POLICY IF EXISTS "wallet_txn_select_store" ON public.wallet_transactions; -- Old name

CREATE POLICY "Store members can view wallet transactions"
ON public.wallet_transactions
FOR SELECT
USING (
  store_id = auth.get_user_store_id()
  OR wallet_id IN (
    SELECT id FROM public.wallets
    WHERE store_id = auth.get_user_store_id()
  )
  OR client_id IN (
    SELECT id FROM public.clients
    WHERE store_id = auth.get_user_store_id()
  )
);

CREATE POLICY "Clients can view own wallet transactions"
ON public.wallet_transactions
FOR SELECT
USING (
  user_id = auth.uid()
  OR client_id IN (
    SELECT id FROM public.clients
    WHERE auth_user_id = auth.uid()
  )
);

CREATE POLICY "Super admins can view wallet transactions"
ON public.wallet_transactions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

CREATE POLICY "Service role can manage wallet transactions"
ON public.wallet_transactions
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- =====================================================
-- ROLLBACK PLAN (execute only if issues arise)
-- =====================================================
/*
-- Revert payment_webhooks
DROP POLICY "Store members can view payment webhooks" ON public.payment_webhooks;
DROP POLICY "Super admins can view payment webhooks" ON public.payment_webhooks;
DROP POLICY "Service role can manage payment webhooks" ON public.payment_webhooks;

CREATE POLICY "Admins View Store Webhooks" ON public.payment_webhooks
FOR SELECT USING (store_id = auth.get_user_store_id());

CREATE POLICY "payment_webhooks_store_access" ON public.payment_webhooks
FOR ALL USING (store_id = auth.get_user_store_id());

-- Revert wallet_transactions
DROP POLICY "Store members can view wallet transactions" ON public.wallet_transactions;
DROP POLICY "Clients can view own wallet transactions" ON public.wallet_transactions;
DROP POLICY "Super admins can view wallet transactions" ON public.wallet_transactions;
DROP POLICY "Service role can manage wallet transactions" ON public.wallet_transactions;

CREATE POLICY "Clients can view own transactions" ON public.wallet_transactions
FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE auth_user_id = auth.uid()));

CREATE POLICY "wallet_txn_select_store" ON public.wallet_transactions
FOR SELECT USING (store_id = auth.get_user_store_id());
*/
