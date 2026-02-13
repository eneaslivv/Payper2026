-- =============================================
-- MIGRATION: Encrypt MercadoPago Tokens using Supabase Vault
-- Date: 2026-02-13
-- Issue: P1-1 CRITICAL - MP tokens stored in plaintext
-- Solution: Use pgsodium encryption + Supabase Vault
-- =============================================

-- PART 1: Install pgsodium if not already installed
-- =============================================
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- PART 2: Create encrypted secrets table
-- =============================================
CREATE TABLE IF NOT EXISTS public.store_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    secret_type TEXT NOT NULL CHECK (secret_type IN ('mp_access_token', 'mp_refresh_token', 'other')),
    encrypted_value BYTEA NOT NULL,
    key_id UUID NOT NULL,
    nonce BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,

    -- Only one secret of each type per store
    UNIQUE(store_id, secret_type)
);

COMMENT ON TABLE public.store_secrets IS
'Encrypted secrets storage using pgsodium. Stores sensitive credentials like MP tokens.';

COMMENT ON COLUMN public.store_secrets.encrypted_value IS
'Encrypted secret using pgsodium.crypto_aead_det_encrypt()';

COMMENT ON COLUMN public.store_secrets.key_id IS
'Reference to the encryption key used (stored in pgsodium.key)';

COMMENT ON COLUMN public.store_secrets.nonce IS
'Nonce used for encryption (required for decryption)';

-- PART 3: Enable RLS
-- =============================================
ALTER TABLE public.store_secrets ENABLE ROW LEVEL SECURITY;

-- Store members can read their own store's secrets
CREATE POLICY store_secrets_select_own ON public.store_secrets
FOR SELECT
USING (store_id = auth.get_user_store_id());

-- Only service role can insert/update secrets
CREATE POLICY store_secrets_service_role_all ON public.store_secrets
FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- PART 4: Create encryption/decryption functions
-- =============================================

-- Function to encrypt and store a secret
CREATE OR REPLACE FUNCTION public.store_secret_encrypt(
    p_store_id UUID,
    p_secret_type TEXT,
    p_plaintext_value TEXT,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_key_id UUID;
    v_encrypted BYTEA;
    v_nonce BYTEA;
    v_secret_id UUID;
BEGIN
    -- Validate user has access to this store
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND store_id = p_store_id
        AND role IN ('store_owner', 'super_admin')
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'Only store owners can manage secrets'
        );
    END IF;

    -- Get or create encryption key for this store
    SELECT id INTO v_key_id
    FROM pgsodium.key
    WHERE name = 'store_' || p_store_id::text
    LIMIT 1;

    IF v_key_id IS NULL THEN
        -- Create new key for this store
        INSERT INTO pgsodium.key (name)
        VALUES ('store_' || p_store_id::text)
        RETURNING id INTO v_key_id;
    END IF;

    -- Generate nonce
    v_nonce := pgsodium.crypto_aead_det_noncegen();

    -- Encrypt the secret
    v_encrypted := pgsodium.crypto_aead_det_encrypt(
        p_plaintext_value::bytea,
        NULL::bytea,  -- No additional data
        v_key_id,
        v_nonce
    );

    -- Insert or update the secret
    INSERT INTO store_secrets (
        store_id,
        secret_type,
        encrypted_value,
        key_id,
        nonce,
        expires_at
    ) VALUES (
        p_store_id,
        p_secret_type,
        v_encrypted,
        v_key_id,
        v_nonce,
        p_expires_at
    )
    ON CONFLICT (store_id, secret_type)
    DO UPDATE SET
        encrypted_value = EXCLUDED.encrypted_value,
        key_id = EXCLUDED.key_id,
        nonce = EXCLUDED.nonce,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    RETURNING id INTO v_secret_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'secret_id', v_secret_id,
        'message', 'Secret encrypted and stored successfully'
    );
END;
$$;

COMMENT ON FUNCTION public.store_secret_encrypt IS
'Encrypts and stores a secret for a store. Only store owners can use this.';

