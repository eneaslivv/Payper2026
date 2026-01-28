-- =====================================================
-- PROPOSAL: RLS policies for dispatch_sessions
-- Status: Proposal only (do not execute)
-- =====================================================

-- Enable RLS
ALTER TABLE public.dispatch_sessions ENABLE ROW LEVEL SECURITY;

-- Store members can read their store sessions
CREATE POLICY "Store members can view dispatch sessions"
ON public.dispatch_sessions
FOR SELECT
USING (store_id = auth.get_user_store_id());

-- Store members can open sessions
CREATE POLICY "Store members can insert dispatch sessions"
ON public.dispatch_sessions
FOR INSERT
WITH CHECK (store_id = auth.get_user_store_id());

-- Store members can close/update sessions
CREATE POLICY "Store members can update dispatch sessions"
ON public.dispatch_sessions
FOR UPDATE
USING (store_id = auth.get_user_store_id())
WITH CHECK (store_id = auth.get_user_store_id());

-- Super admins can manage all sessions
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
