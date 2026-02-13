-- =============================================
-- MIGRATION: Migrate Existing MP Tokens to Encrypted Storage
-- Date: 2026-02-13
-- Purpose: Copy plaintext MP tokens to encrypted store_secrets table
-- =============================================

DO $$
DECLARE
    v_store RECORD;
    v_result JSONB;
    v_migrated_count INTEGER := 0;
    v_failed_count INTEGER := 0;
BEGIN
    FOR v_store IN
        SELECT id, mp_access_token, mp_refresh_token, mp_expires_at
        FROM stores
        WHERE (mp_access_token IS NOT NULL OR mp_refresh_token IS NOT NULL)
        AND mp_tokens_encrypted = FALSE
    LOOP
        -- Encrypt access token if exists
        IF v_store.mp_access_token IS NOT NULL THEN
            SELECT store_secret_encrypt(
                v_store.id,
                'mp_access_token',
                v_store.mp_access_token,
                v_store.mp_expires_at
            ) INTO v_result;

            IF NOT (v_result->>'success')::BOOLEAN THEN
                RAISE WARNING 'Failed to encrypt access token for store %: %',
                    v_store.id, v_result->>'message';
                v_failed_count := v_failed_count + 1;
                CONTINUE;
            END IF;
        END IF;

        -- Encrypt refresh token if exists
        IF v_store.mp_refresh_token IS NOT NULL THEN
            SELECT store_secret_encrypt(
                v_store.id,
                'mp_refresh_token',
                v_store.mp_refresh_token,
                NULL
            ) INTO v_result;

            IF NOT (v_result->>'success')::BOOLEAN THEN
                RAISE WARNING 'Failed to encrypt refresh token for store %: %',
                    v_store.id, v_result->>'message';
                v_failed_count := v_failed_count + 1;
                CONTINUE;
            END IF;
        END IF;

        -- Mark store as migrated
        UPDATE stores
        SET mp_tokens_encrypted = TRUE
        WHERE id = v_store.id;

        v_migrated_count := v_migrated_count + 1;
        RAISE NOTICE 'Migrated tokens for store %', v_store.id;
    END LOOP;

    RAISE NOTICE '===========================================';
    RAISE NOTICE 'TOKEN MIGRATION COMPLETED';
    RAISE NOTICE 'Successfully migrated: % stores', v_migrated_count;
    RAISE NOTICE 'Failed: % stores', v_failed_count;
    RAISE NOTICE '===========================================';
END $$;

-- Verification query
SELECT
    COUNT(*) FILTER (WHERE mp_tokens_encrypted = TRUE) as migrated_stores,
    COUNT(*) FILTER (WHERE mp_tokens_encrypted = FALSE AND mp_access_token IS NOT NULL) as pending_stores,
    COUNT(*) as total_stores
FROM stores;

-- Check encrypted secrets count
SELECT
    s.name,
    s.mp_tokens_encrypted,
    COUNT(ss.id) as encrypted_secrets_count
FROM stores s
LEFT JOIN store_secrets ss ON ss.store_id = s.id
GROUP BY s.id, s.name, s.mp_tokens_encrypted
ORDER BY s.mp_tokens_encrypted DESC, s.name;
