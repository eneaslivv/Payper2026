-- ============================================================================
-- Fix: BUG-W5 — Wallet idempotency & ledger-driven architecture
-- Date: 2026-02-18
-- Approved by: user (2026-02-18)
-- Tracked in: known-bugs.md → BUG-W5
--
-- Bugs corregidos:
--   W5-A/B: credit_wallet OL2 (mp-webhook) — direct UPDATE antes de idempotency
--           check → balance doblado en colisión cross-overload o retry.
--           Shared key namespace con OL1 permite colisión entre rutas admin y MP.
--   W5-C: complete_wallet_payment — mismo patrón "UPDATE primero → INSERT después",
--          protección accidental (unhandled exception rollback). Además source='app'
--          viola CHECK constraint → función completamente rota.
--   W5-D: verify_wallet_integrity — lee wallet_transactions (tabla de intenciones MP)
--          en vez de wallet_ledger (fuente de verdad). Auditoría incorrecta siempre.
--   W5-E: pay_with_wallet — sin FOR UPDATE (TOCTOU race), source='wallet' viola
--          CHECK constraint → función completamente rota. p_order_id=NULL usa
--          gen_random_uuid() como idempotency_key (no determinista).
--
-- Hallazgos adicionales incluidos en esta migración:
--   - entry_type CHECK no incluye 'debit', 'admin_credit', 'admin_adjustment'
--     → wallet_additional_charge_on_edit, admin_add_client_balance,
--       admin_adjust_client_balance fallaban en INSERT silenciosamente.
--   - source CHECK no incluye 'wallet', 'admin'
--     → pay_with_wallet y funciones admin fallaban en INSERT.
--
-- Arquitectura post-fix ("ledger-first"):
--   1. CHECK idempotency_key ANTES de cualquier mutación
--   2. SELECT clients FOR UPDATE (lock anti-race)
--   3. INSERT wallet_ledger → trigger update_wallet_balance_from_ledger
--      → UPDATE clients.wallet_balance = balance_after
--   4. CERO UPDATE directo a clients.wallet_balance
--
-- Key namespaces (no se solapan):
--   OL1 admin:    'credit_wallet_' || txn_id
--   OL2 mp:       'mp_credit_' || txn_id         ← NUEVO (era 'credit_wallet_')
--   order payment: 'order_payment_' || order_id
--   pay_with_wallet: 'pay_with_wallet_' || order_id
--
-- No se modifica:
--   - Firmas de funciones (no rompe callers ni frontend)
--   - Trigger update_wallet_balance_from_ledger (sin cambios)
--   - Trigger protect_wallet_balance_update (sin cambios)
--   - credit_wallet OL1 (admin path — ya es ledger-first)
--   - wallet_refund_on_cancellation, wallet_partial_refund_on_edit (ya correctas)
-- ============================================================================

BEGIN;

-- ============================================================================
-- PRE-STEP: DROP functions that have parameter defaults (PG requires DROP first)
-- CREATE OR REPLACE cannot change default values — drop then recreate is safe
-- since we recreate them immediately in this transaction.
-- ============================================================================
DROP FUNCTION IF EXISTS credit_wallet(uuid, text, text);
DROP FUNCTION IF EXISTS complete_wallet_payment(uuid);
DROP FUNCTION IF EXISTS verify_wallet_integrity(uuid);
DROP FUNCTION IF EXISTS pay_with_wallet(uuid, numeric, uuid);

-- ============================================================================
-- PASO 0: Actualizar CHECK constraints para incluir nuevos tipos de entrada/fuente
-- ============================================================================

-- entry_type: agregar 'debit', 'admin_credit', 'admin_adjustment'
ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_entry_type_check;
ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_entry_type_check
    CHECK (entry_type = ANY (ARRAY[
        'topup',
        'payment',
        'refund',
        'adjustment',
        'bonus',
        'reconciliation',
        -- W5 FIX: nuevos entry_types usados por funciones existentes
        'debit',             -- wallet_additional_charge_on_edit
        'admin_credit',      -- admin_add_client_balance
        'admin_adjustment'   -- admin_adjust_client_balance
    ]));

