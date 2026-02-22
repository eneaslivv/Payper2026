-- ============================================================================
-- Fix: BUG-W3 — admin_add_client_balance + admin_adjust_client_balance sin ledger
-- Date: 2026-02-18
-- Approved by: user (2026-02-18)
-- Tracked in: known-bugs.md → BUG-W3, pending-decisions.md → PD-004 (W3)
--
-- Diagnóstico:
--   Ambas funciones admin modifican clients.wallet_balance directamente
--   sin insertar en wallet_ledger. Cada crédito/ajuste manual queda sin
--   audit trail de wallet.
--
--   admin_add_client_balance: sin ledger, sin FOR UPDATE, sin auth check
--   admin_adjust_client_balance: sin ledger, tiene FOR UPDATE + role check + audit_logs
--
-- Fix:
--   Reemplazar UPDATE clients directo por INSERT wallet_ledger en ambas funciones.
--   El trigger update_wallet_balance_from_ledger() ya existe y actualiza
--   clients.wallet_balance = balance_after automáticamente.
--
--   Flujo nuevo:
--     1. SELECT wallet_balance FOR UPDATE  (lock anti-race)
--     2. Calcular new_balance
--     3. INSERT INTO wallet_ledger → trigger → UPDATE clients.wallet_balance
--
--   Se mantiene sin cambios:
--   - Firmas de ambas funciones (no rompe callers)
--   - Validación de roles en admin_adjust_client_balance
--   - audit_logs en admin_adjust_client_balance (segunda capa de log)
--   - Lógica de negocio (validaciones de monto, store, etc.)
--
--   Hallazgos secundarios documentados (NO corregidos en esta migración):
--   - BUG-S1: admin_add_client_balance sin verificación de autorización
--   - BUG-S2: p_staff_id en admin_adjust_client_balance spoofable por el caller
--
-- Reversibilidad:
--   Recrear las versiones originales (UPDATE directo) desde git history.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PRE-CHECK: Verificar que el trigger de sincronización existe
-- ============================================================================

DO $$
DECLARE
    v_trigger_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE t.tgrelid = 'wallet_ledger'::regclass
          AND p.proname = 'update_wallet_balance_from_ledger'
    ) INTO v_trigger_exists;

    IF NOT v_trigger_exists THEN
        RAISE EXCEPTION 'CRITICAL: trigger update_wallet_balance_from_ledger no existe en wallet_ledger — no se puede proceder sin el sincronizador automático';
    END IF;

    RAISE NOTICE 'PRE-CHECK: trigger update_wallet_balance_from_ledger activo en wallet_ledger ✓';
END $$;

-- ============================================================================
-- FIX 1: admin_add_client_balance — agregar FOR UPDATE + INSERT ledger
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_add_client_balance(
    target_client_id UUID,
    amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_balance NUMERIC(12,2);
    new_balance     NUMERIC(12,2);
    target_store_id UUID;
BEGIN
    -- Validar monto positivo
    IF amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive';
    END IF;

    -- Obtener datos del cliente con lock (BUG-W3 FIX: FOR UPDATE agregado)
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

    -- BUG-W3 FIX: INSERT en wallet_ledger en vez de UPDATE directo.
    -- El trigger update_wallet_balance_from_ledger() actualiza
    -- clients.wallet_balance = balance_after automáticamente.
    -- NOTE: BUG-S1 pendiente — esta función carece de verificación de autorización.
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        entry_type,
        amount,
        balance_after,
        description,
        performed_by,
        source
    ) VALUES (
        target_client_id,
        target_store_id,
        'admin_credit',
        amount,
        new_balance,
        'Crédito administrativo',
        auth.uid(),
        'admin'
    );

    RETURN new_balance;
END;
$$;

-- ============================================================================
-- FIX 2: admin_adjust_client_balance — reemplazar UPDATE por INSERT ledger
-- ============================================================================

