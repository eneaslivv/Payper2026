-- =============================================
-- FIX #13: WALLET PARTIAL REFUND ON ORDER EDIT
-- Fecha: 2026-02-13
-- Problema:
--   Orden pagada con wallet, staff edita y reduce total:
--   - Baja de $100 → $80
--   - No hay refund automático de $20
--   - Cliente pierde dinero silenciosamente
-- Solución:
--   Trigger que detecta reducción de total_amount
--   y crea refund proporcional en wallet
-- =============================================

-- 1. FUNCTION: Wallet Partial Refund on Order Edit
CREATE OR REPLACE FUNCTION wallet_partial_refund_on_edit()
RETURNS TRIGGER AS $$
DECLARE
    v_amount_delta NUMERIC;
    v_client_id UUID;
    v_new_balance NUMERIC;
BEGIN
    -- GUARD: Only act if:
    -- 1. Order was paid with wallet
    -- 2. Order is paid
    -- 3. Total amount decreased
    -- 4. Not cancelled/refunded
    IF NEW.payment_method != 'wallet'
       OR NEW.is_paid != TRUE
       OR NEW.total_amount >= OLD.total_amount
       OR NEW.status IN ('cancelled', 'refunded') THEN
        RETURN NEW;
    END IF;

    v_client_id := NEW.client_id;
    v_amount_delta := OLD.total_amount - NEW.total_amount;

    -- Skip if no client or delta too small (< 1 cent)
    IF v_client_id IS NULL OR v_amount_delta < 0.01 THEN
        RETURN NEW;
    END IF;

    RAISE NOTICE '[Wallet Partial Refund] Order % edited: total reduced from $% to $% (refund: $%)',
        NEW.id, OLD.total_amount, NEW.total_amount, v_amount_delta;

    -- Get current balance
    SELECT wallet_balance INTO v_new_balance
    FROM clients
    WHERE id = v_client_id
    FOR UPDATE;

    v_new_balance := v_new_balance + v_amount_delta;

    -- Create refund entry in wallet_ledger
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
        v_amount_delta,
        v_new_balance,
        'Reembolso parcial por edición de orden #' || LEFT(NEW.id::text, 8) ||
        ' ($' || OLD.total_amount || ' → $' || NEW.total_amount || ')'
    );

    -- Update client balance
    UPDATE clients
    SET wallet_balance = v_new_balance,
        updated_at = NOW()
    WHERE id = v_client_id;

    RAISE NOTICE '[Wallet Partial Refund] Refunded $% to client %. New balance: $%',
        v_amount_delta, v_client_id, v_new_balance;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. CREATE TRIGGER
DROP TRIGGER IF EXISTS trg_wallet_partial_refund_on_edit ON orders;
CREATE TRIGGER trg_wallet_partial_refund_on_edit
AFTER UPDATE OF total_amount ON orders
FOR EACH ROW
EXECUTE FUNCTION wallet_partial_refund_on_edit();

