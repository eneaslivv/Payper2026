-- NUCLEAR CLEANUP: RESET DISPATCH BOARD
-- This script archives ALL pending/active orders to allow a fresh start.
-- It ignores only 'delivered' or 'served' orders that are already done.

DO $$
DECLARE
    v_count INT;
BEGIN
    -- Archive everything that is active on the board
    WITH archived_rows AS (
        UPDATE orders
        SET 
            status = 'cancelled',
            archived_at = NOW(),
            updated_at = NOW()
        WHERE 
            status IN ('pending', 'confirmed', 'preparing', 'ready', 'in_progress')
            AND archived_at IS NULL
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM archived_rows;

    RAISE NOTICE '☢️ NUCLEAR RESET COMPLETE.';
    RAISE NOTICE '🗑️ Archived % active orders. The board should now be empty (0).', v_count;
END $$;
