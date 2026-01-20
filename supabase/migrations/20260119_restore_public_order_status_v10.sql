-- FIX: Restore accidentally deleted function (V10)
-- Priority: High
-- Reason: The V9 "Search and Destroy" script incorrectly identified 'get_public_order_status' as dangerous 
--         because it contained 'quantity' and 'inventory_items' in the same body.
--         It uses order_items.quantity (safe) and joins inventory_items for names (safe).

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

GRANT EXECUTE ON FUNCTION get_public_order_status(UUID) TO anon, authenticated, service_role;
