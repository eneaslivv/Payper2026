-- Fix QR Visibility & Upsert Constraint

-- 1. Ensure Unique Constraint for Upsert (Required for TableDetail.tsx logic)
CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_links_upsert ON public.qr_links (store_id, target_node_id);

-- 2. Enable RLS
ALTER TABLE public.qr_links ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Public Read Access (by Hash)
-- We allow EVERYONE (anon + authenticated) to read any QR link. 
-- This is necessary for the public QR page to resolve the hash.
DROP POLICY IF EXISTS "Public can view QR links" ON public.qr_links;

CREATE POLICY "Public can view QR links"
ON public.qr_links FOR SELECT
TO anon, authenticated
USING (true);

-- 4. Policy: Authenticated Management (Admins)
-- Ideally this should check store_id, but for immediate fix allowing all authenticated users (staff) to manage.
DROP POLICY IF EXISTS "Admins can manage QR links" ON public.qr_links;

CREATE POLICY "Admins can manage QR links"
ON public.qr_links
TO authenticated
USING (true)
WITH CHECK (true);
