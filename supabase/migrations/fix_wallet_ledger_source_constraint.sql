-- Fix for 'wallet_ledger_source_check' constraint violation
-- This migration updates the check constraint to allow 'admin_panel' and other valid sources.

DO $$
BEGIN
    -- Drop the constraint if it exists (to strictly recreate it with new values)
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'wallet_ledger_source_check'
    ) THEN
        ALTER TABLE public.wallet_ledger DROP CONSTRAINT wallet_ledger_source_check;
    END IF;
END $$;

-- Re-add the constraint with expanded allowed values
ALTER TABLE public.wallet_ledger 
ADD CONSTRAINT wallet_ledger_source_check 
CHECK (source IN ('manual', 'system', 'admin_panel', 'mercadopago', 'refund', 'bonus', 'cash', 'transfer', 'gift'));
