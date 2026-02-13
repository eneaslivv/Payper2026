-- =============================================
-- MIGRATION: Create Store RPC
-- Date: 2026-02-13
-- Issue: P1-6 - Missing create_store() RPC for multi-store creation
-- =============================================

-- PART 1: Create Store Function
-- =============================================
CREATE OR REPLACE FUNCTION public.create_store(
    p_name TEXT,
    p_slug TEXT,
    p_currency TEXT DEFAULT 'ARS',
    p_timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires',
    p_service_mode TEXT DEFAULT 'pos_only',
    p_owner_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id UUID;
    v_existing_store_id UUID;
    v_new_store_id UUID;
    v_default_location_id UUID;
    v_default_zone_id UUID;
BEGIN
    -- 1. Get authenticated user
    v_user_id := COALESCE(p_owner_user_id, auth.uid());

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'UNAUTHORIZED',
            'message', 'Usuario no autenticado'
        );
    END IF;

    -- 2. Check if user is super_admin or creating their first store
    DECLARE
        v_user_role TEXT;
        v_user_store_id UUID;
    BEGIN
        SELECT role, store_id INTO v_user_role, v_user_store_id
        FROM profiles
        WHERE id = v_user_id;

        -- Only super_admin can create multiple stores
        IF v_user_store_id IS NOT NULL AND v_user_role != 'super_admin' THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', 'PERMISSION_DENIED',
                'message', 'Solo super admins pueden crear múltiples locales'
            );
        END IF;
    END;

    -- 3. Validate slug is unique
    SELECT id INTO v_existing_store_id
    FROM stores
    WHERE slug = p_slug
    LIMIT 1;

    IF v_existing_store_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'SLUG_TAKEN',
            'message', 'Este slug ya está en uso',
            'slug', p_slug
        );
    END IF;

    -- 4. Validate currency code
    IF p_currency NOT IN ('ARS', 'USD', 'EUR', 'BRL', 'MXN', 'CLP', 'COP', 'PEN', 'UYU') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INVALID_CURRENCY',
            'message', 'Moneda no soportada',
            'currency', p_currency
        );
    END IF;

    -- 5. Create the store
    INSERT INTO stores (
        name,
        slug,
        currency,
        timezone,
        service_mode,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        p_name,
        p_slug,
        p_currency,
        p_timezone,
        p_service_mode,
        TRUE,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_new_store_id;

    -- 6. Create default storage location (warehouse)
    INSERT INTO storage_locations (
        store_id,
        name,
        type,
        is_default,
        created_at
    ) VALUES (
        v_new_store_id,
        'Almacén Principal',
        'base',
        TRUE,
        NOW()
    )
    RETURNING id INTO v_default_location_id;

    -- 7. Create default zone
    INSERT INTO venue_zones (
        store_id,
        name,
        color,
        created_at
    ) VALUES (
        v_new_store_id,
        'Zona Principal',
        '#3B82F6',
        NOW()
    )
    RETURNING id INTO v_default_zone_id;

    -- 8. Update user's profile to set store_id and role
    UPDATE profiles
    SET
        store_id = v_new_store_id,
        role = CASE
            WHEN role = 'super_admin' THEN 'super_admin' -- Keep super_admin
            ELSE 'store_owner' -- Set as owner
        END,
        updated_at = NOW()
    WHERE id = v_user_id;

    -- 9. Create default categories (optional but recommended)
    INSERT INTO categories (store_id, name, icon, color, sort_order)
    VALUES
        (v_new_store_id, 'Bebidas Calientes', 'coffee', '#F59E0B', 1),
        (v_new_store_id, 'Bebidas Frías', 'glass-water', '#3B82F6', 2),
        (v_new_store_id, 'Comida', 'utensils', '#EF4444', 3),
        (v_new_store_id, 'Postres', 'cake-candles', '#EC4899', 4);

    RAISE NOTICE 'Store created successfully: %', v_new_store_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'store_id', v_new_store_id,
        'default_location_id', v_default_location_id,
        'default_zone_id', v_default_zone_id,
        'message', 'Tienda creada exitosamente'
    );
END;
$$;

COMMENT ON FUNCTION public.create_store IS
'Creates a new store with default setup (storage location, zone, categories). Only super_admin can create multiple stores.';

-- PART 2: Grant execution permission
-- =============================================
GRANT EXECUTE ON FUNCTION public.create_store TO authenticated;

-- PART 3: Verification
-- =============================================
SELECT
    proname AS function_name,
    pronargs AS arg_count,
    pg_get_function_arguments(oid) AS arguments
FROM pg_proc
WHERE proname = 'create_store'
AND pronamespace = 'public'::regnamespace;

RAISE NOTICE '✅ P1-6 COMPLETED: create_store() RPC created';
RAISE NOTICE 'Usage: SELECT create_store(''Mi Café'', ''mi-cafe'', ''ARS'', ''America/Argentina/Buenos_Aires'')';
