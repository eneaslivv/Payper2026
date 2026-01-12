-- Add missing columns to inventory_items to match Types
ALTER TABLE inventory_items 
ADD COLUMN IF NOT EXISTS min_stock numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS max_stock numeric,
ADD COLUMN IF NOT EXISTS ideal_stock numeric,
ADD COLUMN IF NOT EXISTS reorder_point numeric,
ADD COLUMN IF NOT EXISTS sku text,
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS is_menu_visible boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS is_recommended boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_new boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_promo boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS package_size numeric DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_purchase_price numeric;
