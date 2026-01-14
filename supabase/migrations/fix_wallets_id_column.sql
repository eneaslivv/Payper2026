-- Add missing 'id' column to wallets table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'wallets'
        AND column_name = 'id'
    ) THEN
        ALTER TABLE public.wallets ADD COLUMN id UUID DEFAULT gen_random_uuid() PRIMARY KEY;
    END IF;
END $$;

-- Verify constraint again after adding ID
DO $$
BEGIN
    -- If we dropped it before, we can try to re-add it or just ensure data integrity via app logic
    -- Re-adding it ensures future integrity
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_ledger_wallet_id_fkey') THEN
        ALTER TABLE public.wallet_ledger 
        ADD CONSTRAINT wallet_ledger_wallet_id_fkey 
        FOREIGN KEY (wallet_id) REFERENCES public.wallets(id);
    END IF;
END $$;
