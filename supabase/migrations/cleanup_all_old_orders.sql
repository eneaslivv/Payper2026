-- CLEANUP SCRIPT: PURGE OLD STUCK ORDERS
-- This script cancels and archives ALL orders older than 24 hours that are not finalized.
-- Use this to clean up the Dispatch Board (Tablero de Despacho).

DO $$
DECLARE
    v_count INT;
BEGIN
    -- 1. Identify and Update Old Orders
    -- Criteria: Created > 24 hours ago AND Status is NOT (served, delivered, cancelled)
    WITH archived_rows AS (
        UPDATE orders
        SET 
            status = 'cancelled',        -- Cancel them effectively
            archived_at = NOW(),         -- Archive them so they disappear from default views
            updated_at = NOW()
        WHERE 
            created_at < (NOW() - INTERVAL '24 hours') 
            AND status NOT IN ('served', 'delivered', 'cancelled')
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM archived_rows;

    -- 2. Log Result
    RAISE NOTICE '🧹 CLEANUP COMPLETE.';
    RAISE NOTICE '🗑️ Archived % old stuck orders.', v_count;
    
    -- 3. Also fix any "Served" but not "Delivered" older than 24h (stuck in Ready column)
    WITH fixed_delivery AS (
        UPDATE orders
        SET 
            delivery_status = 'delivered',
            updated_at = NOW()
        WHERE 
            created_at < (NOW() - INTERVAL '24 hours')
            AND status = 'served'
            AND delivery_status != 'delivered'
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM fixed_delivery;
    
    RAISE NOTICE '🔧 Fixed % old served orders pending delivery status.', v_count;

END $$;