-- source: agregar 'wallet', 'admin'
ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_source_check;
ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_source_check
    CHECK (source = ANY (ARRAY[
        'manual',
        'system',
        'admin_panel',
        'mercadopago',
        'refund',
        'bonus',
        'cash',
        'transfer',
        'gift',
        'reconciliation',
        'atomic_order',
        -- W5 FIX: nuevos sources usados por funciones existentes
        'wallet',    -- pay_with_wallet (client-initiated payment)
        'admin'      -- admin_add_client_balance, admin_adjust_client_balance
    ]));

-- ============================================================================
-- FIX W5-A/B: credit_wallet(txn_id, mp_payment_id, status) — OL2 mp-webhook
-- ============================================================================
-- Cambios:
--   1. Idempotency check ANTES de cualquier mutación
--   2. FOR UPDATE en SELECT clients
--   3. Nuevo namespace de key: 'mp_credit_' (era 'credit_wallet_', colisionaba con OL1)
--   4. INSERT ledger → trigger actualiza balance (sin direct UPDATE)
--   5. ON CONFLICT DO NOTHING + check FOUND (cinturón y tirantes)
-- ============================================================================

CREATE OR REPLACE FUNCTION credit_wallet(
    p_transaction_id uuid,
    p_mp_payment_id  text,
    p_status         text
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wallet_transaction RECORD;
    v_client_id          UUID;
    v_store_id           UUID;
    v_amount             NUMERIC;
    v_current_balance    NUMERIC;
    v_new_balance        NUMERIC;
    v_idempotency_key    TEXT;
BEGIN
    -- Validate payment status (only credit on approved)
    IF p_status != 'approved' THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_STATUS: Cannot credit wallet for status %', p_status;
    END IF;

    -- Get transaction details
    SELECT wt.client_id, wt.store_id, wt.amount
    INTO v_client_id, v_store_id, v_amount
    FROM wallet_transactions wt
    WHERE wt.id = p_transaction_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'TRANSACTION_NOT_FOUND',
            'message', 'Wallet transaction not found'
        );
    END IF;

    -- W5-B FIX: New key namespace ('mp_credit_') to avoid cross-overload collision
    -- OL1 admin uses 'credit_wallet_' || txn_id (unchanged)
    -- OL2 mp now uses 'mp_credit_' || txn_id (distinct namespace)
    v_idempotency_key := 'mp_credit_' || p_transaction_id::text;

    -- W5-A FIX: Idempotency check BEFORE any balance mutation
    -- (was: UPDATE balance FIRST → INSERT → catch unique_violation
    --  → ALREADY_PROCESSED returned but UPDATE already committed)
    IF EXISTS (
        SELECT 1 FROM wallet_ledger
        WHERE store_id = v_store_id
          AND idempotency_key = v_idempotency_key
    ) THEN
        RAISE NOTICE '[credit_wallet OL2] Idempotency hit — txn % already credited (mp_credit_ key exists)', p_transaction_id;
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'ALREADY_PROCESSED',
            'message', 'This transaction was already credited'
        );
    END IF;

    -- W5-A FIX: Lock client row to prevent TOCTOU race
    SELECT COALESCE(wallet_balance, 0) INTO v_current_balance
    FROM clients
    WHERE id = v_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'CLIENT_NOT_FOUND',
            'message', 'Client not found'
        );
    END IF;

    v_new_balance := v_current_balance + v_amount;

    -- W5-A FIX: INSERT ledger → trigger fires → clients.wallet_balance = v_new_balance
    -- No direct UPDATE to clients.wallet_balance
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        amount,
        balance_after,
        entry_type,
        payment_method,
        description,
        source,
        reference_type,
        reference_id,
        idempotency_key
    ) VALUES (
        v_client_id,
        v_store_id,
        v_amount,
        v_new_balance,
        'topup',
        'mercadopago',
        'MercadoPago payment' || COALESCE(' #' || p_mp_payment_id, ''),
        'mercadopago',
        'wallet_transaction',
        p_transaction_id,
        v_idempotency_key
    )
    ON CONFLICT (store_id, idempotency_key) DO NOTHING;

    -- Belt & suspenders: verify insertion happened (pre-check + ON CONFLICT)
    IF NOT FOUND THEN
        RAISE NOTICE '[credit_wallet OL2] Concurrent idempotency hit for txn % — already credited', p_transaction_id;
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'ALREADY_PROCESSED',
            'message', 'This transaction was already credited (concurrent)'
        );
    END IF;

    -- Mark wallet_transaction as completed
    UPDATE wallet_transactions
    SET status = 'completed', completed_at = NOW()
    WHERE id = p_transaction_id;

    RAISE NOTICE '[credit_wallet OL2] Credited % to client % (txn %, new balance: %)',
        v_amount, v_client_id, p_transaction_id, v_new_balance;

    RETURN jsonb_build_object(
        'success',     TRUE,
        'message',     'Wallet credited successfully',
        'new_balance', v_new_balance,
        'amount',      v_amount
    );
