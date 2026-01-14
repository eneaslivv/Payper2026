-- FIX: Enable comprehensive access for authentication and profile creation
-- This migration fixes issues where new users cannot create their profile or client record due to RLS.

-- 1. PROFILES: Allow users to insert/read their own profile
-- Required for AuthContext auto-heal logic
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
    FOR INSERT
    WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles
    FOR SELECT
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
    FOR UPDATE
    USING (auth.uid() = id);

-- 2. CLIENTS: Enhance ensure_client_in_store robustness
-- Ensure the function can access necessary tables and return success
CREATE OR REPLACE FUNCTION public.ensure_client_in_store(
    p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with superuser privileges to bypass RLS/Auth restrictions
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_email TEXT;
    v_name TEXT;
    v_phone TEXT;
    v_client_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    -- Check if client record already exists for this store
    SELECT id INTO v_client_id FROM public.clients 
    WHERE auth_user_id = v_user_id AND store_id = p_store_id;

    IF v_client_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'client_id', v_client_id, 'is_new', false);
    END IF;

    -- Get user details from auth.users
    SELECT 
        email, 
        COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)),
        raw_user_meta_data->>'phone'
    INTO v_email, v_name, v_phone
    FROM auth.users 
    WHERE id = v_user_id;

    -- Insert new client record safely
    INSERT INTO public.clients (
        auth_user_id, 
        store_id, 
        email, 
        name, 
        full_name, 
        phone,
        wallet_balance, 
        loyalty_points, 
        is_active,
        created_at
    )
    VALUES (
        v_user_id, 
        p_store_id, 
        v_email, 
        v_name, 
        v_name,
        v_phone,
        0, 
        0, 
        true,
        NOW()
    )
    RETURNING id INTO v_client_id;

    RETURN jsonb_build_object('success', true, 'client_id', v_client_id, 'is_new', true);
EXCEPTION WHEN OTHERS THEN
    -- Log error for debugging (visible in Supabase logs)
    RAISE WARNING 'Error in ensure_client_in_store: %', SQLERRM;
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION ensure_client_in_store TO authenticated;

-- 3. ENSURE Clients Table RLS (Redundant check but critical)
-- (Assuming fix_clients_rls_comprehensive.sql is applied, but adding safety here)
DROP POLICY IF EXISTS "min_clients_insert" ON clients;
CREATE POLICY "min_clients_insert" ON clients
    FOR INSERT
    WITH CHECK (auth.uid() = auth_user_id);
