-- Add 'id' column to wallets table as UNIQUE (not PK) to avoid conflict
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'wallets'
        AND column_name = 'id'
    ) THEN
        ALTER TABLE public.wallets ADD COLUMN id UUID DEFAULT gen_random_uuid() UNIQUE;
    END IF;
END $$;
