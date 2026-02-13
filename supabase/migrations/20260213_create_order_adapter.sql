-- ============================================
-- ADAPTER: create_order() → create_order_secure()
-- ============================================
-- Migration: 20260213_create_order_adapter.sql
-- Purpose: Create adapter function for legacy frontend calls to create_order()
-- Issue: Frontend calls create_order() but DB only has create_order_secure() with different signature
-- Solution: Create adapter that maps legacy parameters to new secure function

-- Drop existing function first
DROP FUNCTION IF EXISTS create_order(uuid,jsonb,text,text,text,text,uuid,uuid);

CREATE OR REPLACE FUNCTION create_order(
    p_store_id UUID,
    p_items JSONB,
    p_channel TEXT DEFAULT 'pos',
    p_table_number TEXT DEFAULT NULL,
    p_location_identifier TEXT DEFAULT NULL,
    p_delivery_mode TEXT DEFAULT 'local',
    p_source_location_id UUID DEFAULT NULL,
    p_node_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_client_id UUID;
    v_result JSONB;
BEGIN
    -- 1. Obtener client_id del usuario autenticado en este store
    SELECT id INTO v_client_id
    FROM clients
    WHERE auth_user_id = auth.uid()
      AND store_id = p_store_id
    LIMIT 1;

    -- 2. Si no existe cliente, crear uno automáticamente (guest)
    IF v_client_id IS NULL THEN
        INSERT INTO clients (
            auth_user_id,
            store_id,
            full_name,
            email,
            wallet_balance,
            loyalty_points
        )
        VALUES (
            auth.uid(),
            p_store_id,
            'Cliente',  -- Nombre por defecto
            (SELECT email FROM auth.users WHERE id = auth.uid()),
            0,
            0
        )
        RETURNING id INTO v_client_id;

        RAISE NOTICE 'Created new client: %', v_client_id;
    END IF;

    -- 3. Llamar a create_order_secure con parámetros mapeados
    SELECT create_order_secure(
        p_store_id := p_store_id,
        p_client_id := v_client_id,
        p_node_id := p_node_id,
        p_channel := p_channel,
        p_payment_method := 'pending',  -- Se actualiza después
        p_order_items := p_items,       -- Mapear p_items → p_order_items
        p_customer_name := NULL,
        p_customer_email := NULL,
        p_table_number := p_table_number
    ) INTO v_result;

    RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order TO authenticated;

COMMENT ON FUNCTION create_order IS 'Adapter function for legacy frontend calls. Maps to create_order_secure().';
