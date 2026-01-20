-- ==============================================
-- MIGRATION: Secure Order Tracking & RPC
-- Description: Replaces insecure "public" access to orders with a secure RPC
-- and restrictive RLS policies.
-- ==============================================

-- 1. DROP INSECURE POLICY
-- Drop the policy that allowed anyone to SELECT any order
DROP POLICY IF EXISTS "Anyone can view order by direct ID lookup" ON orders;

-- 2. CREATE STRICT RLS POLICIES
-- Ensure clients can ONLY see their own orders via standard SELECT
-- (Note: "Clients can view their own orders" might already exist, we ensure it covers auth.uid())
DROP POLICY IF EXISTS "Clients can view their own orders" ON orders;

CREATE POLICY "Clients can view their own orders"
ON orders FOR SELECT
USING (client_id = auth.uid());

-- 3. CREATE SECURE RPC FOR TRACKING
-- This function allows retrieving a SPECIFIC order by ID without exposing the whole table.
-- It returns the order details and its items, suitable for the tracking page.
-- SECURITY DEFINER: Runs with privileges of the creator (postgres), bypassing RLS enforcement within the function,
-- allowing us to return data for a specific ID even if the user isn't logged in (e.g., cross-device tracking).
CREATE OR REPLACE FUNCTION get_public_order_status(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_items JSONB;
BEGIN
    -- Fetch the order
    SELECT * INTO v_order
    FROM orders
    WHERE id = p_order_id;

    IF v_order IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Fetch items with product details
    SELECT jsonb_agg(
        jsonb_build_object(
            'quantity', oi.quantity,
            'name', COALESCE(p.name, 'Producto'),
            'product', jsonb_build_object(
                'name', p.name,
                'is_active', p.is_active
            )
        )
    )
    INTO v_items
    FROM order_items oi
    LEFT JOIN inventory_items p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id;

    -- Return combined object matching frontend expectations
    RETURN jsonb_build_object(
        'success', true,
        'data', to_jsonb(v_order) || jsonb_build_object('order_items', COALESCE(v_items, '[]'::jsonb))
    );
END;
$$;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION get_public_order_status(UUID) TO anon, authenticated, service_role;
