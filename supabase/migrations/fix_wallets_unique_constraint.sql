-- Fix duplicate wallets and add UNIQUE constraint
DO $$
BEGIN
    -- 1. Remove duplicate wallets if any (keeping the most recently created based on ctid or id)
    -- This is necessary before adding a unique constraint
    DELETE FROM public.wallets a USING public.wallets b
    WHERE a.ctid < b.ctid
    AND a.user_id = b.user_id
    AND a.store_id = b.store_id;

    -- 2. Add the UNIQUE constraint on (user_id, store_id)
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'wallets_user_id_store_id_key'
    ) THEN
        ALTER TABLE public.wallets
        ADD CONSTRAINT wallets_user_id_store_id_key UNIQUE (user_id, store_id);
    END IF;
END $$;
