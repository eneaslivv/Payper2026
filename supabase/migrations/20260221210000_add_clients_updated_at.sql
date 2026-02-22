-- ============================================================================
-- Fix: order creation fails with "column 'updated_at' of relation 'clients'
--      does not exist"
-- Date: 2026-02-21
--
-- Root cause: 8 functions reference clients.updated_at but the column was never
--   created on the clients table. The wallet_ledger trigger
--   (update_wallet_balance_from_ledger) fires after wallet payment and sets
--   clients.updated_at = NOW(), causing the order to fail.
--
-- Affected functions:
--   1. update_wallet_balance_from_ledger (trigger)
--   2. credit_wallet
--   3. complete_wallet_payment
--   4. create_order_atomic (via wallet_ledger trigger)
--   5. get_client_by_nfc (SELECT)
--   6. assign_nfc_to_client
--   7. process_loyalty_points
--   8. handle_new_user (INSERT)
--
-- Fix: Add the missing column with sensible defaults.
-- ============================================================================

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Backfill: set updated_at = created_at for existing rows
UPDATE public.clients SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL;