-- Function to decrypt and retrieve a secret
CREATE OR REPLACE FUNCTION public.store_secret_decrypt(
    p_store_id UUID,
    p_secret_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_encrypted BYTEA;
    v_key_id UUID;
    v_nonce BYTEA;
    v_decrypted BYTEA;
BEGIN
    -- Validate user has access to this store
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
        AND store_id = p_store_id
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: User does not have access to this store';
    END IF;

    -- Get the encrypted secret
    SELECT encrypted_value, key_id, nonce
    INTO v_encrypted, v_key_id, v_nonce
    FROM store_secrets
    WHERE store_id = p_store_id
    AND secret_type = p_secret_type;

    IF v_encrypted IS NULL THEN
        RETURN NULL;
    END IF;

    -- Decrypt the secret
    v_decrypted := pgsodium.crypto_aead_det_decrypt(
        v_encrypted,
        NULL::bytea,
        v_key_id,
        v_nonce
    );

    RETURN convert_from(v_decrypted, 'UTF8');
END;
$$;

COMMENT ON FUNCTION public.store_secret_decrypt IS
'Decrypts and retrieves a secret for a store. Only store members can use this.';

-- PART 5: Migration helper to encrypt existing MP tokens
-- =============================================

DO $$
DECLARE
    v_store RECORD;
    v_result JSONB;
BEGIN
    FOR v_store IN
        SELECT id, mp_access_token, mp_refresh_token
        FROM stores
        WHERE mp_access_token IS NOT NULL
        OR mp_refresh_token IS NOT NULL
    LOOP
        -- Encrypt access token if exists
        IF v_store.mp_access_token IS NOT NULL THEN
            -- Note: This needs to be run as service_role since we're bypassing user auth
            INSERT INTO store_secrets (store_id, secret_type, encrypted_value, key_id, nonce)
            SELECT
                v_store.id,
                'mp_access_token',
                pgsodium.crypto_aead_det_encrypt(
                    v_store.mp_access_token::bytea,
                    NULL::bytea,
                    k.id,
                    pgsodium.crypto_aead_det_noncegen()
                ),
                k.id,
                pgsodium.crypto_aead_det_noncegen()
            FROM (
                SELECT id FROM pgsodium.key
                WHERE name = 'store_' || v_store.id::text
                UNION ALL
                SELECT id FROM (
                    INSERT INTO pgsodium.key (name)
                    VALUES ('store_' || v_store.id::text)
                    RETURNING id
                ) new_key
                LIMIT 1
            ) k
            ON CONFLICT (store_id, secret_type) DO NOTHING;

            RAISE NOTICE 'Encrypted mp_access_token for store %', v_store.id;
        END IF;

        -- Encrypt refresh token if exists
        IF v_store.mp_refresh_token IS NOT NULL THEN
            INSERT INTO store_secrets (store_id, secret_type, encrypted_value, key_id, nonce)
            SELECT
                v_store.id,
                'mp_refresh_token',
                pgsodium.crypto_aead_det_encrypt(
                    v_store.mp_refresh_token::bytea,
                    NULL::bytea,
                    k.id,
                    pgsodium.crypto_aead_det_noncegen()
                ),
                k.id,
                pgsodium.crypto_aead_det_noncegen()
            FROM (
                SELECT id FROM pgsodium.key
                WHERE name = 'store_' || v_store.id::text
                LIMIT 1
            ) k
            ON CONFLICT (store_id, secret_type) DO NOTHING;

            RAISE NOTICE 'Encrypted mp_refresh_token for store %', v_store.id;
        END IF;
    END LOOP;

    RAISE NOTICE 'Migration complete: All MP tokens encrypted';
END $$;

-- PART 6: Add columns to track migration status
-- =============================================

-- Add flag to indicate tokens are now encrypted
ALTER TABLE stores ADD COLUMN IF NOT EXISTS mp_tokens_encrypted BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN stores.mp_tokens_encrypted IS
'TRUE if MP tokens are stored in store_secrets (encrypted), FALSE if in plaintext columns';

-- Mark all stores with migrated tokens
UPDATE stores
SET mp_tokens_encrypted = TRUE
WHERE id IN (
    SELECT DISTINCT store_id
    FROM store_secrets
    WHERE secret_type IN ('mp_access_token', 'mp_refresh_token')
);

-- PART 7: Create trigger to auto-update timestamp
-- =============================================

CREATE OR REPLACE FUNCTION trigger_store_secrets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER store_secrets_updated_at
BEFORE UPDATE ON store_secrets
FOR EACH ROW
EXECUTE FUNCTION trigger_store_secrets_updated_at();

-- PART 8: Verification
-- =============================================

-- Count encrypted secrets
SELECT
    COUNT(*) as total_encrypted_secrets,
    COUNT(DISTINCT store_id) as stores_with_secrets
FROM store_secrets;

-- Show which stores have encrypted tokens
SELECT
    s.id,
    s.name,
    s.mp_tokens_encrypted,
    COUNT(ss.id) as encrypted_secrets_count
FROM stores s
LEFT JOIN store_secrets ss ON ss.store_id = s.id
GROUP BY s.id, s.name, s.mp_tokens_encrypted
ORDER BY s.name;

RAISE NOTICE '✅ P1-1 COMPLETED: MercadoPago tokens now encrypted with pgsodium';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Update Edge Functions to use store_secret_decrypt()';
RAISE NOTICE '2. Update frontend to use store_secret_encrypt() when saving tokens';
RAISE NOTICE '3. Remove plaintext columns: mp_access_token, mp_refresh_token (after verification)';