CREATE OR REPLACE FUNCTION admin_adjust_client_balance(
    p_client_id UUID,
    p_amount    NUMERIC,
    p_staff_id  UUID    DEFAULT NULL,
    p_reason    TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_role  TEXT;
    v_staff_store UUID;
    v_client_store UUID;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Validate staff permissions
    -- NOTE: BUG-S2 pendiente — p_staff_id es spoofable por el caller.
    SELECT role, store_id INTO v_staff_role, v_staff_store
    FROM profiles WHERE id = COALESCE(p_staff_id, auth.uid());

    IF v_staff_role NOT IN ('store_owner', 'super_admin') THEN
        IF NOT EXISTS (
            SELECT 1 FROM profiles p
            JOIN store_roles cr ON cr.id = p.role_id
            WHERE p.id = COALESCE(p_staff_id, auth.uid())
              AND (cr.name ILIKE '%admin%' OR cr.name ILIKE '%manager%' OR cr.name ILIKE '%gerente%')
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Sin permisos para modificar saldo');
        END IF;
    END IF;

    -- Validate same store
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

    -- BUG-W3 FIX: INSERT en wallet_ledger en vez de UPDATE directo.
    -- El trigger update_wallet_balance_from_ledger() actualiza
    -- clients.wallet_balance = balance_after + updated_at = NOW() automáticamente.
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        entry_type,
        amount,
        balance_after,
        description,
        performed_by,
        source
    ) VALUES (
        p_client_id,
        v_client_store,
        'admin_adjustment',
        p_amount,
        v_new_balance,
        COALESCE(p_reason, 'Ajuste administrativo'),
        COALESCE(p_staff_id, auth.uid()),
        'admin'
    );

    -- Mantener audit_logs como segunda capa de registro (sin cambios)
    INSERT INTO audit_logs (store_id, user_id, table_name, operation, old_data, new_data)
    VALUES (
        v_client_store,
        COALESCE(p_staff_id, auth.uid()),
        'clients',
        'UPDATE',
        jsonb_build_object('wallet_balance', v_old_balance, 'client_id', p_client_id),
        jsonb_build_object('wallet_balance', v_new_balance, 'client_id', p_client_id, 'reason', p_reason, 'amount', p_amount)
    );

    RETURN jsonb_build_object('success', true, 'old_balance', v_old_balance, 'new_balance', v_new_balance);
END;
$$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_add_uses_ledger    BOOLEAN;
    v_adjust_uses_ledger BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_add_client_balance'
          AND p.prosrc ILIKE '%wallet_ledger%'
    ) INTO v_add_uses_ledger;

    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'admin_adjust_client_balance'
          AND p.prosrc ILIKE '%wallet_ledger%'
    ) INTO v_adjust_uses_ledger;

    IF NOT v_add_uses_ledger THEN
        RAISE EXCEPTION 'CRITICAL: admin_add_client_balance no referencia wallet_ledger';
    END IF;
    IF NOT v_adjust_uses_ledger THEN
        RAISE EXCEPTION 'CRITICAL: admin_adjust_client_balance no referencia wallet_ledger';
    END IF;

    RAISE NOTICE '=== BUG-W3 Fix Applied ===';
    RAISE NOTICE 'admin_add_client_balance: INSERT wallet_ledger + FOR UPDATE ✓';
    RAISE NOTICE 'admin_adjust_client_balance: INSERT wallet_ledger (mantiene FOR UPDATE + role check + audit_logs) ✓';
    RAISE NOTICE '';
    RAISE NOTICE 'Flujo activo: INSERT wallet_ledger → trigger update_wallet_balance_from_ledger → clients.wallet_balance';
    RAISE NOTICE '';
    RAISE NOTICE 'Bugs secundarios pendientes (no corregidos en esta migración):';
    RAISE NOTICE '  BUG-S1: admin_add_client_balance sin auth check';
    RAISE NOTICE '  BUG-S2: p_staff_id spoofable en admin_adjust_client_balance';
END $$;

COMMIT;