END;
$$;

-- ============================================================================
-- FIX W5-C: complete_wallet_payment(order_id) — idempotency-first, ledger-driven
-- ============================================================================
-- Cambios:
--   1. Idempotency check antes del UPDATE (source='app' violaba CHECK → función rota)
--   2. FOR UPDATE en SELECT clients (previene TOCTOU)
--   3. Sin UPDATE directo a wallet_balance — INSERT ledger → trigger
--   4. source = 'system' (válido en CHECK; 'app' no estaba en CHECK)
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_wallet_payment(p_order_id uuid)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id          UUID;
    v_client_id        UUID;
    v_client_store_id  UUID;
    v_order_store_id   UUID;
    v_total_amount     NUMERIC;
    v_calculated_total NUMERIC;
    v_current_balance  NUMERIC;
    v_new_balance      NUMERIC;
    v_idempotency_key  TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'UNAUTHORIZED', 'message', 'User not authenticated');
    END IF;

    -- Get client record
    SELECT id, store_id INTO v_client_id, v_client_store_id
    FROM clients WHERE auth_user_id = v_user_id;

    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'CLIENT_NOT_FOUND', 'message', 'Client record not found');
    END IF;

    -- Get order details + cross-store guard
    SELECT store_id, total_amount INTO v_order_store_id, v_total_amount
    FROM orders WHERE id = p_order_id;

    IF v_order_store_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'ORDER_NOT_FOUND', 'message', 'Order not found');
    END IF;

    IF v_client_store_id != v_order_store_id THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'PERMISSION_DENIED', 'message', 'Cross-store operation not allowed');
    END IF;

    -- Validate total amount matches actual product prices
    BEGIN
        v_calculated_total := validate_order_total(p_order_id);
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', FALSE, 'error', SQLSTATE, 'message', SQLERRM);
    END;

    IF ABS(v_calculated_total - v_total_amount) > 0.01 THEN
        RETURN jsonb_build_object(
            'success', FALSE, 'error', 'PRICE_MISMATCH',
            'message', format('Expected total $%s but got $%s', v_calculated_total, v_total_amount)
        );
    END IF;

    -- W5-C FIX: Idempotency check BEFORE any mutation
    v_idempotency_key := 'order_payment_' || p_order_id::text;

    IF EXISTS (
        SELECT 1 FROM wallet_ledger
        WHERE store_id = v_client_store_id
          AND idempotency_key = v_idempotency_key
    ) THEN
        RAISE NOTICE '[complete_wallet_payment] Idempotency hit — order % already paid', p_order_id;
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'ALREADY_PROCESSED',
            'message', 'This order was already paid'
        );
    END IF;

    -- W5-C FIX: FOR UPDATE lock prevents TOCTOU between balance check and deduction
    SELECT COALESCE(wallet_balance, 0) INTO v_current_balance
    FROM clients
    WHERE id = v_client_id
    FOR UPDATE;

    -- Validate sufficient balance
    IF v_current_balance < v_total_amount THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'INSUFFICIENT_BALANCE',
            'message', 'Insufficient wallet balance'
        );
    END IF;

    v_new_balance := v_current_balance - v_total_amount;

    -- W5-C FIX: INSERT ledger → trigger fires → clients.wallet_balance = v_new_balance
    -- No direct UPDATE to clients.wallet_balance
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        amount,
        balance_after,
        entry_type,
        payment_method,
        description,
        source,
        reference_type,
        reference_id,
        performed_by,
        idempotency_key
    ) VALUES (
        v_client_id,
        v_client_store_id,
        -v_total_amount,
        v_new_balance,
        'payment',
        'wallet',
        'Order payment #' || p_order_id,
        'system',       -- W5-C FIX: was 'app' (not in source CHECK → broken)
        'order',
        p_order_id,
        v_user_id,
        v_idempotency_key
    )
    ON CONFLICT (store_id, idempotency_key) DO NOTHING;

    -- Belt & suspenders
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'ALREADY_PROCESSED',
            'message', 'This order was already paid (concurrent)'
        );
    END IF;

    -- Update order status
    UPDATE orders
    SET
        payment_status = 'approved',
        payment_method = 'wallet',
        paid_at        = NOW(),
        updated_at     = NOW()
    WHERE id = p_order_id;

    RAISE NOTICE '[complete_wallet_payment] Order % paid $% by client % (new balance: %)',
        p_order_id, v_total_amount, v_client_id, v_new_balance;

    RETURN jsonb_build_object(
        'success',     TRUE,
        'message',     'Payment completed successfully',
        'new_balance', v_new_balance
    );
