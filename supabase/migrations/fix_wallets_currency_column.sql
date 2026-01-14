-- Add missing 'currency' column to wallets table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'wallets'
        AND column_name = 'currency'
    ) THEN
        ALTER TABLE public.wallets ADD COLUMN currency TEXT DEFAULT 'ARS';
    END IF;
END $$;
