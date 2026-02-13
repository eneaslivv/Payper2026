-- =============================================
-- FIX #4: CASH SESSION COMPENSATION
-- Fecha: 2026-02-13
-- Problema:
--   expected_end_amount no se ajusta cuando:
--   - Método de pago cambia (cash → card)
--   - Orden se cancela después de pagada
--   - Total de orden se edita
-- Solución:
--   Trigger de compensación automática
-- =============================================

-- 1. FUNCTION: Compensate Cash Sessions on Order Changes
CREATE OR REPLACE FUNCTION compensate_cash_session_on_order_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old_cash_amount NUMERIC := 0;
    v_new_cash_amount NUMERIC := 0;
    v_delta NUMERIC := 0;
    v_target_session_id UUID;
    v_zone_id UUID;
BEGIN
    -- ============================================
    -- CALCULATE OLD CASH IMPACT
    -- ============================================
    IF OLD.payment_method = 'cash'
       AND OLD.is_paid = TRUE
       AND OLD.status NOT IN ('cancelled', 'refunded') THEN
        v_old_cash_amount := COALESCE(OLD.total_amount, 0);
    END IF;

    -- ============================================
    -- CALCULATE NEW CASH IMPACT
    -- ============================================
    IF NEW.payment_method = 'cash'
       AND NEW.is_paid = TRUE
       AND NEW.status NOT IN ('cancelled', 'refunded') THEN
        v_new_cash_amount := COALESCE(NEW.total_amount, 0);
    END IF;

    -- ============================================
    -- CALCULATE DELTA
    -- ============================================
    v_delta := v_new_cash_amount - v_old_cash_amount;

    -- Skip if no change
    IF v_delta = 0 THEN
        RETURN NEW;
    END IF;

    -- ============================================
    -- FIND ACTIVE CASH SESSION FOR THIS ORDER
    -- ============================================
    -- Try to find session by zone
    IF NEW.node_id IS NOT NULL THEN
        SELECT zone_id INTO v_zone_id
        FROM venue_nodes
        WHERE id = NEW.node_id;
    END IF;

    -- Find active session
    SELECT id INTO v_target_session_id
    FROM cash_sessions
    WHERE store_id = NEW.store_id
      AND status = 'open'
      AND (
          v_zone_id IS NULL
          OR zone_id = v_zone_id
      )
    ORDER BY opened_at DESC
    LIMIT 1;

    -- If no active session found, skip (order might be from different time)
    IF v_target_session_id IS NULL THEN
        RAISE NOTICE 'No active cash session found for order % adjustment',
            NEW.id;
        RETURN NEW;
    END IF;

    -- ============================================
    -- ADJUST CASH SESSION
    -- ============================================
    UPDATE cash_sessions
    SET expected_end_amount = expected_end_amount + v_delta,
        updated_at = NOW()
    WHERE id = v_target_session_id;

    -- ============================================
    -- LOG ADJUSTMENT IN CASH MOVEMENTS
    -- ============================================
    INSERT INTO cash_movements (
        session_id,
        amount,
        type,
        reason,
        order_id,
        created_at
    ) VALUES (
        v_target_session_id,
        v_delta,
        CASE
            WHEN v_delta > 0 THEN 'adjustment_add'
            ELSE 'adjustment_subtract'
        END,
        CASE
            WHEN OLD.payment_method != NEW.payment_method THEN
                'Cambio de método de pago: ' || COALESCE(OLD.payment_method, 'null') || ' → ' || NEW.payment_method
            WHEN OLD.status != NEW.status THEN
                'Cambio de estado: ' || OLD.status || ' → ' || NEW.status
            WHEN OLD.total_amount != NEW.total_amount THEN
                'Ajuste de monto: $' || OLD.total_amount || ' → $' || NEW.total_amount
            ELSE
                'Ajuste automático de orden'
        END,
        NEW.id,
        NOW()
    );

    RAISE NOTICE 'Cash session % adjusted by % for order % (reason: % → %)',
        v_target_session_id,
        v_delta,
        NEW.id,
        CASE
            WHEN OLD.payment_method != NEW.payment_method THEN 'payment method change'
            WHEN OLD.status != NEW.status THEN 'status change'
            ELSE 'amount change'
        END,
        v_new_cash_amount;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. CREATE TRIGGER
DROP TRIGGER IF EXISTS trg_compensate_cash_session ON orders;
CREATE TRIGGER trg_compensate_cash_session
AFTER UPDATE OF payment_method, total_amount, status, is_paid ON orders
FOR EACH ROW
EXECUTE FUNCTION compensate_cash_session_on_order_change();

