-- =============================================
-- ADD STORE_ID VALIDATION TO SECURITY DEFINER FUNCTIONS
-- Fecha: 2026-02-13
-- Issue: 16 SECURITY DEFINER functions lack multi-tenant isolation
-- Priority: CRITICAL - Prevents cross-store data access
-- =============================================

-- PART 1: Fix complete_wallet_payment - CRITICAL
CREATE OR REPLACE FUNCTION public.complete_wallet_payment(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_order_store_id UUID;
BEGIN
    -- 1. Get authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'UNAUTHORIZED',
            'message', 'Usuario no autenticado'
        );
    END IF;

    -- 2. Get user's store_id
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = v_user_id;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'NO_STORE',
            'message', 'Usuario no tiene tienda asignada'
        );
    END IF;

    -- 3. Verify order belongs to user's store
    SELECT store_id INTO v_order_store_id
    FROM orders
    WHERE id = p_order_id;

    IF v_order_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'ORDER_NOT_FOUND',
            'message', 'Orden no encontrada'
        );
    END IF;

    IF v_order_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permiso para esta operación'
        );
    END IF;

    -- 4. Complete payment
    UPDATE orders
    SET
        payment_status = 'approved',
        is_paid = true,
        status = 'paid',
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'message', 'Wallet payment completed');
END;
$$;

-- PART 2: Fix end_session - CRITICAL
CREATE OR REPLACE FUNCTION public.end_session(
    p_session_id uuid,
    p_reason text DEFAULT 'manual'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_session_store_id UUID;
BEGIN
    -- 1. Get authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'UNAUTHORIZED',
            'message', 'Usuario no autenticado'
        );
    END IF;

    -- 2. Get user's store_id
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = v_user_id;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'NO_STORE',
            'message', 'Usuario no tiene tienda asignada'
        );
    END IF;

    -- 3. Verify session belongs to user's store
    SELECT store_id INTO v_session_store_id
    FROM client_sessions
    WHERE id = p_session_id;

    IF v_session_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'SESSION_NOT_FOUND',
            'message', 'Sesión no encontrada'
        );
    END IF;

    IF v_session_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permiso para esta operación'
        );
    END IF;

    -- 4. End session
    UPDATE client_sessions
    SET is_active = false, ended_at = now(), end_reason = p_reason
    WHERE id = p_session_id AND is_active = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Session not found or already ended');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- PART 3: Fix confirm_order_delivery - CRITICAL
CREATE OR REPLACE FUNCTION public.confirm_order_delivery(
    p_order_id uuid,
    p_staff_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_order_store_id UUID;
    v_staff_store_id UUID;
BEGIN
    -- 1. Get authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'UNAUTHORIZED',
            'message', 'Usuario no autenticado'
        );
    END IF;

    -- 2. Get user's store_id
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = v_user_id;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'NO_STORE',
            'message', 'Usuario no tiene tienda asignada'
        );
    END IF;

    -- 3. Verify order belongs to user's store
    SELECT store_id INTO v_order_store_id
    FROM orders
    WHERE id = p_order_id;

    IF v_order_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'ORDER_NOT_FOUND',
            'message', 'Pedido no encontrado'
        );
    END IF;

    IF v_order_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permiso para esta operación'
        );
    END IF;

    -- 4. Verify staff belongs to same store
    SELECT store_id INTO v_staff_store_id
    FROM profiles
    WHERE id = p_staff_id;

    IF v_staff_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INVALID_STAFF',
            'message', 'Staff no pertenece a esta tienda'
        );
    END IF;

    -- 5. Confirm delivery
    UPDATE orders
    SET status = 'served',
        delivery_status = 'delivered',
        delivered_at = NOW(),
        delivered_by = p_staff_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'message', 'Pedido entregado y stock descontado');
END;
$$;

