-- =============================================
-- CONSOLIDATED P1 MIGRATIONS - Apply in Supabase Dashboard
-- Date: 2026-02-13
-- Copy and paste this ENTIRE file into SQL Editor
-- =============================================

-- Migration order:
-- 1. Encrypt MP tokens
-- 2. Create store RPC
-- 3. Unify products/inventory
-- 4. Optimize finance queries

BEGIN;

-- =============================================
-- MIGRATION 1: Encrypt MercadoPago Tokens
-- =============================================

-- Install pgsodium if not already installed
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Create encrypted secrets table
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
    UNIQUE(store_id, secret_type)
);

COMMENT ON TABLE public.store_secrets IS 'Encrypted secrets storage using pgsodium';

-- Enable RLS
ALTER TABLE public.store_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_secrets_select_own ON public.store_secrets;
CREATE POLICY store_secrets_select_own ON public.store_secrets
FOR SELECT
USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS store_secrets_service_role_all ON public.store_secrets;
CREATE POLICY store_secrets_service_role_all ON public.store_secrets
FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

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

    -- Get or create encryption key
    SELECT id INTO v_key_id
    FROM pgsodium.key
    WHERE name = 'store_' || p_store_id::text
    LIMIT 1;

    IF v_key_id IS NULL THEN
        INSERT INTO pgsodium.key (name)
        VALUES ('store_' || p_store_id::text)
        RETURNING id INTO v_key_id;
    END IF;

    v_nonce := pgsodium.crypto_aead_det_noncegen();

    v_encrypted := pgsodium.crypto_aead_det_encrypt(
        p_plaintext_value::bytea,
        NULL::bytea,
        v_key_id,
        v_nonce
    );

    INSERT INTO store_secrets (
        store_id, secret_type, encrypted_value, key_id, nonce, expires_at
    ) VALUES (
        p_store_id, p_secret_type, v_encrypted, v_key_id, v_nonce, p_expires_at
    )
    ON CONFLICT (store_id, secret_type)
    DO UPDATE SET
        encrypted_value = EXCLUDED.encrypted_value,
        key_id = EXCLUDED.key_id,
        nonce = EXCLUDED.nonce,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    RETURNING id INTO v_secret_id;

    RETURN jsonb_build_object('success', TRUE, 'secret_id', v_secret_id);
END;
$$;

-- Function to decrypt secret
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
    IF NOT EXISTS (
        SELECT 1 FROM profiles WHERE id = auth.uid() AND store_id = p_store_id
    ) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;

    SELECT encrypted_value, key_id, nonce
    INTO v_encrypted, v_key_id, v_nonce
    FROM store_secrets
    WHERE store_id = p_store_id AND secret_type = p_secret_type;

    IF v_encrypted IS NULL THEN
        RETURN NULL;
    END IF;

    v_decrypted := pgsodium.crypto_aead_det_decrypt(
        v_encrypted, NULL::bytea, v_key_id, v_nonce
    );

    RETURN convert_from(v_decrypted, 'UTF8');
END;
$$;

-- Add flag to stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS mp_tokens_encrypted BOOLEAN DEFAULT FALSE;

-- =============================================
-- MIGRATION 2: Create Store RPC
-- =============================================

CREATE OR REPLACE FUNCTION public.create_store(
    p_name TEXT,
    p_slug TEXT,
    p_currency TEXT DEFAULT 'ARS',
    p_timezone TEXT DEFAULT 'America/Argentina/Buenos_Aires',
    p_service_mode TEXT DEFAULT 'pos_only',
    p_owner_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id UUID;
    v_new_store_id UUID;
    v_default_location_id UUID;
    v_default_zone_id UUID;
    v_user_role TEXT;
    v_user_store_id UUID;
BEGIN
    v_user_id := COALESCE(p_owner_user_id, auth.uid());

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'UNAUTHORIZED');
    END IF;

    SELECT role, store_id INTO v_user_role, v_user_store_id
    FROM profiles WHERE id = v_user_id;

    IF v_user_store_id IS NOT NULL AND v_user_role != 'super_admin' THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'PERMISSION_DENIED');
    END IF;

    IF EXISTS (SELECT 1 FROM stores WHERE slug = p_slug) THEN
        RETURN jsonb_build_object('success', FALSE, 'error', 'SLUG_TAKEN', 'slug', p_slug);
    END IF;

    INSERT INTO stores (name, slug, currency, timezone, service_mode, is_active)
    VALUES (p_name, p_slug, p_currency, p_timezone, p_service_mode, TRUE)
    RETURNING id INTO v_new_store_id;

    INSERT INTO storage_locations (store_id, name, type, is_default)
    VALUES (v_new_store_id, 'Almacén Principal', 'base', TRUE)
    RETURNING id INTO v_default_location_id;

    INSERT INTO venue_zones (store_id, name, color)
    VALUES (v_new_store_id, 'Zona Principal', '#3B82F6')
    RETURNING id INTO v_default_zone_id;

    UPDATE profiles
    SET store_id = v_new_store_id,
        role = CASE WHEN role = 'super_admin' THEN 'super_admin' ELSE 'store_owner' END
    WHERE id = v_user_id;

    INSERT INTO categories (store_id, name, icon, color, sort_order)
    VALUES
        (v_new_store_id, 'Bebidas Calientes', 'coffee', '#F59E0B', 1),
        (v_new_store_id, 'Bebidas Frías', 'glass-water', '#3B82F6', 2),
        (v_new_store_id, 'Comida', 'utensils', '#EF4444', 3),
        (v_new_store_id, 'Postres', 'cake-candles', '#EC4899', 4);

    RETURN jsonb_build_object(
        'success', TRUE,
        'store_id', v_new_store_id,
        'default_location_id', v_default_location_id,
        'default_zone_id', v_default_zone_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_store TO authenticated;

-- =============================================
-- MIGRATION 3: Unify Products/Inventory
-- =============================================

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS linked_inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL;

ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS is_sellable BOOLEAN DEFAULT FALSE;

CREATE OR REPLACE VIEW public.product_inventory_map AS
SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.store_id,
    p.category,
    p.active,
    CASE
        WHEN p.linked_inventory_item_id IS NOT NULL THEN p.linked_inventory_item_id
        ELSE NULL
    END AS inventory_item_id,
    CASE
        WHEN EXISTS (SELECT 1 FROM product_recipes pr WHERE pr.product_id = p.id) THEN TRUE
        ELSE FALSE
    END AS has_recipe
FROM products p;

CREATE OR REPLACE FUNCTION public.validate_product_inventory_consistency()
RETURNS TABLE (
    issue_type TEXT,
    product_id UUID,
    product_name TEXT,
    description TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        'DUAL_LINKAGE'::TEXT,
        p.id,
        p.name,
        'Product has both recipe and direct inventory link'::TEXT
    FROM products p
    WHERE p.linked_inventory_item_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM product_recipes pr WHERE pr.product_id = p.id);

    RETURN QUERY
    SELECT
        'NO_LINKAGE'::TEXT,
        p.id,
        p.name,
        'Product has no recipe and no inventory link'::TEXT
    FROM products p
    WHERE p.linked_inventory_item_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM product_recipes pr WHERE pr.product_id = p.id);
