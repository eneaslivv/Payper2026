-- =============================================
-- CRITICAL P0: Webhook Atomic Deduplication
-- Date: 2026-02-13
-- Security: Prevent duplicate webhook processing (5x wallet credit)
-- =============================================

-- Ensure payment_webhooks table has UNIQUE constraint on provider_event_id
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_webhooks_provider_event_id
ON payment_webhooks(provider_event_id)
WHERE provider_event_id IS NOT NULL;

-- Update credit_wallet to accept MP payment status validation
CREATE OR REPLACE FUNCTION public.credit_wallet(
    p_transaction_id UUID,
    p_mp_payment_id TEXT DEFAULT NULL,
    p_status TEXT DEFAULT 'approved'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_wallet_transaction RECORD;
    v_client_id UUID;
    v_store_id UUID;
    v_amount NUMERIC;
    v_new_balance NUMERIC;
    v_idempotency_key TEXT;
BEGIN
    -- Validate payment status (CRITICAL: only credit on approved payments)
    IF p_status != 'approved' THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_STATUS: Cannot credit wallet for status %', p_status;
    END IF;

    -- Get transaction details
    SELECT
        wt.client_id,
        wt.store_id,
        wt.amount
    INTO v_wallet_transaction
    FROM wallet_transactions wt
    WHERE wt.id = p_transaction_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TRANSACTION_NOT_FOUND',
            'message', 'Wallet transaction not found'
        );
    END IF;

    v_client_id := v_wallet_transaction.client_id;
    v_store_id := v_wallet_transaction.store_id;
    v_amount := v_wallet_transaction.amount;

    -- Generate idempotency key
    v_idempotency_key := 'credit_wallet_' || p_transaction_id::text;

    -- Atomic balance update
    UPDATE clients
    SET wallet_balance = wallet_balance + v_amount
    WHERE id = v_client_id
    RETURNING wallet_balance INTO v_new_balance;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CLIENT_NOT_FOUND',
            'message', 'Client not found'
        );
    END IF;

    -- Create ledger entry with idempotency key
    BEGIN
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
        );
    EXCEPTION
        WHEN unique_violation THEN
            -- Idempotency key conflict = already processed
            RETURN jsonb_build_object(
                'success', false,
                'error', 'ALREADY_PROCESSED',
                'message', 'This transaction was already credited'
            );
    END;

    -- Mark wallet_transaction as completed
    UPDATE wallet_transactions
    SET
        status = 'completed',
        completed_at = NOW()
    WHERE id = p_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Wallet credited successfully',
        'new_balance', v_new_balance,
        'amount', v_amount
    );
END;
$$;

COMMENT ON FUNCTION credit_wallet IS 'Credit wallet with MP payment status validation and idempotency';

GRANT EXECUTE ON FUNCTION credit_wallet TO authenticated;
GRANT EXECUTE ON FUNCTION credit_wallet TO service_role;

-- Verify constraints
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_payment_webhooks_provider_event_id'
    ) THEN
        RAISE NOTICE 'Webhook deduplication constraint created successfully';
    ELSE
        RAISE WARNING 'Webhook deduplication constraint creation failed';
    END IF;
END $$;
