-- =====================================================
-- PROPOSAL: RLS policies for payment_webhooks
-- Status: Proposal only (do not execute)
-- =====================================================

-- Enable RLS
ALTER TABLE public.payment_webhooks ENABLE ROW LEVEL SECURITY;

-- Store members can read their own webhooks
CREATE POLICY "Store members can view payment webhooks"
ON public.payment_webhooks
FOR SELECT
USING (store_id = auth.get_user_store_id());

-- Super admins can read all webhooks
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

-- Service role can manage webhooks (Edge Functions)
CREATE POLICY "Service role can manage payment webhooks"
ON public.payment_webhooks
FOR ALL
USING (auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (auth.jwt() ->> 'role' = 'service_role');
