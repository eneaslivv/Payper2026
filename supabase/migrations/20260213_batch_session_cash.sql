-- =============================================
-- MIGRATION: Batch Session Expected Cash
-- Date: 2026-02-13
-- Purpose: Eliminate N+1 query pattern for session expected cash calculations
-- =============================================

-- Batch version of get_session_expected_cash
-- Returns expected cash for multiple sessions in one call
CREATE OR REPLACE FUNCTION public.get_sessions_expected_cash_batch(
    session_ids UUID[]
)
RETURNS TABLE (
    session_id UUID,
    expected_cash NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    RETURN QUERY
    SELECT
        cs.id AS session_id,
        COALESCE(
            cs.opening_cash +
            -- Add all income movements
            (SELECT COALESCE(SUM(amount), 0)
             FROM cash_movements cm
             WHERE cm.session_id = cs.id
             AND cm.type IN ('sale', 'topup', 'adjustment_in'))
            -
            -- Subtract all outgoing movements
            (SELECT COALESCE(SUM(amount), 0)
             FROM cash_movements cm
             WHERE cm.session_id = cs.id
             AND cm.type IN ('withdrawal', 'expense', 'adjustment_out')),
            cs.opening_cash
        ) AS expected_cash
    FROM cash_sessions cs
    WHERE cs.id = ANY(session_ids)
    AND cs.closed_at IS NULL
    ORDER BY cs.id;
END;
$$;

COMMENT ON FUNCTION public.get_sessions_expected_cash_batch IS 'Batch version of get_session_expected_cash to avoid N+1 queries';

GRANT EXECUTE ON FUNCTION public.get_sessions_expected_cash_batch TO authenticated;

-- Verification query
SELECT
    'Batch session cash function created' as status,
    COUNT(*) as test_count
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name = 'get_sessions_expected_cash_batch';