-- 3. ENSURE cash_movements TABLE EXISTS WITH CORRECT STRUCTURE
DO $$
BEGIN
    -- Check if cash_movements exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'cash_movements'
    ) THEN
        CREATE TABLE cash_movements (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id UUID NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
            amount NUMERIC NOT NULL,
            type TEXT NOT NULL, -- 'withdrawal', 'deposit', 'adjustment_add', 'adjustment_subtract'
            reason TEXT,
            order_id UUID REFERENCES orders(id),
            created_by UUID REFERENCES profiles(id),
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX idx_cash_movements_session ON cash_movements(session_id);
        CREATE INDEX idx_cash_movements_order ON cash_movements(order_id);

        RAISE NOTICE 'Created cash_movements table';
    END IF;

    -- Add columns if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cash_movements'
        AND column_name = 'order_id'
    ) THEN
        ALTER TABLE cash_movements
        ADD COLUMN order_id UUID REFERENCES orders(id);
    END IF;
END $$;

-- 4. VIEW: Cash Session Reconciliation
CREATE OR REPLACE VIEW cash_session_reconciliation AS
SELECT
    cs.id as session_id,
    cs.store_id,
    cs.zone_id,
    z.name as zone_name,
    cs.opened_by,
    p_open.full_name as opened_by_name,
    cs.closed_by,
    p_close.full_name as closed_by_name,
    cs.opened_at,
    cs.closed_at,
    cs.status,
    cs.start_amount,
    cs.expected_end_amount,
    cs.end_amount,
    cs.discrepancy,
    -- Cash sales (original)
    COALESCE((
        SELECT SUM(o.total_amount)
        FROM orders o
        WHERE o.store_id = cs.store_id
          AND o.payment_method = 'cash'
          AND o.is_paid = TRUE
          AND o.status NOT IN ('cancelled', 'refunded')
          AND o.created_at BETWEEN cs.opened_at AND COALESCE(cs.closed_at, NOW())
    ), 0) as actual_cash_sales,
    -- Adjustments
    COALESCE((
        SELECT SUM(cm.amount)
        FROM cash_movements cm
        WHERE cm.session_id = cs.id
          AND cm.type IN ('adjustment_add', 'adjustment_subtract')
    ), 0) as total_adjustments,
    -- Withdrawals/Deposits
    COALESCE((
        SELECT SUM(cm.amount)
        FROM cash_movements cm
        WHERE cm.session_id = cs.id
          AND cm.type IN ('withdrawal', 'deposit')
    ), 0) as manual_movements
FROM cash_sessions cs
LEFT JOIN zones z ON cs.zone_id = z.id
LEFT JOIN profiles p_open ON cs.opened_by = p_open.id
LEFT JOIN profiles p_close ON cs.closed_by = p_close.id;

-- 5. RPC: Get Cash Session Breakdown
CREATE OR REPLACE FUNCTION get_cash_session_breakdown(p_session_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'session', row_to_json(cs.*),
        'cash_sales', (
            SELECT json_agg(
                json_build_object(
                    'order_id', o.id,
                    'order_number', o.order_number,
                    'amount', o.total_amount,
                    'created_at', o.created_at
                )
            )
            FROM orders o
            WHERE o.store_id = cs.store_id
              AND o.payment_method = 'cash'
              AND o.is_paid = TRUE
              AND o.status NOT IN ('cancelled', 'refunded')
              AND o.created_at BETWEEN cs.opened_at AND COALESCE(cs.closed_at, NOW())
        ),
        'movements', (
            SELECT json_agg(
                json_build_object(
                    'id', cm.id,
                    'amount', cm.amount,
                    'type', cm.type,
                    'reason', cm.reason,
                    'created_at', cm.created_at
                )
                ORDER BY cm.created_at
            )
            FROM cash_movements cm
            WHERE cm.session_id = cs.id
        ),
        'reconciliation', (
            SELECT row_to_json(csr.*)
            FROM cash_session_reconciliation csr
            WHERE csr.session_id = cs.id
        )
    ) INTO v_result
    FROM cash_sessions cs
    WHERE cs.id = p_session_id;

    RETURN v_result;
END;
$$;

-- 6. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION get_cash_session_breakdown(UUID) TO authenticated;
GRANT SELECT ON cash_session_reconciliation TO authenticated;
GRANT ALL ON cash_movements TO authenticated;

-- 7. COMMENT
COMMENT ON FUNCTION compensate_cash_session_on_order_change IS
'Automatically adjusts cash session expected_end_amount when:
- Payment method changes (cash ↔ other)
- Order is cancelled after being paid cash
- Order total amount is edited
Logs all adjustments in cash_movements for audit trail.';

COMMENT ON VIEW cash_session_reconciliation IS
'Complete reconciliation view showing cash sessions with:
- Expected vs actual amounts
- Adjustments and manual movements
- Discrepancies
Useful for closing cash sessions and auditing.';
