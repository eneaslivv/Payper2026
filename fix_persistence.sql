-- 1. Ensure columns exist for Menu Design (JSONB)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS menu_theme JSONB DEFAULT '{}'::jsonb;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS menu_logic JSONB DEFAULT '{}'::jsonb;

-- 2. Ensure Menu Design Persistence Tables exist
CREATE TABLE IF NOT EXISTS product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_adjustment NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_addons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price NUMERIC DEFAULT 0,
    inventory_item_id UUID, -- Optional link to inventory
    quantity_consumed NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Ensure Loyalty Persistence Tables exist
CREATE TABLE IF NOT EXISTS loyalty_configs (
    store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID, -- Optional link to free product
    name TEXT NOT NULL,
    points INTEGER NOT NULL,
    image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loyalty_product_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    multiplier NUMERIC DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable RLS (Row Level Security) and Policies
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_product_rules ENABLE ROW LEVEL SECURITY;

-- Allow public read (for menu) and authenticated write (for admin)
-- (Simplified for immediate fix, you can refine these later)

-- Variants
CREATE POLICY "Public Read Variants" ON product_variants FOR SELECT USING (true);
CREATE POLICY "Admin All Variants" ON product_variants FOR ALL USING (auth.role() = 'authenticated');

-- Addons
CREATE POLICY "Public Read Addons" ON product_addons FOR SELECT USING (true);
CREATE POLICY "Admin All Addons" ON product_addons FOR ALL USING (auth.role() = 'authenticated');

-- Loyalty
CREATE POLICY "Public Read Loyalty Config" ON loyalty_configs FOR SELECT USING (true);
CREATE POLICY "Admin All Loyalty Config" ON loyalty_configs FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Public Read Loyalty Rewards" ON loyalty_rewards FOR SELECT USING (true);
CREATE POLICY "Admin All Loyalty Rewards" ON loyalty_rewards FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Public Read Loyalty Rules" ON loyalty_product_rules FOR SELECT USING (true);
CREATE POLICY "Admin All Loyalty Rules" ON loyalty_product_rules FOR ALL USING (auth.role() = 'authenticated');
