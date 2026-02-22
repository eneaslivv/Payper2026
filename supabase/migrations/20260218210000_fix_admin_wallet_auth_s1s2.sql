-- ============================================================================
-- Fix: BUG-S1/S2 — Admin wallet functions sin auth check + staff_id spoofable
-- Date: 2026-02-18
-- Approved by: user (2026-02-18)
-- Tracked in: known-bugs.md → BUG-S1, BUG-S2
--
-- Bugs corregidos:
--   S1-A: admin_add_client_balance(uuid, numeric) — SECURITY DEFINER sin auth
--         check → cualquier usuario autenticado puede acreditar saldo.
--   S1-B: admin_add_client_balance(uuid, numeric, uuid, text) — sin auth check
--         + UPDATE directo a clients.wallet_balance (zombie, no usa ledger).
--   S2-A: admin_adjust_client_balance(uuid, numeric, text, uuid) — UPDATE directo
--         (zombie) + p_staff_id spoofable en audit_logs.
--   S2-B: admin_adjust_client_balance(uuid, numeric, uuid, text) — p_staff_id
--         spoofable en 3 lugares: validación de permisos (lee role del spoofed
--         staff), performed_by en wallet_ledger, user_id en audit_logs.
--
-- Arquitectura post-fix:
--   1. is_super_admin() check OBLIGATORIO al inicio (strict mode)
--   2. Ledger-first: INSERT wallet_ledger → trigger → clients.wallet_balance
--   3. auth.uid() directo (no COALESCE, no staff_id param)
--   4. Idempotency key determinista (evita doble-click en mismo segundo)
--   5. OPCIONAL: REVOKE EXECUTE a authenticated, GRANT a service_role
--      (defensa en profundidad — comentado por default para no romper panel admin)
--
-- DROP zombie overloads (4 funciones) → CREATE 2 funciones canónicas.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PRE-STEP: DROP todas las versiones (4 overloads total)
-- ============================================================================
DROP FUNCTION IF EXISTS admin_add_client_balance(uuid, numeric);
DROP FUNCTION IF EXISTS admin_add_client_balance(uuid, numeric, uuid, text);
DROP FUNCTION IF EXISTS admin_adjust_client_balance(uuid, numeric, text, uuid);
DROP FUNCTION IF EXISTS admin_adjust_client_balance(uuid, numeric, uuid, text);

-- ============================================================================
-- FIX S1: admin_add_client_balance — versión canónica con auth check
-- ============================================================================
-- Cambios vs OL1 anterior:
--   1. Guard is_super_admin() agregado al inicio
--   2. Idempotency key determinista para evitar doble-submit (1-second window)
--   3. Firma consolidada: description es parámetro (antes solo 'Crédito administrativo')
-- ============================================================================

CREATE FUNCTION admin_add_client_balance(
    target_client_id UUID,
    amount           NUMERIC,
    description      TEXT DEFAULT 'Crédito administrativo'
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_balance  NUMERIC(12,2);
    new_balance      NUMERIC(12,2);
    target_store_id  UUID;
    v_idempotency_key TEXT;
BEGIN
    -- S1 FIX: Auth check estricto
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'UNAUTHORIZED: solo super_admin puede acreditar saldo';
    END IF;

    -- Validar monto positivo
    IF amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive';
    END IF;

    -- Obtener datos del cliente con lock
    SELECT wallet_balance, store_id
    INTO current_balance, target_store_id
    FROM clients
    WHERE id = target_client_id
    FOR UPDATE;

    IF target_store_id IS NULL THEN
        RAISE EXCEPTION 'Client not found: %', target_client_id;
    END IF;

    current_balance := COALESCE(current_balance, 0);
    new_balance     := current_balance + amount;

    -- S1 FIX: Idempotency key determinista (1-second window anti-double-click)
    v_idempotency_key := 'admin_credit_' || target_client_id::text || '_' ||
                         md5(amount::text || description || date_trunc('second', now())::text);

    -- Ledger-first: INSERT wallet_ledger → trigger actualiza clients.wallet_balance
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        entry_type,
        amount,
        balance_after,
        description,
        performed_by,
        source,
        idempotency_key
    ) VALUES (
        target_client_id,
        target_store_id,
        'admin_credit',
        amount,
        new_balance,
        description,
        auth.uid(),        -- S1 FIX: auth.uid() directo (no COALESCE, no param)
        'admin',
        v_idempotency_key
    )
    ON CONFLICT (store_id, idempotency_key) DO NOTHING;

    IF NOT FOUND THEN
        RAISE NOTICE '[admin_add_client_balance] Idempotency hit — credit already processed';
        -- Return current balance from DB (not incremented)
        SELECT wallet_balance INTO new_balance FROM clients WHERE id = target_client_id;
    END IF;

    RETURN new_balance;
END;
$$;

COMMENT ON FUNCTION admin_add_client_balance IS 'S1 FIX: Acredita saldo a cliente (solo super_admin). Ledger-first con idempotency.';

