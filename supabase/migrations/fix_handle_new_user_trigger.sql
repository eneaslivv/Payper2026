-- FIX: handle_new_user trigger failure due to missing user_role type
-- This function replaces the broken trigger logic with a robust version using TEXT

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store_id UUID;
    v_role TEXT;
BEGIN
    -- Safely extra store_id if present (it might be null for owners/admins)
    BEGIN
        v_store_id := (NEW.raw_user_meta_data->>'store_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_store_id := NULL;
    END;

    -- Safely extract role, default to 'customer'
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'customer');

    -- 1. Insert into PROFILES (Required for everything)
    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        store_id,
        created_at,
        updated_at,
        is_active
    )
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        v_role, -- Now using TEXT, no cast to user_role
        v_store_id,
        NOW(),
        NOW(),
        true
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role, -- Update role if it changed
        store_id = COALESCE(EXCLUDED.store_id, profiles.store_id),
        updated_at = NOW();

    -- 2. If it's a Client (has store_id), ensure they are in the CLIENTS table
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