END;
$$;

CREATE INDEX IF NOT EXISTS idx_products_linked_inventory
ON products(linked_inventory_item_id)
WHERE linked_inventory_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_sellable
ON inventory_items(store_id, is_sellable)
WHERE is_sellable = TRUE;

-- =============================================
-- MIGRATION 4: Optimize Finance Queries
-- =============================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.daily_sales_summary AS
SELECT
    o.store_id,
    DATE(o.created_at) AS sale_date,
    COUNT(DISTINCT o.id) AS total_orders,
    COUNT(DISTINCT o.client_id) AS unique_customers,
    SUM(o.total_amount) AS total_revenue,
    SUM(CASE WHEN o.is_paid THEN o.total_amount ELSE 0 END) AS paid_revenue,
    AVG(o.total_amount) AS average_order_value,
    COUNT(*) FILTER (WHERE o.status = 'delivered') AS delivered_orders
FROM orders o
GROUP BY o.store_id, DATE(o.created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_sales_summary_unique
ON daily_sales_summary(store_id, sale_date);

CREATE OR REPLACE FUNCTION public.get_financial_metrics_paginated(
    p_store_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_limit INTEGER DEFAULT 30,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    sale_date DATE,
    total_orders BIGINT,
    unique_customers BIGINT,
    total_revenue NUMERIC,
    total_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_total_count BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_total_count
    FROM daily_sales_summary
    WHERE store_id = p_store_id
    AND sale_date BETWEEN p_start_date AND p_end_date;

    RETURN QUERY
    SELECT
        dss.sale_date,
        dss.total_orders,
        dss.unique_customers,
        dss.total_revenue,
        v_total_count
    FROM daily_sales_summary dss
    WHERE dss.store_id = p_store_id
    AND dss.sale_date BETWEEN p_start_date AND p_end_date
    ORDER BY dss.sale_date DESC
    LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_top_products(
    p_store_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    product_id UUID,
    product_name TEXT,
    total_quantity BIGINT,
    total_revenue NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.name,
        SUM(oi.quantity)::BIGINT,
        SUM(oi.quantity * oi.unit_price)
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    JOIN products p ON p.id = oi.product_id
    WHERE o.store_id = p_store_id
    AND DATE(o.created_at) BETWEEN p_start_date AND p_end_date
    AND o.status != 'cancelled'
    GROUP BY p.id, p.name
    ORDER BY SUM(oi.quantity * oi.unit_price) DESC
    LIMIT p_limit;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_orders_created_at_store
ON orders(store_id, created_at DESC)
WHERE status != 'cancelled';

CREATE INDEX IF NOT EXISTS idx_order_items_product
ON order_items(product_id, order_id);

GRANT SELECT ON daily_sales_summary TO authenticated;
GRANT EXECUTE ON FUNCTION get_financial_metrics_paginated TO authenticated;
GRANT EXECUTE ON FUNCTION get_top_products TO authenticated;

-- Refresh materialized view
REFRESH MATERIALIZED VIEW daily_sales_summary;

-- =============================================
-- FINAL VERIFICATION
-- =============================================

-- ✅ ALL 4 P1 MIGRATIONS COMPLETED
--
-- Verification queries:
-- 1. SELECT COUNT(*) FROM store_secrets;
-- 2. SELECT create_store('Test', 'test');
-- 3. SELECT * FROM product_inventory_map LIMIT 5;
-- 4. SELECT * FROM daily_sales_summary LIMIT 5;
--
-- Next: Update Edge Functions to use encrypted tokens

COMMIT;