-- PART 4: Fix close_cash_session - HIGH PRIORITY
CREATE OR REPLACE FUNCTION public.close_cash_session(
    p_session_id uuid,
    p_real_cash numeric,
    p_notes text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_session_store_id UUID;
    v_expected_cash NUMERIC;
    v_difference NUMERIC;
BEGIN
    -- 1. Get authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'UNAUTHORIZED',
            'message', 'Usuario no autenticado'
        );
    END IF;

    -- 2. Get user's store_id
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = v_user_id;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'NO_STORE',
            'message', 'Usuario no tiene tienda asignada'
        );
    END IF;

    -- 3. Verify cash session belongs to user's store
    SELECT store_id, expected_cash INTO v_session_store_id, v_expected_cash
    FROM cash_sessions
    WHERE id = p_session_id;

    IF v_session_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'SESSION_NOT_FOUND',
            'message', 'Sesión de caja no encontrada'
        );
    END IF;

    IF v_session_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permiso para esta operación'
        );
    END IF;

    -- 4. Calculate difference
    v_difference := p_real_cash - v_expected_cash;

    -- 5. Close session
    UPDATE cash_sessions
    SET
        status = 'closed',
        real_cash = p_real_cash,
        difference = v_difference,
        closed_at = NOW(),
        closure_notes = p_notes
    WHERE id = p_session_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'difference', v_difference,
        'message', 'Sesión de caja cerrada correctamente'
    );
END;
$$;

-- PART 5: Fix admin_add_balance - HIGH PRIORITY
CREATE OR REPLACE FUNCTION public.admin_add_balance(
    p_client_id uuid,
    p_amount numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_client_store_id UUID;
    v_new_balance NUMERIC;
    v_user_role TEXT;
BEGIN
    -- 1. Get authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'UNAUTHORIZED',
            'message', 'Usuario no autenticado'
        );
    END IF;

    -- 2. Get user's store_id and role
    SELECT store_id, role INTO v_store_id, v_user_role
    FROM profiles
    WHERE id = v_user_id;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'NO_STORE',
            'message', 'Usuario no tiene tienda asignada'
        );
    END IF;

    -- 3. Verify user has admin permissions
    IF v_user_role NOT IN ('owner', 'admin', 'superadmin') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INSUFFICIENT_PERMISSIONS',
            'message', 'Solo administradores pueden agregar saldo'
        );
    END IF;

    -- 4. Verify client belongs to user's store
    SELECT store_id INTO v_client_store_id
    FROM clients
    WHERE id = p_client_id;

    IF v_client_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'CLIENT_NOT_FOUND',
            'message', 'Cliente no encontrado'
        );
    END IF;

    IF v_client_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permiso para esta operación'
        );
    END IF;

    -- 5. Calculate new balance
    SELECT COALESCE(wallet_balance, 0) + p_amount INTO v_new_balance
    FROM clients
    WHERE id = p_client_id;

    -- 6. Insert into wallet_ledger (trigger will update clients.wallet_balance)
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        amount,
        balance_after,
        entry_type,
        reference_type,
        reference_id,
        description,
        performed_by,
        source,
        payment_method,
        idempotency_key
    ) VALUES (
        p_client_id,
        v_store_id,
        p_amount,
        v_new_balance,
        'admin_credit',
        'admin_operation',
        gen_random_uuid(),
        'Admin manual credit',
        v_user_id,
        'admin',
        'manual',
        'admin_add_balance_' || gen_random_uuid()::text
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'new_balance', v_new_balance,
        'message', 'Saldo agregado correctamente'
    );
END;
$$;