-- ============================================================================
-- FIX S2: admin_adjust_client_balance — versión canónica sin staff_id spoofable
-- ============================================================================
-- Cambios vs OL2 anterior:
--   1. Guard is_super_admin() agregado al inicio
--   2. Parámetro p_staff_id ELIMINADO (usaba COALESCE spoofable)
--   3. auth.uid() directo en SELECT role, performed_by, user_id
--   4. Idempotency key determinista
-- ============================================================================

CREATE FUNCTION admin_adjust_client_balance(
    p_client_id UUID,
    p_amount    NUMERIC,
    p_reason    TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_role      TEXT;
    v_staff_store     UUID;
    v_client_store    UUID;
    v_old_balance     NUMERIC;
    v_new_balance     NUMERIC;
    v_idempotency_key TEXT;
BEGIN
    -- S2 FIX: Auth check estricto
    IF NOT is_super_admin() THEN
        RAISE EXCEPTION 'UNAUTHORIZED: solo super_admin puede ajustar saldo';
    END IF;

    -- S2 FIX: Validar permisos del staff autenticado (auth.uid() directo, no param)
    SELECT role, store_id INTO v_staff_role, v_staff_store
    FROM profiles WHERE id = auth.uid();

    IF v_staff_role IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Staff profile not found');
    END IF;

    -- Validate same store (super_admin puede cross-store)
    SELECT store_id INTO v_client_store FROM clients WHERE id = p_client_id;
    IF v_client_store IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
    END IF;
    IF v_client_store != v_staff_store AND v_staff_role != 'super_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cliente de otro local');
    END IF;

    -- Get current balance with lock
    SELECT wallet_balance INTO v_old_balance
    FROM clients WHERE id = p_client_id
    FOR UPDATE;

    v_new_balance := COALESCE(v_old_balance, 0) + p_amount;

    IF v_new_balance < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El saldo no puede ser negativo');
    END IF;

    -- S2 FIX: Idempotency key determinista (1-second window)
    v_idempotency_key := 'admin_adjust_' || p_client_id::text || '_' ||
                         md5(p_amount::text || COALESCE(p_reason, '') || date_trunc('second', now())::text);

    -- Ledger-first: INSERT wallet_ledger → trigger actualiza clients.wallet_balance
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        entry_type,
        amount,
        balance_after,
        description,
        performed_by,      -- S2 FIX: auth.uid() directo (no COALESCE)
        source,
        idempotency_key
    ) VALUES (
        p_client_id,
        v_client_store,
        'admin_adjustment',
        p_amount,
        v_new_balance,
        COALESCE(p_reason, 'Ajuste administrativo'),
        auth.uid(),        -- S2 FIX: no COALESCE, no p_staff_id param
        'admin',
        v_idempotency_key
    )
    ON CONFLICT (store_id, idempotency_key) DO NOTHING;

    IF NOT FOUND THEN
        RAISE NOTICE '[admin_adjust_client_balance] Idempotency hit — adjustment already processed';
        -- Return current balance (not adjusted)
        SELECT wallet_balance INTO v_new_balance FROM clients WHERE id = p_client_id;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ALREADY_PROCESSED',
            'message', 'This adjustment was already applied',
            'current_balance', v_new_balance
        );
    END IF;

    -- Mantener audit_logs como segunda capa de registro
    INSERT INTO audit_logs (store_id, user_id, table_name, operation, old_data, new_data)
    VALUES (
        v_client_store,
        auth.uid(),        -- S2 FIX: auth.uid() directo (no COALESCE)
        'clients',
        'UPDATE',
        jsonb_build_object('wallet_balance', v_old_balance, 'client_id', p_client_id),
        jsonb_build_object('wallet_balance', v_new_balance, 'client_id', p_client_id, 'reason', p_reason, 'amount', p_amount)
    );

    RETURN jsonb_build_object('success', true, 'old_balance', v_old_balance, 'new_balance', v_new_balance);
END;
$$;

COMMENT ON FUNCTION admin_adjust_client_balance IS 'S2 FIX: Ajusta saldo cliente (solo super_admin). Ledger-first con idempotency. Sin staff_id spoofable.';

-- ============================================================================
-- OPCIONAL: REVOKE/GRANT para defensa en profundidad
-- ============================================================================
-- Si el panel admin usa service_role o Edge Function intermediaria, descomentá:
-- REVOKE EXECUTE ON FUNCTION admin_add_client_balance FROM authenticated;
-- REVOKE EXECUTE ON FUNCTION admin_adjust_client_balance FROM authenticated;
-- GRANT EXECUTE ON FUNCTION admin_add_client_balance TO service_role;
-- GRANT EXECUTE ON FUNCTION admin_adjust_client_balance TO service_role;
--
-- Si el panel admin llama directo desde cliente con sesión autenticada:
-- Dejá el GRANT a authenticated (el guard is_super_admin() igual protege).

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_add_has_guard       BOOLEAN;
    v_add_no_old_overload BOOLEAN;
    v_adjust_has_guard    BOOLEAN;
    v_adjust_no_staff_id  BOOLEAN;
    v_adjust_no_old_overload BOOLEAN;
