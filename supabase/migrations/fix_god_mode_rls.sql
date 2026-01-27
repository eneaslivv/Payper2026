-- ==============================================================================
-- FIX: Hardening auth.get_user_store_id() against GOD MODE bypass
-- ==============================================================================
-- Description: 
-- Modifies the helper function used by RLS policies to check 'is_active'.
-- If a user is deactivated (is_active = false), this function will now return NULL,
-- effectively blocking access to all store data even if the frontend check is bypassed.
-- ==============================================================================

CREATE OR REPLACE FUNCTION auth.get_user_store_id()
RETURNS UUID AS $$
  SELECT store_id 
  FROM public.profiles 
  WHERE id = auth.uid() 
  AND is_active = true -- CRITICAL: Enforce active status here
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';
