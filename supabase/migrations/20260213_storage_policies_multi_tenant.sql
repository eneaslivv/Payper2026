-- =============================================
-- FIX #11: STORAGE POLICIES - MULTI-TENANT
-- Fecha: 2026-02-13
-- Problema:
--   Storage (Supabase Storage) sin políticas permite:
--   - Tienda A puede ver archivos de Tienda B
--   - QR codes, facturas, imágenes de productos filtrados
-- Solución:
--   Políticas RLS en storage.objects con validación de store_id
-- =============================================

-- IMPORTANTE: Este script debe ejecutarse en el SQL Editor de Supabase
-- Las políticas de Storage requieren el schema 'storage', no 'public'

-- 1. CREATE BUCKETS (si no existen)
-- Ejecutar desde Dashboard > Storage o vía SQL:

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
    ('store-files', 'store-files', false, 52428800, ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[]),
    ('qr-codes', 'qr-codes', true, 5242880, ARRAY['image/png','image/svg+xml']::text[]),
    ('product-images', 'product-images', true, 10485760, ARRAY['image/jpeg','image/png','image/webp']::text[])
ON CONFLICT (id) DO NOTHING;

-- 2. HELPER FUNCTION: Get user's store_id
-- Reutiliza la función existente o crea si no existe
CREATE OR REPLACE FUNCTION auth.get_user_store_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT store_id
    FROM public.profiles
    WHERE id = auth.uid()
    LIMIT 1;
$$;

-- 3. STORAGE POLICIES: store-files bucket
-- Estructura esperada: store-files/{store_id}/invoices/...
--                      store-files/{store_id}/receipts/...
--                      store-files/{store_id}/documents/...

-- 3.1. SELECT Policy (Read)
DROP POLICY IF EXISTS "Users can view their store files" ON storage.objects;
CREATE POLICY "Users can view their store files"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'store-files'
    AND (storage.foldername(name))[1] = auth.get_user_store_id()::text
);

-- 3.2. INSERT Policy (Upload)
DROP POLICY IF EXISTS "Users can upload to their store folder" ON storage.objects;
CREATE POLICY "Users can upload to their store folder"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'store-files'
    AND (storage.foldername(name))[1] = auth.get_user_store_id()::text
);

-- 3.3. UPDATE Policy (Modify)
DROP POLICY IF EXISTS "Users can update their store files" ON storage.objects;
CREATE POLICY "Users can update their store files"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'store-files'
    AND (storage.foldername(name))[1] = auth.get_user_store_id()::text
)
WITH CHECK (
    bucket_id = 'store-files'
    AND (storage.foldername(name))[1] = auth.get_user_store_id()::text
);

-- 3.4. DELETE Policy
DROP POLICY IF EXISTS "Users can delete their store files" ON storage.objects;
CREATE POLICY "Users can delete their store files"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'store-files'
    AND (storage.foldername(name))[1] = auth.get_user_store_id()::text
);

-- 4. STORAGE POLICIES: qr-codes bucket (PUBLIC READ)
-- Estructura esperada: qr-codes/{store_id}/{qr_hash}.png

-- 4.1. SELECT Policy (Public read - anyone can scan QR)
DROP POLICY IF EXISTS "QR codes are publicly readable" ON storage.objects;
CREATE POLICY "QR codes are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'qr-codes');

-- 4.2. INSERT Policy (Only authenticated users can upload to their store)
DROP POLICY IF EXISTS "Users can upload QR codes to their store" ON storage.objects;
CREATE POLICY "Users can upload QR codes to their store"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'qr-codes'
    AND (storage.foldername(name))[1] = auth.get_user_store_id()::text
);

-- 4.3. DELETE Policy (Only own QR codes)
DROP POLICY IF EXISTS "Users can delete their QR codes" ON storage.objects;
CREATE POLICY "Users can delete their QR codes"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'qr-codes'
    AND (storage.foldername(name))[1] = auth.get_user_store_id()::text
);

-- 5. STORAGE POLICIES: product-images bucket (PUBLIC READ)
-- Estructura esperada: product-images/{store_id}/{product_id}.webp

-- 5.1. SELECT Policy (Public read - for menu display)
DROP POLICY IF EXISTS "Product images are publicly readable" ON storage.objects;
CREATE POLICY "Product images are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- 5.2. INSERT Policy (Only authenticated users can upload to their store)
DROP POLICY IF EXISTS "Users can upload product images to their store" ON storage.objects;
CREATE POLICY "Users can upload product images to their store"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.get_user_store_id()::text
);

-- 5.3. UPDATE Policy
DROP POLICY IF EXISTS "Users can update their product images" ON storage.objects;
CREATE POLICY "Users can update their product images"
ON storage.objects FOR UPDATE
USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.get_user_store_id()::text
)
WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.get_user_store_id()::text
);