-- PART 6: Fix admin_add_balance_v2 - HIGH PRIORITY
CREATE OR REPLACE FUNCTION public.admin_add_balance_v2(
    p_client_id uuid,
    p_amount numeric,
    p_description text DEFAULT 'Admin credit'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_client_store_id UUID;
    v_new_balance NUMERIC;
    v_user_role TEXT;
    v_entry_id UUID;
BEGIN
    -- 1. Get authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'UNAUTHORIZED',
            'message', 'Usuario no autenticado'
        );
    END IF;

    -- 2. Get user's store_id and role
    SELECT store_id, role INTO v_store_id, v_user_role
    FROM profiles
    WHERE id = v_user_id;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'NO_STORE',
            'message', 'Usuario no tiene tienda asignada'
        );
    END IF;

    -- 3. Verify user has admin permissions
    IF v_user_role NOT IN ('owner', 'admin', 'superadmin') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INSUFFICIENT_PERMISSIONS',
            'message', 'Solo administradores pueden agregar saldo'
        );
    END IF;

    -- 4. Verify client belongs to user's store
    SELECT store_id INTO v_client_store_id
    FROM clients
    WHERE id = p_client_id;

    IF v_client_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'CLIENT_NOT_FOUND',
            'message', 'Cliente no encontrado'
        );
    END IF;

    IF v_client_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permiso para esta operación'
        );
    END IF;

    -- 5. Calculate new balance
    SELECT COALESCE(wallet_balance, 0) + p_amount INTO v_new_balance
    FROM clients
    WHERE id = p_client_id;

    -- 6. Insert into wallet_ledger (trigger will update clients.wallet_balance)
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        amount,
        balance_after,
        entry_type,
        reference_type,
        reference_id,
        description,
        performed_by,
        source,
        payment_method,
        idempotency_key
    ) VALUES (
        p_client_id,
        v_store_id,
        p_amount,
        v_new_balance,
        'admin_credit',
        'admin_operation',
        gen_random_uuid(),
        p_description,
        v_user_id,
        'admin',
        'manual',
        'admin_add_balance_v2_' || gen_random_uuid()::text
    ) RETURNING id INTO v_entry_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'new_balance', v_new_balance,
        'ledger_entry_id', v_entry_id,
        'message', 'Saldo agregado correctamente'
    );
END;
$$;

-- PART 7: Fix transfer_stock - HIGH PRIORITY
CREATE OR REPLACE FUNCTION public.transfer_stock(
    p_item_id uuid,
    p_from_location_id uuid,
    p_to_location_id uuid,
    p_quantity numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_item_store_id UUID;
    v_from_location_store_id UUID;
    v_to_location_store_id UUID;
BEGIN
    -- 1. Get authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'UNAUTHORIZED',
            'message', 'Usuario no autenticado'
        );
    END IF;

    -- 2. Get user's store_id
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = v_user_id;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'NO_STORE',
            'message', 'Usuario no tiene tienda asignada'
        );
    END IF;

    -- 3. Verify inventory item belongs to user's store
    SELECT store_id INTO v_item_store_id
    FROM inventory_items
    WHERE id = p_item_id;

    IF v_item_store_id IS NULL OR v_item_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'Item no pertenece a tu tienda'
        );
    END IF;

    -- 4. Verify both locations belong to user's store
    SELECT store_id INTO v_from_location_store_id
    FROM storage_locations
    WHERE id = p_from_location_id;

    SELECT store_id INTO v_to_location_store_id
    FROM storage_locations
    WHERE id = p_to_location_id;

    IF v_from_location_store_id != v_store_id OR v_to_location_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'Las ubicaciones no pertenecen a tu tienda'
        );
    END IF;

    -- 5. Perform stock transfer (delegate to existing safe function)
    RETURN transfer_stock_between_locations(
        p_item_id,
        p_from_location_id,
        p_to_location_id,
        p_quantity,
        v_user_id
    );
END;
$$;

-- PART 8: Grant permissions
GRANT EXECUTE ON FUNCTION complete_wallet_payment TO authenticated;
GRANT EXECUTE ON FUNCTION end_session TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_order_delivery TO authenticated;
GRANT EXECUTE ON FUNCTION close_cash_session TO authenticated;
GRANT EXECUTE ON FUNCTION admin_add_balance TO authenticated;
GRANT EXECUTE ON FUNCTION admin_add_balance_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_stock TO authenticated;

-- PART 9: Verification queries
-- Run these after applying migration

-- 1. Verify functions have SET search_path
SELECT
    p.proname,
    pg_get_function_identity_arguments(p.oid) as args,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security,
    pg_get_function_arguments(p.oid) LIKE '%search_path%' as has_search_path
FROM pg_proc p
WHERE p.proname IN (
    'complete_wallet_payment',
    'end_session',
    'confirm_order_delivery',
    'close_cash_session',
    'admin_add_balance',
    'admin_add_balance_v2',
    'transfer_stock'
)
ORDER BY p.proname;

-- 2. Test store isolation (should fail for cross-store access)
-- SELECT complete_wallet_payment('<order_from_different_store>');
-- Expected: PERMISSION_DENIED error

-- =============================================
-- END OF MIGRATION
-- Next: Fix mutable search_path on 12 remaining functions
-- =============================================
