-- RPC to ensure a client record exists for the current authenticated user in a specific store
-- This fixes issues where existing users visiting a new store wouldn't have a client profile
-- and prevents RLS issues when strictly inserting from client-side.

CREATE OR REPLACE FUNCTION public.ensure_client_in_store(
    p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_email TEXT;
    v_name TEXT;
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

    -- Get user details from auth.users to populate profile
    SELECT email, COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) 
    INTO v_email, v_name 
    FROM auth.users 
    WHERE id = v_user_id;

    -- Insert new client record
    INSERT INTO public.clients (
        auth_user_id, 
        store_id, 
        email, 
        name, 
        full_name, 
        wallet_balance, 
        loyalty_points, 
        is_active
    )
    VALUES (
        v_user_id, 
        p_store_id, 
        v_email, 
        v_name, 
        v_name,
        0, 
        0, 
        true
    )
    RETURNING id INTO v_client_id;

    RETURN jsonb_build_object('success', true, 'client_id', v_client_id, 'is_new', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
