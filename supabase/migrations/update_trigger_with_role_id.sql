-- ENHANCEMENT: Update handle_new_user to capture role_id
-- This ensures 'role_id' (UUID) is set correctly for Staff without needing client-side updates

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store_id UUID;
    v_role_id UUID;
    v_role TEXT;
BEGIN
    -- Safely extra store_id
    BEGIN
        v_store_id := (NEW.raw_user_meta_data->>'store_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_store_id := NULL;
    END;

    -- Safely extra role_id
    BEGIN
        v_role_id := (NEW.raw_user_meta_data->>'role_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_role_id := NULL;
    END;

    -- Safely extract role, default to 'customer'
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'customer');

    -- 1. Insert into PROFILES
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        role_id, -- Added this
        store_id,
        created_at,
        updated_at,
        is_active
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        v_role,
        v_role_id, -- Value from metadata
        v_store_id,
        NOW(),
        NOW(),
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        role_id = COALESCE(EXCLUDED.role_id, profiles.role_id), -- Update if new value provided
        store_id = COALESCE(EXCLUDED.store_id, profiles.store_id),
        updated_at = NOW();

    -- 2. If it's a Client, ensure they are in the CLIENTS table
    IF v_store_id IS NOT NULL AND (v_role = 'client' OR v_role = 'customer') THEN
        INSERT INTO public.clients (
            auth_user_id,
            email,
            store_id,
            full_name,
            wallet_balance,
            loyalty_points,
            is_active,
            created_at
        )
        VALUES (
            NEW.id,
            NEW.email,
            v_store_id,
            COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
            0.00,
            0,
            true,
            NOW()
        )
        ON CONFLICT (auth_user_id, store_id) DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$;
