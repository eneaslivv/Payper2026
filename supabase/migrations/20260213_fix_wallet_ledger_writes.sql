-- =============================================
-- FIX WALLET LEDGER INTEGRITY
-- Fecha: 2026-02-13
-- Issue: Wallet functions bypass ledger, causing $2.5M in untracked balances
-- =============================================

-- PART 1: Fix credit_wallet to write to ledger
CREATE OR REPLACE FUNCTION credit_wallet(
    p_transaction_id UUID,
    p_client_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_txn RECORD;
    v_client_id UUID;
    v_store_id UUID;
    v_new_balance NUMERIC;
    v_entry_id UUID;
BEGIN
    -- 1. Get transaction details
    SELECT * INTO v_txn
    FROM wallet_transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Transaction not found');
    END IF;

    -- Determine client_id
    v_client_id := COALESCE(p_client_id, v_txn.client_id);
    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Client ID required');
    END IF;

    -- Get store_id from client
    SELECT store_id INTO v_store_id
    FROM clients
    WHERE id = v_client_id;

    -- 2. Calculate new balance
    SELECT COALESCE(wallet_balance, 0) + v_txn.amount INTO v_new_balance
    FROM clients
    WHERE id = v_client_id;

    -- 3. INSERT into wallet_ledger (trigger will update clients.wallet_balance)
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
        v_client_id,
        v_store_id,
        v_txn.amount,
        v_new_balance,
        'topup',
        'wallet_transaction',
        p_transaction_id,
        COALESCE(v_txn.description, 'Wallet top-up'),
        v_client_id,
        COALESCE(v_txn.payment_method, 'mercadopago'),
        COALESCE(v_txn.payment_method, 'mercadopago'),
        'credit_wallet_' || p_transaction_id::text
    ) RETURNING id INTO v_entry_id;

    -- 4. Update transaction status to completed
    UPDATE wallet_transactions
    SET status = 'completed', updated_at = NOW()
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'ledger_entry_id', v_entry_id
    );
END;
$$;

-- PART 2: Fix pay_with_wallet to write to ledger
CREATE OR REPLACE FUNCTION pay_with_wallet(
    p_client_id UUID,
    p_amount NUMERIC,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
    v_store_id UUID;
    v_entry_id UUID;
BEGIN
    -- 1. Get client's current balance and store_id
    SELECT wallet_balance, store_id INTO v_current_balance, v_store_id
    FROM clients
    WHERE id = p_client_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Client not found');
    END IF;

    -- 2. Validate sufficient balance
    v_current_balance := COALESCE(v_current_balance, 0);
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'error', 'Insufficient balance',
            'current_balance', v_current_balance,
            'required', p_amount
        );
    END IF;

    v_new_balance := v_current_balance - p_amount;

    -- 3. INSERT into wallet_ledger (trigger will update clients.wallet_balance)
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
        -p_amount,  -- Negative for debit
        v_new_balance,
        'payment',
        'order',
        p_order_id,
        'Payment for order ' || COALESCE(p_order_id::text, 'unknown'),
        p_client_id,
        'wallet',
        'wallet',
        'pay_with_wallet_' || COALESCE(p_order_id::text, gen_random_uuid()::text)
    ) RETURNING id INTO v_entry_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'ledger_entry_id', v_entry_id
    );
END;
$$;

-- PART 3: Verify wallet_ledger trigger exists and is correct
-- This trigger should update clients.wallet_balance when ledger entries are inserted

CREATE OR REPLACE FUNCTION update_wallet_balance_from_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Update clients.wallet_balance to match ledger balance_after
    UPDATE clients
    SET
        wallet_balance = NEW.balance_after,
        updated_at = NOW()
    WHERE id = NEW.wallet_id;

    RETURN NEW;
END;
$$;

-- Drop existing trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_update_wallet_balance ON wallet_ledger;

CREATE TRIGGER trigger_update_wallet_balance
AFTER INSERT ON wallet_ledger
FOR EACH ROW
EXECUTE FUNCTION update_wallet_balance_from_ledger();

-- PART 4: Grant permissions
GRANT EXECUTE ON FUNCTION credit_wallet TO authenticated;
GRANT EXECUTE ON FUNCTION pay_with_wallet TO authenticated;

-- PART 5: Add store_id validation to wallet functions (SECURITY FIX)
-- This prevents cross-store wallet access

CREATE OR REPLACE FUNCTION get_user_store_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store_id UUID;
BEGIN
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = auth.uid();

    RETURN v_store_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_user_store_id TO authenticated;

