-- SECURITY MIGRATION: Financial Tables Hardening
-- AUTHOR: Payper Security Agent
-- DATE: 2026-01-27

-- 1. PAYMENT WEBHOOKS (Lockdown)
-- Only Service Role can insert (Edge Functions). 
-- Admins can view for debugging. Public has NO access.
ALTER TABLE public.payment_webhooks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service Role Full Access" ON payment_webhooks;
DROP POLICY IF EXISTS "Admins View Store Webhooks" ON payment_webhooks;

-- Policy: Service Role bypasses RLS, but we can be explicit or rely on default.
-- Policy: Store Admins can select their own webhooks
CREATE POLICY "Admins View Store Webhooks" ON payment_webhooks
    FOR SELECT
    USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

-- Policy: Deny all others (No public insert/read)
-- (Implicit deny ensures anon cannot touch this)


-- 2. DISPATCH SESSIONS (Table does not exist, skipping)
-- The table 'dispatch_sessions' was not found in the database.
-- It seems 'cash_sessions' is used instead in the frontend.
-- skipping...
-- ALTER TABLE IF EXISTS public.dispatch_sessions ENABLE ROW LEVEL SECURITY;
-- ...


-- 3. WALLET LEDGER (Privacy Protection)
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_ledger_select" ON wallet_ledger;
DROP POLICY IF EXISTS "wallet_ledger_insert" ON wallet_ledger;

-- READ Policy:
-- A. Store Admins can see all transactions for their store.
-- B. Clients can see transactions for their own wallet.
CREATE POLICY "wallet_ledger_select" ON wallet_ledger
    FOR SELECT
    USING (
        -- Is Store Admin
        store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid())
        OR
        -- Is Wallet Owner (Join via wallets table)
        wallet_id IN (
            SELECT id FROM wallets WHERE user_id = auth.uid()
        )
    );

-- WRITE Policy:
-- Only allow inserts via RPC (Security Definer) or Service Role.
-- We do NOT allow direct client inserts to ledger.

-- 4. DATA BACKFILL (Critical for Consistency)
-- Ensure all wallet_ledger rows have a store_id relative to their wallet.
-- This prevents "disappearance" of old transactions for Admins.
UPDATE public.wallet_ledger wl
SET store_id = w.store_id
FROM public.wallets w
WHERE wl.wallet_id = w.id
AND wl.store_id IS NULL;

