-- =============================================
-- CRITICAL P0: Wallet Ledger Idempotency Constraint
-- Date: 2026-02-13
-- Security: Prevent duplicate credits/debits
-- =============================================

-- Add UNIQUE constraint on idempotency_key to prevent duplicates
-- Using partial index (WHERE idempotency_key IS NOT NULL) for performance
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_ledger_idempotency
ON wallet_ledger(idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- Verify constraint was created
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'idx_wallet_ledger_idempotency'
    ) THEN
        RAISE NOTICE 'Idempotency constraint created successfully';
    ELSE
        RAISE WARNING 'Idempotency constraint creation failed';
    END IF;
END $$;
