-- =============================================
-- LOYALTY ENGINE v3.0 (PRODUCTION READY)
-- Ledger-based fidelity system
-- All mutations go through ledger
-- =============================================

-- ============================================
-- 1. LEDGER TABLE (SOURCE OF TRUTH)
-- ============================================
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('earn', 'burn', 'gift', 'expire', 'adjustment', 'rollback')),
    points INTEGER NOT NULL, -- Signed: positive for earn/gift, negative for burn/expire
    monetary_cost NUMERIC(10,2) DEFAULT 0, -- COGS of the item given
    monetary_value NUMERIC(10,2) DEFAULT 0, -- Retail value of the item given
    description TEXT,
    staff_id UUID REFERENCES public.profiles(id),
    metadata JSONB DEFAULT '{}'::JSONB,
    is_rolled_back BOOLEAN DEFAULT false
);

-- IDEMPOTENCY INDEXES
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_tx_order_earn 
ON public.loyalty_transactions(order_id) WHERE (type = 'earn' AND is_rolled_back = false);

CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_tx_order_burn 
ON public.loyalty_transactions(order_id) WHERE (type = 'burn' AND is_rolled_back = false);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_client ON public.loyalty_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_store ON public.loyalty_transactions(store_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_created ON public.loyalty_transactions(created_at DESC);

-- ============================================
-- 2. REDEMPTIONS TABLE (Burn details)
-- ============================================
CREATE TABLE IF NOT EXISTS public.loyalty_redemptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    transaction_id UUID NOT NULL REFERENCES public.loyalty_transactions(id) ON DELETE CASCADE,
    reward_id UUID REFERENCES public.loyalty_rewards(id),
    order_id UUID REFERENCES public.orders(id),
    cost_points INTEGER NOT NULL,
    cost_value NUMERIC(10,2) DEFAULT 0, -- COGS
    retail_value NUMERIC(10,2) DEFAULT 0, -- Retail price
    product_id UUID REFERENCES public.inventory_items(id),
    is_rolled_back BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_redemptions_order ON public.loyalty_redemptions(order_id);

-- ============================================
-- 3. POINT CALCULATION FUNCTION
-- Uses loyalty_configs + loyalty_product_rules
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_order_points(p_order_id UUID)
RETURNS INTEGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_config JSONB;
    v_base_amount NUMERIC := 100;
    v_base_points NUMERIC := 1;
    v_rounding TEXT := 'down';
    v_item RECORD;
    v_multiplier NUMERIC;
    v_item_points NUMERIC := 0;
    v_total_points NUMERIC := 0;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.client_id IS NULL THEN RETURN 0; END IF;

    SELECT config INTO v_config FROM public.loyalty_configs WHERE store_id = v_order.store_id;
    IF v_config IS NULL OR COALESCE((v_config->>'isActive')::BOOLEAN, false) = false THEN RETURN 0; END IF;

    v_base_amount := COALESCE((v_config->>'baseAmount')::NUMERIC, 100);
    v_base_points := COALESCE((v_config->>'basePoints')::NUMERIC, 1);
    v_rounding := COALESCE(v_config->>'rounding', 'down');

    IF v_base_amount <= 0 THEN RETURN 0; END IF;

    -- Calculate per-item with product rules
    FOR v_item IN 
        SELECT oi.product_id, oi.quantity, oi.unit_price, 
               COALESCE(lpr.multiplier, 1) as multiplier
        FROM public.order_items oi
        LEFT JOIN public.loyalty_product_rules lpr 
            ON lpr.product_id = oi.product_id AND lpr.store_id = v_order.store_id
        WHERE oi.order_id = p_order_id
    LOOP
        v_item_points := ((v_item.unit_price * v_item.quantity) / v_base_amount) * v_base_points * v_item.multiplier;
        v_total_points := v_total_points + v_item_points;
    END LOOP;

    -- Fallback: if no items found, use order total
    IF v_total_points = 0 AND v_order.total_amount > 0 THEN
        v_total_points := (v_order.total_amount / v_base_amount) * v_base_points;
    END IF;

    -- Rounding
    IF v_rounding = 'down' THEN RETURN FLOOR(v_total_points)::INTEGER;
    ELSIF v_rounding = 'normal' THEN RETURN ROUND(v_total_points)::INTEGER;
    ELSE RETURN CEIL(v_total_points)::INTEGER;
    END IF;
END;
$$;

-- ============================================
-- 4. TRIGGER FUNCTION (EARN ON PAYMENT APPROVED)
-- Strict condition: payment_status transitions TO 'approved'
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_process_loyalty_earn()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_points_earned INTEGER;
    v_current_balance INTEGER;
BEGIN
    -- STRICT: Only fire if payment_status changed TO 'approved' from something else
    IF NEW.payment_status = 'approved' AND (OLD.payment_status IS DISTINCT FROM 'approved') THEN
       
       -- Skip if no client
       IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

       v_points_earned := public.calculate_order_points(NEW.id);
       IF v_points_earned <= 0 THEN RETURN NEW; END IF;

       SELECT COALESCE(loyalty_points, 0) INTO v_current_balance 
       FROM public.clients WHERE id = NEW.client_id;

       -- Idempotent Insert (UNIQUE index prevents duplicates)
       INSERT INTO public.loyalty_transactions (
           store_id, client_id, order_id, type, points, description
       ) VALUES (
           NEW.store_id, 
           NEW.client_id, 
           NEW.id, 
           'earn', 
           v_points_earned, 
           'Puntos por compra #' || LEFT(NEW.id::text, 8)
       )
       ON CONFLICT DO NOTHING;

       -- Only update balance if insert succeeded (check if row was inserted)
       IF FOUND THEN
           UPDATE public.clients 
           SET loyalty_points = COALESCE(loyalty_points, 0) + v_points_earned 
           WHERE id = NEW.client_id;
       END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_payment_approved_loyalty ON public.orders;
CREATE TRIGGER on_order_payment_approved_loyalty
AFTER UPDATE OF payment_status ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_process_loyalty_earn();

-- ============================================
-- 5. REDEEM REWARD (BURN) — ATOMIC + LOCKED
-- Must be called AFTER order creation with order_id
-- ============================================
CREATE OR REPLACE FUNCTION public.redeem_reward(
    p_client_id UUID,
    p_reward_id UUID,
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_reward RECORD;
    v_client RECORD;
    v_new_balance INTEGER;
    v_tx_id UUID;
    v_store_id UUID;
BEGIN
    -- Get store_id from order
    SELECT store_id INTO v_store_id FROM public.orders WHERE id = p_order_id;
    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada');
    END IF;

    -- Get reward
    SELECT * INTO v_reward FROM public.loyalty_rewards 
    WHERE id = p_reward_id AND is_active = true;
    IF v_reward IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Recompensa no encontrada o inactiva');
    END IF;

    -- Lock client row for concurrency safety
    SELECT * INTO v_client FROM public.clients 
    WHERE id = p_client_id FOR UPDATE;
    IF v_client IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
    END IF;

    -- Check balance
    IF COALESCE(v_client.loyalty_points, 0) < v_reward.points THEN
        RETURN jsonb_build_object('success', false, 'error', 'Saldo de puntos insuficiente', 
            'balance', COALESCE(v_client.loyalty_points, 0), 'required', v_reward.points);
    END IF;

    v_new_balance := COALESCE(v_client.loyalty_points, 0) - v_reward.points;

    -- Idempotent INSERT (UNIQUE index on order_id WHERE type='burn')
    INSERT INTO public.loyalty_transactions (
        store_id, client_id, order_id, type, points, description, metadata
    ) VALUES (
        v_store_id, p_client_id, p_order_id, 'burn', -v_reward.points, 
        'Canje: ' || v_reward.name,
        jsonb_build_object('reward_id', p_reward_id, 'reward_name', v_reward.name)
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_tx_id;

    -- If insert failed (duplicate), return early
    IF v_tx_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ya existe un canje para esta orden');
    END IF;

    -- Insert redemption detail
    INSERT INTO public.loyalty_redemptions (
        transaction_id, reward_id, order_id, cost_points, product_id
    ) VALUES (
        v_tx_id, p_reward_id, p_order_id, v_reward.points, v_reward.product_id
    );

    -- Update client balance
    UPDATE public.clients SET loyalty_points = v_new_balance WHERE id = p_client_id;

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'points_spent', v_reward.points);
END;
$$;

-- ============================================
-- 6. ROLLBACK REDEMPTION (For cancelled orders)
-- Idempotent: marks transactions as rolled_back
-- ============================================
CREATE OR REPLACE FUNCTION public.rollback_redemption(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tx RECORD;
    v_client RECORD;
    v_restored_points INTEGER;
BEGIN
    -- Find active burn transaction for this order
    SELECT * INTO v_tx FROM public.loyalty_transactions 
    WHERE order_id = p_order_id AND type = 'burn' AND is_rolled_back = false;

    IF v_tx IS NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'No active burn found, nothing to rollback');
    END IF;

    -- Lock client for safe update
    SELECT * INTO v_client FROM public.clients WHERE id = v_tx.client_id FOR UPDATE;

    v_restored_points := ABS(v_tx.points);

    -- Mark transactions and redemptions as rolled back (NOT delete)
    UPDATE public.loyalty_transactions SET is_rolled_back = true WHERE id = v_tx.id;
    UPDATE public.loyalty_redemptions SET is_rolled_back = true WHERE transaction_id = v_tx.id;

    -- Create rollback transaction entry
    INSERT INTO public.loyalty_transactions (
        store_id, client_id, order_id, type, points, description, metadata
    ) VALUES (
        v_tx.store_id, v_tx.client_id, p_order_id, 'rollback', v_restored_points,
        'Reembolso por orden cancelada #' || LEFT(p_order_id::text, 8),
        jsonb_build_object('original_tx_id', v_tx.id)
    );

    -- Restore balance
    UPDATE public.clients 
    SET loyalty_points = COALESCE(loyalty_points, 0) + v_restored_points 
    WHERE id = v_tx.client_id;

    RETURN jsonb_build_object('success', true, 'restored_points', v_restored_points);
END;
$$;

-- ============================================
-- 7. ADMIN_ADD_POINTS (REFACTORED — Uses Ledger)
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_add_points(
    target_client_id UUID,
    points_amount INTEGER,
    staff_id UUID DEFAULT NULL,
    description TEXT DEFAULT 'Puntos agregados manualmente'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_new_balance INTEGER;
    v_store_id UUID;
BEGIN
    -- Lock client
    SELECT * INTO v_client FROM public.clients WHERE id = target_client_id FOR UPDATE;
    IF v_client IS NULL THEN RAISE EXCEPTION 'Cliente no encontrado'; END IF;

    v_store_id := v_client.store_id;
    v_new_balance := COALESCE(v_client.loyalty_points, 0) + points_amount;

    -- Insert ledger entry
    INSERT INTO public.loyalty_transactions (
        store_id, client_id, type, points, description, staff_id
    ) VALUES (
        v_store_id, target_client_id, 'adjustment', points_amount, description, staff_id
    );

    -- Update balance
    UPDATE public.clients SET loyalty_points = v_new_balance WHERE id = target_client_id;
    
    RETURN v_new_balance;
END;
$$;

-- ============================================
-- 8. ADMIN_GRANT_GIFT (REFACTORED — Uses Ledger)
-- ============================================
CREATE OR REPLACE FUNCTION public.admin_grant_gift(
    target_client_id UUID,
    gift_name TEXT,
    gift_description TEXT DEFAULT 'Regalo otorgado',
    staff_id UUID DEFAULT NULL,
    product_id UUID DEFAULT NULL,
    monetary_cost NUMERIC DEFAULT 0,
    monetary_value NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_tx_id UUID;
    v_store_id UUID;
BEGIN
    SELECT * INTO v_client FROM public.clients WHERE id = target_client_id;
    IF v_client IS NULL THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
    END IF;

    v_store_id := v_client.store_id;

    INSERT INTO public.loyalty_transactions (
        store_id, client_id, type, points, monetary_cost, monetary_value, description, staff_id, metadata
    ) VALUES (
        v_store_id, target_client_id, 'gift', 0, monetary_cost, monetary_value, gift_description, staff_id,
        jsonb_build_object('gift_name', gift_name, 'product_id', product_id)
    ) RETURNING id INTO v_tx_id;

    RETURN jsonb_build_object('success', true, 'transaction_id', v_tx_id);
END;
$$;

-- ============================================
-- 9. RLS POLICIES
-- ============================================
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_redemptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for rerun safety)
DROP POLICY IF EXISTS "Users can read own loyalty_transactions" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "Staff can manage loyalty_transactions" ON public.loyalty_transactions;
DROP POLICY IF EXISTS "Users can read own loyalty_redemptions" ON public.loyalty_redemptions;
DROP POLICY IF EXISTS "Staff can manage loyalty_redemptions" ON public.loyalty_redemptions;

-- Clients can read their own transactions
CREATE POLICY "Users can read own loyalty_transactions" ON public.loyalty_transactions
    FOR SELECT USING (client_id = auth.uid());

-- Staff can manage all (use role check)
CREATE POLICY "Staff can manage loyalty_transactions" ON public.loyalty_transactions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'store_owner', 'cashier', 'manager')
        )
    );

CREATE POLICY "Users can read own loyalty_redemptions" ON public.loyalty_redemptions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.loyalty_transactions lt 
            WHERE lt.id = loyalty_redemptions.transaction_id AND lt.client_id = auth.uid()
        )
    );

CREATE POLICY "Staff can manage loyalty_redemptions" ON public.loyalty_redemptions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role IN ('admin', 'store_owner', 'cashier', 'manager')
        )
    );

-- ============================================
-- 10. HELPER: Verify balance consistency
-- ============================================
CREATE OR REPLACE FUNCTION public.verify_loyalty_balance(p_client_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_ledger_sum INTEGER;
    v_cached_balance INTEGER;
BEGIN
    SELECT COALESCE(SUM(points), 0) INTO v_ledger_sum 
    FROM public.loyalty_transactions 
    WHERE client_id = p_client_id AND is_rolled_back = false;

    SELECT COALESCE(loyalty_points, 0) INTO v_cached_balance 
    FROM public.clients WHERE id = p_client_id;

    RETURN jsonb_build_object(
        'ledger_sum', v_ledger_sum,
        'cached_balance', v_cached_balance,
        'is_consistent', v_ledger_sum = v_cached_balance
    );
END;
$$;
