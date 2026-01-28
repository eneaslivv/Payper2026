-- =====================================================
-- MIGRATION: Add RLS Policies to Missing Tables
-- =====================================================
-- Date: 2026-01-28
-- Risk: MEDIUM (cambia permisos pero no data)
-- Rollback: Incluido al final
-- =====================================================

-- STEP 1: payment_webhooks
ALTER TABLE public.payment_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins View Store Webhooks" ON public.payment_webhooks;
DROP POLICY IF EXISTS "Store members can view payment webhooks" ON public.payment_webhooks;
DROP POLICY IF EXISTS "Super admins can view payment webhooks" ON public.payment_webhooks;
DROP POLICY IF EXISTS "Service role can manage payment webhooks" ON public.payment_webhooks;

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

-- STEP 3: dispatch_sessions
ALTER TABLE public.dispatch_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for store users" ON public.dispatch_sessions;
DROP POLICY IF EXISTS "Store members can view dispatch sessions" ON public.dispatch_sessions;
DROP POLICY IF EXISTS "Store members can insert dispatch sessions" ON public.dispatch_sessions;
DROP POLICY IF EXISTS "Store members can update dispatch sessions" ON public.dispatch_sessions;
DROP POLICY IF EXISTS "Super admins can manage dispatch sessions" ON public.dispatch_sessions;

CREATE POLICY "Store members can view dispatch sessions"
ON public.dispatch_sessions
FOR SELECT
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Store members can insert dispatch sessions"
ON public.dispatch_sessions
FOR INSERT
WITH CHECK (store_id = auth.get_user_store_id());

CREATE POLICY "Store members can update dispatch sessions"
ON public.dispatch_sessions
FOR UPDATE
USING (store_id = auth.get_user_store_id())
WITH CHECK (store_id = auth.get_user_store_id());

CREATE POLICY "Super admins can manage dispatch sessions"
ON public.dispatch_sessions
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- =====================================================
-- ROLLBACK PLAN (solo si hay problemas)
-- =====================================================
/*
DROP POLICY "Store members can view payment webhooks" ON public.payment_webhooks;
DROP POLICY "Super admins can view payment webhooks" ON public.payment_webhooks;
DROP POLICY "Service role can manage payment webhooks" ON public.payment_webhooks;
ALTER TABLE public.payment_webhooks DISABLE ROW LEVEL SECURITY;

DROP POLICY "Store members can view wallet transactions" ON public.wallet_transactions;
DROP POLICY "Clients can view own wallet transactions" ON public.wallet_transactions;
DROP POLICY "Super admins can view wallet transactions" ON public.wallet_transactions;
DROP POLICY "Service role can manage wallet transactions" ON public.wallet_transactions;
ALTER TABLE public.wallet_transactions DISABLE ROW LEVEL SECURITY;

DROP POLICY "Store members can view dispatch sessions" ON public.dispatch_sessions;
DROP POLICY "Store members can insert dispatch sessions" ON public.dispatch_sessions;
DROP POLICY "Store members can update dispatch sessions" ON public.dispatch_sessions;
DROP POLICY "Super admins can manage dispatch sessions" ON public.dispatch_sessions;
ALTER TABLE public.dispatch_sessions DISABLE ROW LEVEL SECURITY;
*/