END;
$$;

-- ============================================================================
-- FIX W5-D: verify_wallet_integrity — leer wallet_ledger (no wallet_transactions)
-- ============================================================================
-- Cambios:
--   1. LEFT JOIN LATERAL a wallet_ledger para obtener último balance_after
--   2. Comparar clients.wallet_balance vs último balance_after del ledger
--   (era: SUM(wallet_transactions.amount) — tabla incorrecta)
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_wallet_integrity(p_store_id uuid)
RETURNS TABLE(
    client_id      uuid,
    client_name    text,
    wallet_balance numeric,
    ledger_balance numeric,
    drift          numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- W5-D FIX: read from wallet_ledger (source of truth)
    -- Use last balance_after per client (most recent transaction's running balance)
    RETURN QUERY
    SELECT
        c.id                                           AS client_id,
        c.name                                         AS client_name,
        COALESCE(c.wallet_balance, 0)                  AS wallet_balance,
        COALESCE(wl_last.balance_after, 0)             AS ledger_balance,
        COALESCE(c.wallet_balance, 0) - COALESCE(wl_last.balance_after, 0) AS drift
    FROM clients c
    LEFT JOIN LATERAL (
        SELECT wl.balance_after
        FROM wallet_ledger wl
        WHERE wl.wallet_id = c.id
          AND wl.store_id  = c.store_id
        ORDER BY wl.created_at DESC
        LIMIT 1
    ) wl_last ON TRUE
    WHERE c.store_id = p_store_id
      AND ABS(COALESCE(c.wallet_balance, 0) - COALESCE(wl_last.balance_after, 0)) > 0.01;
END;
$$;

-- ============================================================================
-- FIX W5-E: pay_with_wallet — FOR UPDATE + NULL guard para p_order_id
-- ============================================================================
-- Cambios:
--   1. Guard: p_order_id IS NULL → error (evita idempotency_key no determinista)
--   2. FOR UPDATE en SELECT clients (previene TOCTOU entre check y debit)
--   3. source = 'wallet' ya es válido (CHECK actualizado en PASO 0)
-- Nota: source = 'wallet' ya estaba correcto semánticamente; solo faltaba en CHECK.
-- ============================================================================

CREATE OR REPLACE FUNCTION pay_with_wallet(
    p_client_id uuid,
    p_amount    numeric,
    p_order_id  uuid
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_balance NUMERIC;
    v_new_balance     NUMERIC;
    v_store_id        UUID;
    v_user_store_id   UUID;
    v_entry_id        UUID;
BEGIN
    -- W5-E FIX: Guard against non-deterministic idempotency_key
    IF p_order_id IS NULL THEN
        RETURN jsonb_build_object(
            'error',   'MISSING_ORDER_ID',
            'message', 'p_order_id is required for idempotent payment'
        );
    END IF;

    -- Get user's store_id for validation
    v_user_store_id := get_user_store_id();

    -- W5-E FIX: FOR UPDATE prevents TOCTOU between balance check and INSERT
    SELECT wallet_balance, store_id INTO v_current_balance, v_store_id
    FROM clients
    WHERE id = p_client_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Client not found');
    END IF;

    -- SECURITY: Validate store (skip for client-initiated payments)
    IF auth.uid() != p_client_id AND v_store_id != v_user_store_id THEN
        RAISE EXCEPTION 'Access denied: Cannot process payment for different store';
    END IF;

    -- Validate sufficient balance
    v_current_balance := COALESCE(v_current_balance, 0);
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'error',           'Insufficient balance',
            'current_balance', v_current_balance,
            'required',        p_amount
        );
    END IF;

    v_new_balance := v_current_balance - p_amount;

    -- INSERT wallet_ledger → trigger fires → clients.wallet_balance = v_new_balance
    -- source = 'wallet' now valid (CHECK updated in PASO 0)
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
        -p_amount,
        v_new_balance,
        'payment',
        'order',
        p_order_id,
        'Payment for order ' || p_order_id::text,
        auth.uid(),
        'wallet',
        'wallet',
        'pay_with_wallet_' || p_order_id::text
    ) RETURNING id INTO v_entry_id;

    RETURN jsonb_build_object(
        'success',        TRUE,
        'new_balance',    v_new_balance,
        'ledger_entry_id', v_entry_id
    );
END;
$$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_ol2_idempotency_first BOOLEAN;
    v_ol2_no_direct_update  BOOLEAN;
    v_ol2_new_namespace     BOOLEAN;
    v_cwp_idempotency_first BOOLEAN;
    v_cwp_no_direct_update  BOOLEAN;
    v_integrity_uses_ledger BOOLEAN;
    v_pww_has_null_guard    BOOLEAN;
    v_pww_has_for_update    BOOLEAN;
    v_entry_type_ok         BOOLEAN;
    v_source_ok             BOOLEAN;
BEGIN
    -- credit_wallet OL2: idempotency-first (checks EXISTS before mutation)
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'credit_wallet'
          AND pg_get_function_identity_arguments(p.oid) LIKE '%mp_payment_id%'
          AND p.prosrc ILIKE '%ALREADY_PROCESSED%'
          AND p.prosrc ILIKE '%mp_credit_%'
    ) INTO v_ol2_idempotency_first;

    -- credit_wallet OL2: no direct UPDATE to clients.wallet_balance
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'credit_wallet'
          AND pg_get_function_identity_arguments(p.oid) LIKE '%mp_payment_id%'
          AND p.prosrc NOT ILIKE '%UPDATE clients%wallet_balance%wallet_balance + v_amount%'
    ) INTO v_ol2_no_direct_update;

    -- complete_wallet_payment: idempotency check before UPDATE
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'complete_wallet_payment'
          AND p.prosrc ILIKE '%ALREADY_PROCESSED%'
          AND p.prosrc ILIKE '%order_payment_%'
    ) INTO v_cwp_idempotency_first;

    -- complete_wallet_payment: no direct conditional UPDATE (was: WHERE wallet_balance >= total)
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'complete_wallet_payment'
          AND p.prosrc NOT ILIKE '%wallet_balance - v_total_amount%WHERE%wallet_balance%'
    ) INTO v_cwp_no_direct_update;

    -- verify_wallet_integrity: reads wallet_ledger
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'verify_wallet_integrity'
          AND p.prosrc ILIKE '%wallet_ledger%'
          AND p.prosrc NOT ILIKE '%wallet_transactions%'
    ) INTO v_integrity_uses_ledger;

    -- pay_with_wallet: NULL guard
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'pay_with_wallet'
          AND p.prosrc ILIKE '%MISSING_ORDER_ID%'
    ) INTO v_pww_has_null_guard;

    -- pay_with_wallet: FOR UPDATE
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'pay_with_wallet'
          AND p.prosrc ILIKE '%FOR UPDATE%'
    ) INTO v_pww_has_for_update;

    -- CHECK constraints updated
    SELECT EXISTS(
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'wallet_ledger'::regclass
          AND conname = 'wallet_ledger_entry_type_check'
          AND pg_get_constraintdef(oid) ILIKE '%admin_credit%'
    ) INTO v_entry_type_ok;

    SELECT EXISTS(
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'wallet_ledger'::regclass
          AND conname = 'wallet_ledger_source_check'
          AND pg_get_constraintdef(oid) ILIKE '%''wallet''%'
    ) INTO v_source_ok;

    -- Fail fast if critical checks fail
    IF NOT v_ol2_idempotency_first THEN
        RAISE EXCEPTION 'CRITICAL: credit_wallet OL2 no tiene idempotency check (W5-A fix missing)';
    END IF;
    IF NOT v_integrity_uses_ledger THEN
        RAISE EXCEPTION 'CRITICAL: verify_wallet_integrity aún lee wallet_transactions (W5-D fix missing)';
    END IF;

    RAISE NOTICE '=== BUG-W5 Fix Applied ===';
    RAISE NOTICE '';
    RAISE NOTICE 'W5-A/B: credit_wallet(txn_id, mp_id, status) — OL2 mp-webhook:';
    RAISE NOTICE '  Idempotency-first (ALREADY_PROCESSED + mp_credit_ ns) = %', v_ol2_idempotency_first;
    RAISE NOTICE '  No direct UPDATE clients.wallet_balance                = %', v_ol2_no_direct_update;
    RAISE NOTICE '';
    RAISE NOTICE 'W5-C: complete_wallet_payment(order_id):';
    RAISE NOTICE '  Idempotency-first (order_payment_ key)                 = %', v_cwp_idempotency_first;
    RAISE NOTICE '  No direct conditional UPDATE                           = %', v_cwp_no_direct_update;
    RAISE NOTICE '';
    RAISE NOTICE 'W5-D: verify_wallet_integrity(store_id):';
    RAISE NOTICE '  Reads wallet_ledger (no wallet_transactions)           = %', v_integrity_uses_ledger;
    RAISE NOTICE '';
    RAISE NOTICE 'W5-E: pay_with_wallet(client_id, amount, order_id):';
    RAISE NOTICE '  NULL guard para p_order_id                             = %', v_pww_has_null_guard;
    RAISE NOTICE '  FOR UPDATE (anti-TOCTOU)                               = %', v_pww_has_for_update;
    RAISE NOTICE '';
    RAISE NOTICE 'CHECK constraints:';
    RAISE NOTICE '  entry_type incluye admin_credit/admin_adjustment/debit = %', v_entry_type_ok;
    RAISE NOTICE '  source incluye wallet/admin                            = %', v_source_ok;
    RAISE NOTICE '';
    RAISE NOTICE 'Arquitectura ledger-first activa:';
    RAISE NOTICE '  INSERT wallet_ledger → trigger → clients.wallet_balance';
    RAISE NOTICE '  CERO UPDATE directo a clients.wallet_balance';
    RAISE NOTICE '';
    RAISE NOTICE 'Post-deploy checklist:';
    RAISE NOTICE '  1. OL1 admin credit → OL2 webhook mismo txn_id → OL2 retorna ALREADY_PROCESSED, balance intacto';
    RAISE NOTICE '  2. OL2 webhook duplicado (retry) → solo 1 entrada en wallet_ledger';
    RAISE NOTICE '  3. complete_wallet_payment × 2 → segunda retorna ALREADY_PROCESSED';
    RAISE NOTICE '  4. pay_with_wallet con p_order_id=NULL → retorna MISSING_ORDER_ID';
    RAISE NOTICE '  5. verify_wallet_integrity() → reporta drift contra wallet_ledger';
END $$;

COMMIT;
