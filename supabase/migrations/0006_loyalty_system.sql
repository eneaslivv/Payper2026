-- =============================================
-- LOYALTY SYSTEM TABLES
-- Migration: Add tables for loyalty/points system
-- =============================================

-- 1. loyalty_configs: Store-level configuration for points
CREATE TABLE IF NOT EXISTS loyalty_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{
        "isActive": false,
        "baseAmount": 100,
        "basePoints": 1,
        "rounding": "down",
        "manualOrdersEarn": false,
        "discountedOrdersEarn": true,
        "combosEarn": true
    }'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id)
);

-- 2. loyalty_rewards: Rewards catalog (what can be redeemed)
CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. loyalty_product_rules: Per-product multipliers
CREATE TABLE IF NOT EXISTS loyalty_product_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    multiplier DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(store_id, product_id)
);

-- 4. loyalty_transactions: Track points earned/redeemed (for audit)
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    client_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('earn', 'redeem')),
    points INTEGER NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_loyalty_rewards_store ON loyalty_rewards(store_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rules_store ON loyalty_product_rules(store_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_store ON loyalty_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_client ON loyalty_transactions(client_id);

-- RLS Policies
ALTER TABLE loyalty_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_product_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- loyalty_configs policies
CREATE POLICY "Store staff can view their loyalty config" ON loyalty_configs
    FOR SELECT USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Store staff can manage their loyalty config" ON loyalty_configs
    FOR ALL USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

-- loyalty_rewards policies
CREATE POLICY "Store staff can view their rewards" ON loyalty_rewards
    FOR SELECT USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Store staff can manage their rewards" ON loyalty_rewards
    FOR ALL USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

-- loyalty_product_rules policies
CREATE POLICY "Store staff can view their product rules" ON loyalty_product_rules
    FOR SELECT USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Store staff can manage their product rules" ON loyalty_product_rules
    FOR ALL USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

-- loyalty_transactions policies
CREATE POLICY "Store staff can view their transactions" ON loyalty_transactions
    FOR SELECT USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Store staff can insert transactions" ON loyalty_transactions
    FOR INSERT WITH CHECK (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

-- Clients can view their own transactions
CREATE POLICY "Clients can view own transactions" ON loyalty_transactions
    FOR SELECT USING (client_id = auth.uid());

-- Add points_balance column to profiles if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'profiles' AND column_name = 'points_balance') THEN
        ALTER TABLE profiles ADD COLUMN points_balance INTEGER DEFAULT 0;
    END IF;
END $$;
