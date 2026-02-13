-- =============================================
-- FIX #6: STOCK ROLLBACK ON CANCELLATION
-- Fecha: 2026-02-13
-- Problema:
--   Cuando una orden se cancela DESPUÉS de haber descontado stock:
--   - Stock queda mal (phantom deduction)
--   - Productos aparecen agotados cuando no lo están
--   - No hay audit trail de reversión
-- Solución:
--   Trigger que revierte stock_movements al cancelar orden
-- =============================================

-- 1. FUNCTION: Rollback Stock on Order Cancellation
CREATE OR REPLACE FUNCTION rollback_stock_on_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    v_movement RECORD;
    v_reversal_qty NUMERIC;
BEGIN
    -- Only act if order status changed TO cancelled (and it was previously not cancelled)
    IF NEW.status = 'cancelled'
       AND (OLD.status IS NULL OR OLD.status != 'cancelled')
       AND NEW.stock_deducted = TRUE THEN

        RAISE NOTICE '[Stock Rollback] Order % cancelled, reverting stock movements', NEW.id;

        -- Find all stock_movements for this order (negative deltas = deductions)
        FOR v_movement IN
            SELECT
                sm.id,
                sm.inventory_item_id,
                sm.qty_delta,
                sm.unit_type,
                sm.location_id,
                sm.store_id
            FROM stock_movements sm
            WHERE sm.order_id = NEW.id
              AND sm.qty_delta < 0  -- Only reverse deductions
              AND sm.reason IN ('recipe_ingredient', 'direct_sale', 'order_fulfillment')
        LOOP
            -- Calculate reversal (negate the deduction)
            v_reversal_qty := ABS(v_movement.qty_delta);

            -- Create compensating movement (positive delta to restore stock)
            INSERT INTO stock_movements (
                idempotency_key,
                store_id,
                inventory_item_id,
                order_id,
                qty_delta,
                unit_type,
                reason,
                location_id,
                notes
            ) VALUES (
                gen_random_uuid(),
                v_movement.store_id,
                v_movement.inventory_item_id,
                NEW.id,
                v_reversal_qty,  -- Positive to restore
                v_movement.unit_type,
                'order_cancelled_restock',
                v_movement.location_id,
                'Automatic restock due to order cancellation (reversed movement: ' || v_movement.id || ')'
            );

            RAISE NOTICE '[Stock Rollback] Restored % %s of item % (reversed movement %)',
                v_reversal_qty, v_movement.unit_type, v_movement.inventory_item_id, v_movement.id;
        END LOOP;

        -- Mark that rollback was performed (optional flag)
        NEW.stock_rolled_back := TRUE;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. ADD stock_rolled_back FLAG (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders'
        AND column_name = 'stock_rolled_back'
    ) THEN
        ALTER TABLE orders
        ADD COLUMN stock_rolled_back BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 3. CREATE TRIGGER
DROP TRIGGER IF EXISTS trg_rollback_stock_on_cancel ON orders;
CREATE TRIGGER trg_rollback_stock_on_cancel
BEFORE UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION rollback_stock_on_cancellation();

