-- ============================================================
-- CRITICAL AUDIT FIXES - 2026-02-16
-- Fixes: Cash session linking, RLS role enforcement,
--        failed sync persistence, multi-session prevention
-- ============================================================

-- ============================================================
-- FIX 1: VINCULAR PEDIDOS A CAJA (cash_session_id on orders)
-- ============================================================

-- 1a. Add cash_session_id column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL;

-- 1b. Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_orders_cash_session_id ON orders(cash_session_id) WHERE cash_session_id IS NOT NULL;

-- ============================================================
-- FIX 2: PREVENIR MULTIPLES CAJAS ABIERTAS POR ZONA
-- ============================================================

-- 2a. Unique partial index: only one open session per zone
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_session_per_zone
ON cash_sessions(store_id, zone_id)
WHERE status = 'open';

-- 2b. Function to find active cash session for an order's node
CREATE OR REPLACE FUNCTION get_cash_session_for_node(p_node_id UUID, p_store_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_zone_id UUID;
    v_session_id UUID;
BEGIN
    -- Resolve zone from venue_node
    SELECT zone_id INTO v_zone_id
    FROM venue_nodes
    WHERE id = p_node_id AND store_id = p_store_id;

    IF v_zone_id IS NULL THEN
        -- No zone found, try to find ANY open session for this store
        SELECT id INTO v_session_id
        FROM cash_sessions
        WHERE store_id = p_store_id AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1;
        RETURN v_session_id;
    END IF;

    -- Find open session for this zone
    SELECT id INTO v_session_id
    FROM cash_sessions
    WHERE store_id = p_store_id
      AND zone_id = v_zone_id
      AND status = 'open'
    LIMIT 1;

    RETURN v_session_id;
END;
$$;

-- 2c. Function to validate and attach cash session on order creation
CREATE OR REPLACE FUNCTION attach_cash_session_to_order()
RETURNS TRIGGER AS $$
DECLARE
    v_session_id UUID;
BEGIN
    -- Only on INSERT, only if cash_session_id not already set
    IF NEW.cash_session_id IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Try to resolve session from node
    IF NEW.node_id IS NOT NULL THEN
        v_session_id := get_cash_session_for_node(NEW.node_id, NEW.store_id);
    END IF;

    -- Fallback: find any open session for this store
    IF v_session_id IS NULL THEN
        SELECT id INTO v_session_id
        FROM cash_sessions
        WHERE store_id = NEW.store_id AND status = 'open'
        ORDER BY opened_at DESC
        LIMIT 1;
    END IF;

    -- Attach if found (non-blocking: allows order even without session)
    NEW.cash_session_id := v_session_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_attach_cash_session ON orders;
CREATE TRIGGER trg_attach_cash_session
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION attach_cash_session_to_order();

-- ============================================================
-- FIX 3: FORTALECER RLS POR ROL
-- ============================================================

-- 3a. Products: Only admin/owner/manager can UPDATE price fields
-- Drop existing overly-permissive policies
DROP POLICY IF EXISTS "staff_manage_products" ON products;
DROP POLICY IF EXISTS "Users can manage their store products" ON products;
DROP POLICY IF EXISTS "Enable access for store members" ON products;
DROP POLICY IF EXISTS "Public menu access" ON products;

-- Read: all staff in store can view
CREATE POLICY "products_select_store"
ON products FOR SELECT
USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

-- Insert: admin/owner/manager only
CREATE POLICY "products_insert_admin"
ON products FOR INSERT
WITH CHECK (
    store_id IN (
        SELECT p.store_id FROM profiles p
        WHERE p.id = auth.uid()
        AND (p.role IN ('store_owner', 'super_admin')
             OR EXISTS (
                 SELECT 1 FROM store_roles cr
                 WHERE cr.id = p.role_id
                 AND (cr.name ILIKE '%admin%' OR cr.name ILIKE '%manager%' OR cr.name ILIKE '%gerente%')
             )
        )
    )
);

-- Update: admin/owner/manager only
CREATE POLICY "products_update_admin"
ON products FOR UPDATE
USING (
    store_id IN (
        SELECT p.store_id FROM profiles p
        WHERE p.id = auth.uid()
        AND (p.role IN ('store_owner', 'super_admin')
             OR EXISTS (
                 SELECT 1 FROM store_roles cr
                 WHERE cr.id = p.role_id
                 AND (cr.name ILIKE '%admin%' OR cr.name ILIKE '%manager%' OR cr.name ILIKE '%gerente%')
             )
        )
    )
);

-- Delete: owner/super_admin only
CREATE POLICY "products_delete_owner"
ON products FOR DELETE
USING (
    store_id IN (
        SELECT p.store_id FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('store_owner', 'super_admin')
    )
);

-- 3b. Product Recipes: Only admin/owner/manager can modify
DROP POLICY IF EXISTS "Users can manage recipes via products" ON product_recipes;
DROP POLICY IF EXISTS "Allow full access for store users on product_recipes" ON product_recipes;

CREATE POLICY "recipes_select_store"
ON product_recipes FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM products pr
        WHERE pr.id = product_recipes.product_id
        AND pr.store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid())
    )
);