-- 3. FUNCTION: Wallet Additional Charge on Order Edit
-- (Si el total AUMENTA en lugar de disminuir)
CREATE OR REPLACE FUNCTION wallet_additional_charge_on_edit()
RETURNS TRIGGER AS $$
DECLARE
    v_amount_delta NUMERIC;
    v_client_id UUID;
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- GUARD: Only act if:
    -- 1. Order was paid with wallet
    -- 2. Order is paid
    -- 3. Total amount INCREASED
    -- 4. Not cancelled/refunded
    IF NEW.payment_method != 'wallet'
       OR NEW.is_paid != TRUE
       OR NEW.total_amount <= OLD.total_amount
       OR NEW.status IN ('cancelled', 'refunded') THEN
        RETURN NEW;
    END IF;

    v_client_id := NEW.client_id;
    v_amount_delta := NEW.total_amount - OLD.total_amount;

    IF v_client_id IS NULL OR v_amount_delta < 0.01 THEN
        RETURN NEW;
    END IF;

    -- Get current balance with lock
    SELECT wallet_balance INTO v_current_balance
    FROM clients
    WHERE id = v_client_id
    FOR UPDATE;

    -- Check if client has sufficient balance for additional charge
    IF v_current_balance < v_amount_delta THEN
        RAISE WARNING '[Wallet Additional Charge] Insufficient balance for order % edit. Required: $%, Available: $%',
            NEW.id, v_amount_delta, v_current_balance;

        -- Create alert (could also throw exception to prevent edit)
        INSERT INTO stock_alerts (
            store_id,
            inventory_item_id,
            alert_type,
            stock_level,
            expected_stock,
            message,
            order_id
        ) VALUES (
            NEW.store_id,
            NULL,
            'low_stock',  -- Reusing this type
            v_current_balance,
            v_amount_delta,
            'Balance insuficiente para cargo adicional: Cliente tiene $' || v_current_balance || ' pero necesita $' || v_amount_delta,
            NEW.id
        );

        RETURN NEW;  -- Allow edit but don't charge
    END IF;

    v_new_balance := v_current_balance - v_amount_delta;

    RAISE NOTICE '[Wallet Additional Charge] Order % edited: total increased from $% to $% (charge: $%)',
        NEW.id, OLD.total_amount, NEW.total_amount, v_amount_delta;

    -- Create debit entry
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
        'debit',
        -v_amount_delta,
        v_new_balance,
        'Cargo adicional por edición de orden #' || LEFT(NEW.id::text, 8) ||
        ' ($' || OLD.total_amount || ' → $' || NEW.total_amount || ')'
    );

    -- Update client balance
    UPDATE clients
    SET wallet_balance = v_new_balance,
        updated_at = NOW()
    WHERE id = v_client_id;

    RAISE NOTICE '[Wallet Additional Charge] Charged $% to client %. New balance: $%',
        v_amount_delta, v_client_id, v_new_balance;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. CREATE TRIGGER
DROP TRIGGER IF EXISTS trg_wallet_additional_charge_on_edit ON orders;
CREATE TRIGGER trg_wallet_additional_charge_on_edit
AFTER UPDATE OF total_amount ON orders
FOR EACH ROW
EXECUTE FUNCTION wallet_additional_charge_on_edit();

-- 5. VIEW: Wallet Refund/Charge Audit
CREATE OR REPLACE VIEW wallet_adjustment_audit AS
SELECT
    wl.id,
    wl.client_id,
    c.name as client_name,
    c.email as client_email,
    wl.store_id,
    s.name as store_name,
    wl.order_id,
    o.order_number,
    wl.entry_type,
    wl.amount,
    wl.balance_after,
    wl.description,
    wl.created_at,
    -- Detect if this is a partial refund/charge (vs full transaction)
    CASE
        WHEN wl.description LIKE '%edición de orden%' THEN TRUE
        ELSE FALSE
    END as is_order_edit_adjustment
FROM wallet_ledger wl
JOIN clients c ON wl.client_id = c.id
JOIN stores s ON wl.store_id = s.id
LEFT JOIN orders o ON wl.order_id = o.id
WHERE wl.entry_type IN ('refund', 'debit')
  AND wl.description LIKE '%edición%'
ORDER BY wl.created_at DESC;

-- 6. GRANT PERMISSIONS
GRANT SELECT ON wallet_adjustment_audit TO authenticated;
GRANT EXECUTE ON FUNCTION wallet_partial_refund_on_edit TO authenticated;
GRANT EXECUTE ON FUNCTION wallet_additional_charge_on_edit TO authenticated;

-- 7. COMMENT
COMMENT ON FUNCTION wallet_partial_refund_on_edit IS
'Trigger que reembolsa automáticamente wallet cuando el total de orden DISMINUYE.
Ejemplo: Orden de $100 → $80, reembolsa $20.
Solo actúa si orden fue pagada con wallet.
Crea entry tipo "refund" en wallet_ledger.';

COMMENT ON FUNCTION wallet_additional_charge_on_edit IS
'Trigger que cobra automáticamente wallet cuando el total de orden AUMENTA.
Ejemplo: Orden de $80 → $100, cobra $20 adicionales.
Valida que cliente tenga balance suficiente.
Si no hay balance, crea alerta pero permite edit (no bloquea).';

COMMENT ON VIEW wallet_adjustment_audit IS
'Audit trail de ajustes de wallet por ediciones de órdenes.
Muestra refunds y cargos adicionales con descripción detallada.
Columna is_order_edit_adjustment filtra solo ediciones (no transacciones originales).';
