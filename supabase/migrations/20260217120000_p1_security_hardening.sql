-- ============================================================
-- P1 SECURITY HARDENING MIGRATION
-- Applied: 2026-02-17
--
-- Fixes:
--   1. UNIQUE index on stock_movements.idempotency_key (prevent duplicate movements)
--   2. SET search_path = public on ALL SECURITY DEFINER functions (prevent search_path injection)
--   3. Fix get_session_expected_cash() to exclude NULL payment_method orders
-- ============================================================

-- ============================================================
-- 1. UNIQUE PARTIAL INDEX ON stock_movements.idempotency_key
-- ============================================================
-- Prevents duplicate stock movements from retries/race conditions.
-- Partial index: only enforces uniqueness where key is NOT NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_idempotency_unique
ON stock_movements(idempotency_key)
WHERE idempotency_key IS NOT NULL;


-- ============================================================
-- 2. FIX search_path ON ALL SECURITY DEFINER FUNCTIONS
-- ============================================================
-- SECURITY DEFINER functions without SET search_path are vulnerable
-- to search_path injection attacks. This dynamically finds and fixes
-- ALL public schema SECURITY DEFINER functions missing the setting.
DO $$
DECLARE
    func_rec RECORD;
    func_args TEXT;
BEGIN
    FOR func_rec IN
        SELECT p.oid, n.nspname AS schema_name, p.proname AS func_name
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.prosecdef = true            -- SECURITY DEFINER
          AND n.nspname = 'public'          -- public schema only
          AND NOT EXISTS (
              SELECT 1 FROM unnest(p.proconfig) AS c
              WHERE c LIKE 'search_path=%'
          )
    LOOP
        func_args := pg_get_function_identity_arguments(func_rec.oid);
        EXECUTE format(
            'ALTER FUNCTION %I.%I(%s) SET search_path = public',
            func_rec.schema_name,
            func_rec.func_name,
            func_args
        );
        RAISE NOTICE 'Fixed search_path on: %.%(%)', func_rec.schema_name, func_rec.func_name, func_args;
    END LOOP;
END $$;


-- ============================================================
-- 3. FIX get_session_expected_cash: exclude NULL payment_method
-- ============================================================
-- Previously, orders with NULL payment_method were counted as cash,
-- inflating expected cash totals. Only explicit cash/efectivo should count.
CREATE OR REPLACE FUNCTION get_session_expected_cash(query_session_id UUID)
RETURNS DECIMAL(12,2)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    -- FIX: Removed "OR o.payment_method IS NULL" - NULL payment_method should NOT count as cash
    SELECT COALESCE(SUM(o.total_amount), 0)
    INTO v_order_total
    FROM orders o
    WHERE o.store_id = v_store_id
      AND o.status NOT IN ('cancelled', 'draft')
      AND (o.payment_method ILIKE '%efectivo%' OR o.payment_method ILIKE '%cash%')
      AND (
          o.cash_session_id = query_session_id
          OR (
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