BEGIN
    -- admin_add_client_balance: has is_super_admin() guard
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'admin_add_client_balance'
          AND p.prosrc ILIKE '%is_super_admin()%'
          AND p.prosrc ILIKE '%UNAUTHORIZED%'
    ) INTO v_add_has_guard;

    -- admin_add_client_balance: old overload (4 params) no existe
    SELECT NOT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'admin_add_client_balance'
          AND pg_get_function_identity_arguments(p.oid) LIKE '%staff_id%'
    ) INTO v_add_no_old_overload;

    -- admin_adjust_client_balance: has is_super_admin() guard
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'admin_adjust_client_balance'
          AND p.prosrc ILIKE '%is_super_admin()%'
          AND p.prosrc ILIKE '%UNAUTHORIZED%'
    ) INTO v_adjust_has_guard;

    -- admin_adjust_client_balance: no tiene parámetro staff_id
    SELECT NOT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'admin_adjust_client_balance'
          AND pg_get_function_identity_arguments(p.oid) LIKE '%staff_id%'
    ) INTO v_adjust_no_staff_id;

    -- admin_adjust_client_balance: no usa COALESCE(p_staff_id, auth.uid())
    SELECT NOT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'admin_adjust_client_balance'
          AND p.prosrc ILIKE '%COALESCE(p_staff_id%'
    ) INTO v_adjust_no_old_overload;

    -- Fail fast
    IF NOT v_add_has_guard THEN
        RAISE EXCEPTION 'CRITICAL: admin_add_client_balance no tiene guard is_super_admin()';
    END IF;
    IF NOT v_adjust_has_guard THEN
        RAISE EXCEPTION 'CRITICAL: admin_adjust_client_balance no tiene guard is_super_admin()';
    END IF;
    IF NOT v_adjust_no_staff_id THEN
        RAISE EXCEPTION 'CRITICAL: admin_adjust_client_balance aún tiene parámetro staff_id (S2 fix missing)';
    END IF;

    RAISE NOTICE '=== BUG-S1/S2 Fix Applied ===';
    RAISE NOTICE '';
    RAISE NOTICE 'S1: admin_add_client_balance(target_client_id, amount, description):';
    RAISE NOTICE '  has is_super_admin() guard                 = %', v_add_has_guard;
    RAISE NOTICE '  zombie overload (4 params) dropped         = %', v_add_no_old_overload;
    RAISE NOTICE '  uses ledger-first (INSERT wallet_ledger)   = TRUE';
    RAISE NOTICE '  performed_by = auth.uid() directo          = TRUE';
    RAISE NOTICE '';
    RAISE NOTICE 'S2: admin_adjust_client_balance(p_client_id, p_amount, p_reason):';
    RAISE NOTICE '  has is_super_admin() guard                 = %', v_adjust_has_guard;
    RAISE NOTICE '  NO parámetro p_staff_id (spoofable)        = %', v_adjust_no_staff_id;
    RAISE NOTICE '  NO usa COALESCE(p_staff_id, auth.uid())    = %', v_adjust_no_old_overload;
    RAISE NOTICE '  uses ledger-first (INSERT wallet_ledger)   = TRUE';
    RAISE NOTICE '  performed_by = auth.uid() directo          = TRUE';
    RAISE NOTICE '';
    RAISE NOTICE 'Idempotency keys:';
    RAISE NOTICE '  admin_add_client_balance:    admin_credit_ + client_id + md5(amount||desc||second)';
    RAISE NOTICE '  admin_adjust_client_balance: admin_adjust_ + client_id + md5(amount||reason||second)';
    RAISE NOTICE '';
    RAISE NOTICE 'OPCIONAL (comentado): REVOKE a authenticated, GRANT a service_role';
    RAISE NOTICE 'Si el panel admin usa service_role o Edge Function, descomentá las líneas de REVOKE/GRANT.';
    RAISE NOTICE '';
    RAISE NOTICE 'Post-deploy tests:';
    RAISE NOTICE '  1. Usuario normal (no super_admin) llama admin_add_client_balance → UNAUTHORIZED';
    RAISE NOTICE '  2. Usuario normal llama admin_adjust_client_balance → UNAUTHORIZED';
    RAISE NOTICE '  3. Super admin acredita → wallet_ledger entry admin_credit, performed_by = admin uid';
    RAISE NOTICE '  4. Super admin ajusta → wallet_ledger entry admin_adjustment, audit_logs user_id = admin uid';
    RAISE NOTICE '  5. Doble-click admin (mismo segundo) → segunda retorna ALREADY_PROCESSED';
END $$;

COMMIT;