-- 4. EXTEND cleanup_abandoned_orders TO ROLLBACK STOCK
-- Update the existing cleanup function to ensure stock rollback happens
CREATE OR REPLACE FUNCTION cleanup_abandoned_orders(
    p_timeout_hours INTEGER DEFAULT 2
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_abandoned_orders UUID[];
    v_count INTEGER := 0;
BEGIN
    -- Find abandoned orders
    SELECT array_agg(id) INTO v_abandoned_orders
    FROM orders
    WHERE status = 'pending'
      AND is_paid = FALSE
      AND (payment_method IS NULL OR payment_method = 'qr' OR payment_provider = 'mercadopago')
      AND created_at < NOW() - (p_timeout_hours || ' hours')::INTERVAL
      AND archived_at IS NULL;

    -- Cancel abandoned orders (trigger will handle stock rollback automatically)
    UPDATE orders
    SET status = 'cancelled',
        cancelled_reason = 'Payment timeout - abandoned after ' || p_timeout_hours || ' hours',
        cancelled_at = NOW(),
        updated_at = NOW()
    WHERE id = ANY(v_abandoned_orders);

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RAISE NOTICE 'Cleaned up % abandoned orders with automatic stock rollback (timeout: % hours)',
        v_count, p_timeout_hours;

    RETURN jsonb_build_object(
        'success', TRUE,
        'cancelled_count', v_count,
        'cancelled_orders', v_abandoned_orders,
        'timeout_hours', p_timeout_hours,
        'stock_rolled_back', TRUE
    );
END;
$$;

-- 5. HANDLE WALLET ROLLBACK (if wallet was debited)
CREATE OR REPLACE FUNCTION rollback_wallet_on_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    v_wallet_entry RECORD;
    v_client_id UUID;
BEGIN
    -- Only act if order cancelled after payment with wallet
    IF NEW.status = 'cancelled'
       AND (OLD.status IS NULL OR OLD.status != 'cancelled')
       AND NEW.payment_method = 'wallet'
       AND NEW.is_paid = TRUE
       AND NEW.client_id IS NOT NULL THEN

        v_client_id := NEW.client_id;

        -- Find the debit entry for this order
        SELECT * INTO v_wallet_entry
        FROM wallet_ledger
        WHERE client_id = v_client_id
          AND order_id = NEW.id
          AND entry_type = 'debit'
          AND amount < 0
        LIMIT 1;

        IF FOUND THEN
            -- Create compensating credit entry
            INSERT INTO wallet_ledger (
                client_id,
                store_id,
                order_id,
                entry_type,
                amount,
                balance_after,
                description
            ) VALUES (
                v_client_id,
                NEW.store_id,
                NEW.id,
                'refund',
                ABS(v_wallet_entry.amount),  -- Positive to restore
                (SELECT wallet_balance FROM clients WHERE id = v_client_id) + ABS(v_wallet_entry.amount),
                'Automatic refund due to order cancellation #' || LEFT(NEW.id::text, 8)
            );

            -- Update client's wallet balance
            UPDATE clients
            SET wallet_balance = wallet_balance + ABS(v_wallet_entry.amount),
                updated_at = NOW()
            WHERE id = v_client_id;

            RAISE NOTICE '[Wallet Rollback] Refunded $% to client % for cancelled order %',
                ABS(v_wallet_entry.amount), v_client_id, NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. CREATE WALLET ROLLBACK TRIGGER
DROP TRIGGER IF EXISTS trg_rollback_wallet_on_cancel ON orders;
CREATE TRIGGER trg_rollback_wallet_on_cancel
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION rollback_wallet_on_cancellation();

-- 7. VIEW: Cancelled Orders with Rollback Status
CREATE OR REPLACE VIEW cancelled_orders_audit AS
SELECT
    o.id,
    o.order_number,
    o.store_id,
    s.name as store_name,
    o.status,
    o.cancelled_reason,
    o.cancelled_at,
    o.total_amount,
    o.payment_method,
    o.is_paid,
    o.stock_deducted,
    o.stock_rolled_back,
    -- Count of rollback movements
    (
        SELECT COUNT(*)
        FROM stock_movements sm
        WHERE sm.order_id = o.id
          AND sm.reason = 'order_cancelled_restock'
    ) as rollback_movements_count,
    -- Loyalty rollback status (from existing loyalty fix)
    (
        SELECT COUNT(*)
        FROM loyalty_transactions lt
        WHERE lt.order_id = o.id
          AND lt.is_rolled_back = TRUE
    ) as loyalty_rolled_back,
    o.created_at
FROM orders o
JOIN stores s ON o.store_id = s.id
WHERE o.status = 'cancelled'
  AND o.cancelled_at IS NOT NULL
ORDER BY o.cancelled_at DESC;

-- 8. GRANT PERMISSIONS
GRANT SELECT ON cancelled_orders_audit TO authenticated;
GRANT EXECUTE ON FUNCTION rollback_stock_on_cancellation() TO authenticated;
GRANT EXECUTE ON FUNCTION rollback_wallet_on_cancellation() TO authenticated;

-- 9. COMMENT
COMMENT ON FUNCTION rollback_stock_on_cancellation IS
'Automatically reverts stock_movements when order status changes to cancelled.
Creates compensating positive movements to restore inventory.
Only reverses movements with reason: recipe_ingredient, direct_sale, order_fulfillment.
Sets stock_rolled_back flag for audit trail.';

COMMENT ON FUNCTION rollback_wallet_on_cancellation IS
'Automatically refunds wallet balance when paid wallet order is cancelled.
Creates compensating credit entry in wallet_ledger.
Updates client wallet_balance.';

COMMENT ON VIEW cancelled_orders_audit IS
'Audit view showing cancelled orders with rollback status.
Shows counts of stock rollback movements and loyalty rollbacks.
Useful for reconciliation and debugging.';
