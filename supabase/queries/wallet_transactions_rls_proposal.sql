-- =====================================================
-- PROPOSAL: RLS policies for wallet_transactions
-- Status: Proposal only (do not execute)
-- =====================================================

-- Enable RLS
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Store members can read transactions for their store
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

-- Clients can read their own transactions
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

-- Super admins can read all transactions
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

-- Service role can manage transactions (Edge Functions/RPC)
CREATE POLICY "Service role can manage wallet transactions"
ON public.wallet_transactions
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