CREATE POLICY "recipes_modify_admin"
ON product_recipes FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM products pr
        JOIN profiles p ON p.store_id = pr.store_id AND p.id = auth.uid()
        WHERE pr.id = product_recipes.product_id
        AND (p.role IN ('store_owner', 'super_admin')
             OR EXISTS (
                 SELECT 1 FROM store_roles cr
                 WHERE cr.id = p.role_id
                 AND (cr.name ILIKE '%admin%' OR cr.name ILIKE '%manager%' OR cr.name ILIKE '%gerente%')
             )
        )
    )
);

-- 3c. Clients wallet_balance: Protect direct UPDATE
-- Create a secure function for balance modifications (not direct UPDATE)
CREATE OR REPLACE FUNCTION admin_adjust_client_balance(
    p_client_id UUID,
    p_amount NUMERIC,
    p_reason TEXT DEFAULT 'Ajuste manual',
    p_staff_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_staff_role TEXT;
    v_staff_store UUID;
    v_client_store UUID;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Validate staff permissions
    SELECT role, store_id INTO v_staff_role, v_staff_store
    FROM profiles WHERE id = COALESCE(p_staff_id, auth.uid());

    IF v_staff_role NOT IN ('store_owner', 'super_admin') THEN
        -- Check if has admin role
        IF NOT EXISTS (
            SELECT 1 FROM profiles p
            JOIN store_roles cr ON cr.id = p.role_id
            WHERE p.id = COALESCE(p_staff_id, auth.uid())
            AND (cr.name ILIKE '%admin%' OR cr.name ILIKE '%manager%' OR cr.name ILIKE '%gerente%')
        ) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Sin permisos para modificar saldo');
        END IF;
    END IF;

    -- Validate same store
    SELECT store_id INTO v_client_store FROM clients WHERE id = p_client_id;
    IF v_client_store != v_staff_store AND v_staff_role != 'super_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cliente de otro local');
    END IF;

    -- Get current balance
    SELECT wallet_balance INTO v_old_balance FROM clients WHERE id = p_client_id FOR UPDATE;
    v_new_balance := COALESCE(v_old_balance, 0) + p_amount;

    IF v_new_balance < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El saldo no puede ser negativo');
    END IF;

    -- Update balance
    UPDATE clients SET wallet_balance = v_new_balance, updated_at = NOW() WHERE id = p_client_id;

    -- Log in audit
    INSERT INTO audit_logs (store_id, user_id, table_name, operation, old_data, new_data)
    VALUES (
        v_staff_store,
        COALESCE(p_staff_id, auth.uid()),
        'clients',
        'UPDATE',
        jsonb_build_object('wallet_balance', v_old_balance, 'client_id', p_client_id),
        jsonb_build_object('wallet_balance', v_new_balance, 'client_id', p_client_id, 'reason', p_reason, 'amount', p_amount)
    );

    RETURN jsonb_build_object('success', true, 'old_balance', v_old_balance, 'new_balance', v_new_balance);
END;
$$;

-- 3d. Restrict direct UPDATE on clients.wallet_balance for non-admin roles
-- We do this by creating a trigger that blocks direct balance updates from non-admin
CREATE OR REPLACE FUNCTION protect_wallet_balance_update()
RETURNS TRIGGER AS $$
DECLARE
    v_role TEXT;