-- 5.4. DELETE Policy
DROP POLICY IF EXISTS "Users can delete their product images" ON storage.objects;
CREATE POLICY "Users can delete their product images"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = auth.get_user_store_id()::text
);

-- 6. HELPER VIEW: Storage Usage by Store
CREATE OR REPLACE VIEW storage_usage_by_store AS
SELECT
    (storage.foldername(name))[1]::uuid as store_id,
    s.name as store_name,
    o.bucket_id,
    COUNT(*) as file_count,
    SUM(COALESCE((o.metadata->>'size')::bigint, 0)) as total_bytes,
    ROUND(SUM(COALESCE((o.metadata->>'size')::bigint, 0)) / 1024.0 / 1024.0, 2) as total_mb
FROM storage.objects o
LEFT JOIN public.stores s ON s.id = (storage.foldername(name))[1]::uuid
WHERE bucket_id IN ('store-files', 'qr-codes', 'product-images')
GROUP BY (storage.foldername(name))[1], s.name, o.bucket_id
ORDER BY store_id, bucket_id;

-- 7. GRANT PERMISSIONS
GRANT SELECT ON storage_usage_by_store TO authenticated;

-- 8. AUDIT SCRIPT
DO $$
DECLARE
    v_bucket TEXT;
    v_policy_count INTEGER;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'STORAGE POLICIES AUDIT';
    RAISE NOTICE '========================================';

    FOR v_bucket IN SELECT id FROM storage.buckets WHERE id IN ('store-files', 'qr-codes', 'product-images')
    LOOP
        SELECT COUNT(*)
        INTO v_policy_count
        FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname LIKE '%' || v_bucket || '%';

        IF v_policy_count >= 3 THEN
            RAISE NOTICE '✅ Bucket %: % policies configured', v_bucket, v_policy_count;
        ELSE
            RAISE WARNING '⚠️  Bucket %: Only % policies found [SECURITY RISK]', v_bucket, v_policy_count;
        END IF;
    END LOOP;

    RAISE NOTICE '========================================';
END $$;

-- 9. USAGE EXAMPLES
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'STORAGE USAGE EXAMPLES';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE '1. Upload invoice (Frontend):';
    RAISE NOTICE '   const { data, error } = await supabase.storage';
    RAISE NOTICE '     .from(''store-files'')';
    RAISE NOTICE '     .upload(`${storeId}/invoices/invoice-${orderId}.pdf`, file);';
    RAISE NOTICE '';
    RAISE NOTICE '2. Upload QR code (Frontend):';
    RAISE NOTICE '   const { data, error } = await supabase.storage';
    RAISE NOTICE '     .from(''qr-codes'')';
    RAISE NOTICE '     .upload(`${storeId}/${qrHash}.png`, qrBlob, { upsert: true });';
    RAISE NOTICE '';
    RAISE NOTICE '3. Upload product image (Frontend):';
    RAISE NOTICE '   const { data, error } = await supabase.storage';
    RAISE NOTICE '     .from(''product-images'')';
    RAISE NOTICE '     .upload(`${storeId}/${productId}.webp`, imageFile);';
    RAISE NOTICE '';
    RAISE NOTICE '4. Get public URL (QR code):';
    RAISE NOTICE '   const { data } = supabase.storage';
    RAISE NOTICE '     .from(''qr-codes'')';
    RAISE NOTICE '     .getPublicUrl(`${storeId}/${qrHash}.png`);';
    RAISE NOTICE '';
    RAISE NOTICE '5. Check storage usage:';
    RAISE NOTICE '   SELECT * FROM storage_usage_by_store WHERE store_id = ''your-store-id'';';
    RAISE NOTICE '========================================';
END $$;

-- 10. COMMENT
COMMENT ON VIEW storage_usage_by_store IS
'Shows storage usage per store and bucket.
Helps monitor file uploads and detect quota issues.
Query: SELECT * FROM storage_usage_by_store WHERE store_id = ''your-id'';';

COMMENT ON FUNCTION auth.get_user_store_id IS
'Helper function to get current user''s store_id.
Used by Storage policies to enforce multi-tenant isolation.
Returns NULL if user not authenticated or has no store.';

-- 11. VERIFICATION QUERIES
-- Run these after applying migration to verify:
/*
-- Check all storage policies:
SELECT
    schemaname,
    tablename,
    policyname,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
ORDER BY policyname;

-- Check storage usage:
SELECT * FROM storage_usage_by_store;

-- Test upload (should succeed for own store, fail for others):
-- Try uploading to: store-files/{your_store_id}/test.txt
-- Try uploading to: store-files/{other_store_id}/test.txt (should fail)
*/