-- Add store validation to credit_wallet
CREATE OR REPLACE FUNCTION credit_wallet(
    p_transaction_id UUID,
    p_client_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_txn RECORD;
    v_client_id UUID;
    v_store_id UUID;
    v_user_store_id UUID;
    v_new_balance NUMERIC;
    v_entry_id UUID;
BEGIN
    -- 1. Get user's store_id for validation
    v_user_store_id := get_user_store_id();

    -- 2. Get transaction details
    SELECT * INTO v_txn
    FROM wallet_transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Transaction not found');
    END IF;

    -- 3. Determine client_id
    v_client_id := COALESCE(p_client_id, v_txn.client_id);
    IF v_client_id IS NULL THEN
        RETURN jsonb_build_object('error', 'Client ID required');
    END IF;

    -- 4. Get store_id from client
    SELECT store_id INTO v_store_id
    FROM clients
    WHERE id = v_client_id;

    -- 5. SECURITY: Validate store_id matches user's store
    IF v_store_id != v_user_store_id THEN
        RAISE EXCEPTION 'Access denied: Cannot credit wallet for different store';
    END IF;

    -- 6. Calculate new balance
    SELECT COALESCE(wallet_balance, 0) + v_txn.amount INTO v_new_balance
    FROM clients
    WHERE id = v_client_id;

    -- 7. INSERT into wallet_ledger (trigger will update clients.wallet_balance)
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
        v_client_id,
        v_store_id,
        v_txn.amount,
        v_new_balance,
        'topup',
        'wallet_transaction',
        p_transaction_id,
        COALESCE(v_txn.description, 'Wallet top-up'),
        auth.uid(),
        COALESCE(v_txn.payment_method, 'mercadopago'),
        COALESCE(v_txn.payment_method, 'mercadopago'),
        'credit_wallet_' || p_transaction_id::text
    ) RETURNING id INTO v_entry_id;

    -- 8. Update transaction status to completed
    UPDATE wallet_transactions
    SET status = 'completed', updated_at = NOW()
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'ledger_entry_id', v_entry_id
    );
END;
$$;

-- Add store validation to pay_with_wallet
CREATE OR REPLACE FUNCTION pay_with_wallet(
    p_client_id UUID,
    p_amount NUMERIC,
    p_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
    v_store_id UUID;
    v_user_store_id UUID;
    v_entry_id UUID;
BEGIN
    -- 1. Get user's store_id for validation
    v_user_store_id := get_user_store_id();

    -- 2. Get client's current balance and store_id
    SELECT wallet_balance, store_id INTO v_current_balance, v_store_id
    FROM clients
    WHERE id = p_client_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Client not found');
    END IF;

    -- 3. SECURITY: Validate store_id matches user's store (skip for client-initiated payments)
    -- Client payments have auth.uid() = p_client_id, staff payments have different auth.uid()
    IF auth.uid() != p_client_id AND v_store_id != v_user_store_id THEN
        RAISE EXCEPTION 'Access denied: Cannot process payment for different store';
    END IF;

    -- 4. Validate sufficient balance
    v_current_balance := COALESCE(v_current_balance, 0);
    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'error', 'Insufficient balance',
            'current_balance', v_current_balance,
            'required', p_amount
        );
    END IF;

    v_new_balance := v_current_balance - p_amount;

    -- 5. INSERT into wallet_ledger (trigger will update clients.wallet_balance)
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
        -p_amount,  -- Negative for debit
        v_new_balance,
        'payment',
        'order',
        p_order_id,
        'Payment for order ' || COALESCE(p_order_id::text, 'unknown'),
        auth.uid(),
        'wallet',
        'wallet',
        'pay_with_wallet_' || COALESCE(p_order_id::text, gen_random_uuid()::text)
    ) RETURNING id INTO v_entry_id;

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'ledger_entry_id', v_entry_id
    );
END;
$$;

-- PART 6: Verification queries
-- Run these after applying migration to verify it works

-- 1. Verify trigger exists
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'wallet_ledger'
  AND trigger_name = 'trigger_update_wallet_balance';

-- 2. Test wallet integrity (should show 0 discrepancies after backfill)
-- SELECT * FROM monitoring_wallet_integrity;

-- Expected: All functions now write to wallet_ledger
-- Expected: Trigger updates clients.wallet_balance automatically
-- Expected: Full audit trail for all wallet transactions

-- =============================================
-- END OF MIGRATION
-- Next step: Backfill historical wallet_ledger entries
-- =============================================