BEGIN
    -- Only protect wallet_balance column changes
    IF OLD.wallet_balance IS NOT DISTINCT FROM NEW.wallet_balance THEN
        RETURN NEW;
    END IF;

    -- Allow SECURITY DEFINER functions (they run as the definer, not the caller)
    -- Check if caller is admin/owner
    SELECT role INTO v_role FROM profiles WHERE id = auth.uid();

    IF v_role IS NULL OR v_role NOT IN ('store_owner', 'super_admin') THEN
        -- Check for admin cafe_role
        IF NOT EXISTS (
            SELECT 1 FROM profiles p
            JOIN store_roles cr ON cr.id = p.role_id
            WHERE p.id = auth.uid()
            AND (cr.name ILIKE '%admin%' OR cr.name ILIKE '%manager%' OR cr.name ILIKE '%gerente%')
        ) THEN
            RAISE EXCEPTION 'No tienes permisos para modificar el saldo directamente. Usa la funcion admin_adjust_client_balance.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_wallet_balance ON clients;
CREATE TRIGGER trg_protect_wallet_balance
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION protect_wallet_balance_update();

-- ============================================================
-- FIX 5: TABLA PARA SYNC EVENTS FALLIDOS
-- ============================================================

CREATE TABLE IF NOT EXISTS failed_sync_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    resolution_notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_failed_sync_store ON failed_sync_events(store_id) WHERE resolved_at IS NULL;

ALTER TABLE failed_sync_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "failed_sync_select_store"
ON failed_sync_events FOR SELECT
USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "failed_sync_insert_store"
ON failed_sync_events FOR INSERT
WITH CHECK (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "failed_sync_update_admin"
ON failed_sync_events FOR UPDATE
USING (
    store_id IN (
        SELECT p.store_id FROM profiles p
        WHERE p.id = auth.uid()
        AND (p.role IN ('store_owner', 'super_admin')
             OR EXISTS (
                 SELECT 1 FROM store_roles cr
                 WHERE cr.id = p.role_id
                 AND (cr.name ILIKE '%admin%' OR cr.name ILIKE '%manager%')
             )
        )
    )
);

-- ============================================================
-- Update expected_cash calculation to include cash_session_id
-- ============================================================

CREATE OR REPLACE FUNCTION get_session_expected_cash(query_session_id UUID)
RETURNS DECIMAL(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_zone_id UUID;
    v_opened_at TIMESTAMPTZ;
    v_closed_at TIMESTAMPTZ;
    v_store_id UUID;
    v_start_amount DECIMAL(12,2);
    v_order_total DECIMAL(12,2);
    v_adjustments DECIMAL(12,2);
BEGIN
    SELECT zone_id, opened_at, COALESCE(closed_at, NOW()), store_id, COALESCE(start_amount, 0)
    INTO v_zone_id, v_opened_at, v_closed_at, v_store_id, v_start_amount
    FROM cash_sessions
    WHERE id = query_session_id;

    IF v_zone_id IS NULL THEN
        RETURN 0;
    END IF;

    -- Sum cash orders linked to this session OR in this zone during session time
    SELECT COALESCE(SUM(o.total_amount), 0)
    INTO v_order_total
    FROM orders o
    WHERE o.store_id = v_store_id
      AND o.status NOT IN ('cancelled', 'draft')
      AND (o.payment_method ILIKE '%efectivo%' OR o.payment_method ILIKE '%cash%' OR o.payment_method IS NULL)
      AND (
          o.cash_session_id = query_session_id  -- NEW: Direct link
          OR (
              -- Fallback: zone + time window (backwards compatible)
              o.cash_session_id IS NULL
              AND o.created_at >= v_opened_at
              AND o.created_at <= v_closed_at
              AND EXISTS (
                  SELECT 1 FROM venue_nodes vn
                  WHERE vn.id = o.node_id AND vn.zone_id = v_zone_id
              )
          )
      );

    -- Sum adjustments from cash_movements
    SELECT COALESCE(SUM(
        CASE
            WHEN type IN ('adjustment_in', 'topup') THEN amount
            WHEN type IN ('adjustment_out', 'withdrawal', 'expense') THEN -amount
            ELSE 0
        END
    ), 0)
    INTO v_adjustments
    FROM cash_movements
    WHERE session_id = query_session_id;

    RETURN v_start_amount + v_order_total + v_adjustments;
END;
$$;
