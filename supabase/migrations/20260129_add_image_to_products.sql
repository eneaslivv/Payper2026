
-- Migration: Add image column to products table
-- Description: Ensures products can store image URLs, matching inventory_items schema.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'image') THEN
        ALTER TABLE public.products ADD COLUMN image text;
    END IF;
END $$;

COMMENT ON COLUMN public.products.image IS 'URL to the product image asset.';
