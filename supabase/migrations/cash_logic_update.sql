-- Function to calculate expected cash for a session
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
    v_total DECIMAL(12,2);
BEGIN
    -- Get session details
    SELECT zone_id, opened_at, COALESCE(closed_at, NOW()), store_id
    INTO v_zone_id, v_opened_at, v_closed_at, v_store_id
    FROM cash_sessions
    WHERE id = query_session_id;

    IF v_zone_id IS NULL THEN
        RETURN 0;
    END IF;

    -- Calculate total
    SELECT COALESCE(SUM(o.total_amount), 0)
    INTO v_total
    FROM orders o
    JOIN venue_nodes vn ON o.node_id = vn.id
    WHERE o.store_id = v_store_id
    AND vn.zone_id = v_zone_id
    AND o.created_at >= v_opened_at
    AND o.created_at <= v_closed_at
    AND o.status NOT IN ('cancelled', 'draft')
    -- For now, filter typical cash strings, or NULL if your system defaults to cash for manual entries
    -- Adjust 'efectivo', 'cash' based on your specific implementation of manual orders
    AND (o.payment_method ILIKE '%efectivo%' OR o.payment_method ILIKE '%cash%' OR o.payment_method IS NULL);

    RETURN v_total;
END;
$$;
