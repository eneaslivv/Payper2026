-- ============================================================================
-- Fix: BUG-W4 — get_financial_metrics() lee wallets.balance (siempre $0)
-- Date: 2026-02-18
-- Approved by: user (2026-02-18) — core-guardian validation
-- Tracked in: known-bugs.md → BUG-W4, pending-decisions.md → PD-004 (W4)
--
-- Diagnóstico:
--   get_financial_metrics(p_store_id) — Overload 1 (sin rango de fechas) —
--   calcula total_liability (pasivo wallet) leyendo SUM(wallets.balance).
--
--   wallets.balance NO es actualizado por las operaciones de pago principales:
--     - pay_with_wallet(3-params) → actualiza clients.wallet_balance via ledger
--     - create_order_atomic        → actualiza clients.wallet_balance via ledger
--   Por tanto wallets.balance = $0 para todos → total_liability = $0 siempre.
--
--   Fuente correcta actual: clients.wallet_balance
--
-- Fix:
--   Reemplazar únicamente el bloque de cálculo de v_total_liability en Overload 1.
--   FROM wallets WHERE balance > 0
--   → FROM clients WHERE wallet_balance > 0
--
-- No se modifica:
--   - Overload 2 (con p_start_date / p_end_date) — no calcula total_liability
--   - Lógica de revenue, topups, cash metrics — sin cambios
--   - wallet_ledger, wallets, clients — sin mutaciones
--   - Ningún trigger, política RLS, o función adicional
--
-- Reversibilidad:
--   Volver a FROM wallets WHERE store_id = p_store_id AND balance > 0
-- ============================================================================

BEGIN;

-- ============================================================================
-- THE FIX: Recrear Overload 1 con la fuente correcta de total_liability
-- ============================================================================

CREATE OR REPLACE FUNCTION get_financial_metrics(p_store_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today_start TIMESTAMPTZ;
    v_revenue_today NUMERIC DEFAULT 0;
    v_order_count INTEGER DEFAULT 0;
    v_avg_ticket NUMERIC DEFAULT 0;
    v_topups_today NUMERIC DEFAULT 0;
    v_total_liability NUMERIC DEFAULT 0;
BEGIN
    -- Inicio del día en UTC-3 (Argentina)
    v_today_start := date_trunc('day', NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires') AT TIME ZONE 'America/Argentina/Buenos_Aires';

    -- Ingresos de hoy (órdenes paid/completed)
    SELECT
        COALESCE(SUM(total_amount), 0),
        COUNT(*)
    INTO v_revenue_today, v_order_count
    FROM orders
    WHERE store_id = p_store_id
      AND created_at >= v_today_start
      AND status IN ('paid', 'completed', 'served');

    -- Ticket promedio
    IF v_order_count > 0 THEN
        v_avg_ticket := v_revenue_today / v_order_count;
    END IF;

    -- Cargas de wallet hoy
    SELECT COALESCE(SUM(amount), 0)
    INTO v_topups_today
    FROM wallet_ledger
    WHERE store_id = p_store_id
      AND entry_type = 'topup'
      AND created_at >= v_today_start;

    -- Pasivo total (saldo en billeteras de clientes)
    -- BUG-W4 FIX: leer desde clients.wallet_balance (fuente actualizada por ledger)
    -- en vez de wallets.balance (no actualizado por operaciones de pago principales)
    SELECT COALESCE(SUM(wallet_balance), 0)
    INTO v_total_liability
    FROM clients
    WHERE store_id = p_store_id
      AND wallet_balance > 0;

    RETURN jsonb_build_object(
        'revenue_today', v_revenue_today,
        'order_count', v_order_count,
        'avg_ticket', v_avg_ticket,
        'topups_today', v_topups_today,
        'total_liability', v_total_liability
    );
END;
$$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_result JSONB;
BEGIN
    RAISE NOTICE '=== BUG-W4 Fix Applied ===';
    RAISE NOTICE 'get_financial_metrics(uuid) — Overload 1 recreada';
    RAISE NOTICE 'v_total_liability ahora lee FROM clients WHERE wallet_balance > 0';
    RAISE NOTICE '';
    RAISE NOTICE 'Post-deploy validation requerida:';
    RAISE NOTICE '  1. SELECT SUM(wallet_balance) FROM clients WHERE store_id = <id> AND wallet_balance > 0;';
    RAISE NOTICE '  2. SELECT get_financial_metrics(<id>)->>''total_liability'';';
    RAISE NOTICE '     → Ambos valores deben coincidir exactamente';
    RAISE NOTICE '  3. Verificar que revenue_today, order_count, avg_ticket, topups_today no cambiaron';
END $$;

COMMIT;
