-- ============================================================================
-- Fix: BUG-W2 — wallet_ledger.wallet_id inconsistente en triggers de órdenes
-- Date: 2026-02-18
-- Approved by: user (2026-02-18) — core-guardian validation
-- Tracked in: known-bugs.md → BUG-W2, pending-decisions.md → PD-004 (W2)
--
-- Causa raíz:
--   Las 3 funciones trigger de wallet en órdenes insertan en wallet_ledger
--   usando wallet_id = v_wallet_id (wallets.id), pero el trigger
--   update_wallet_balance_from_ledger() hace:
--     UPDATE clients SET wallet_balance = NEW.balance_after WHERE id = NEW.wallet_id
--   → El WHERE espera clients.id, no wallets.id → golpea 0 filas → clients.wallet_balance
--     nunca se actualiza tras edición o cancelación de orden.
--
--   pay_with_wallet y create_order_atomic usan correctamente wallet_id = clients.id,
--   por eso el trigger funciona para pagos pero no para ediciones/cancelaciones.
--
-- Fix (quirúrgico):
--   En los 3 INSERTs a wallet_ledger, cambiar wallet_id de v_wallet_id a v_client_id.
--   El trigger ya funciona correctamente — no se toca.
--   El UPDATE wallets SET balance se mantiene como cache secundario.
--
-- Impacto:
--   - Edición de orden (wallet): clients.wallet_balance ahora se actualiza ✓
--   - Cancelación de orden (wallet): clients.wallet_balance ahora se actualiza ✓
--   - wallet_ledger.wallet_id = clients.id consistente con el resto del sistema ✓
--
-- No se modifica:
--   - Trigger update_wallet_balance_from_ledger (sin cambios)
--   - UPDATE wallets SET balance (se mantiene como cache secundario)
--   - FOR UPDATE locks (se mantienen)
--   - Lógica de negocio, condiciones de disparo, descripciones (sin cambios)
--   - Firmas de funciones (trigger functions — sin parámetros)
--
-- Reversibilidad:
--   Cambiar wallet_id = v_client_id de vuelta a wallet_id = v_wallet_id en los 3 INSERTs.
--
-- Nota futura (no bloqueante):
--   Renombrar wallet_ledger.wallet_id → owner_id para reflejar que es clients.id.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PRE-CHECK
-- ============================================================================

DO $$
DECLARE
    v_trigger_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE t.tgrelid = 'wallet_ledger'::regclass
          AND p.proname = 'update_wallet_balance_from_ledger'
    ) INTO v_trigger_exists;

    IF NOT v_trigger_exists THEN
        RAISE EXCEPTION 'CRITICAL: trigger update_wallet_balance_from_ledger no existe — no se puede proceder';
    END IF;

    RAISE NOTICE 'PRE-CHECK: trigger update_wallet_balance_from_ledger activo en wallet_ledger ✓';
END $$;

-- ============================================================================
-- FIX 1: wallet_additional_charge_on_edit
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet_additional_charge_on_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_amount_delta NUMERIC;
    v_client_id UUID;
    v_wallet_id UUID;
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
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

    SELECT id, balance INTO v_wallet_id, v_current_balance
    FROM wallets
    WHERE user_id = v_client_id
      AND store_id = NEW.store_id
    FOR UPDATE;

    IF v_wallet_id IS NULL THEN
        RAISE WARNING '[Wallet Additional Charge] Wallet not found for client %', v_client_id;
        RETURN NEW;
    END IF;

    IF v_current_balance < v_amount_delta THEN
        RAISE WARNING '[Wallet Additional Charge] Insufficient balance for order % edit. Required: $%, Available: $%',
            NEW.id, v_amount_delta, v_current_balance;

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
            'low_stock',
            v_current_balance,
            v_amount_delta,
            'Balance insuficiente para cargo adicional: Cliente tiene $' || v_current_balance || ' pero necesita $' || v_amount_delta,
            NEW.id
        );

        RETURN NEW;
    END IF;

    v_new_balance := v_current_balance - v_amount_delta;

    RAISE NOTICE '[Wallet Additional Charge] Order % edited: total increased from $% to $% (charge: $%)',
        NEW.id, OLD.total_amount, NEW.total_amount, v_amount_delta;

    -- BUG-W2 FIX: wallet_id = v_client_id (clients.id) en vez de v_wallet_id (wallets.id)
    -- Permite que trigger update_wallet_balance_from_ledger actualice clients.wallet_balance
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        entry_type,
        amount,
        balance_after,
        reference_type,
        reference_id,
        description
    ) VALUES (
        v_client_id,
        NEW.store_id,
        'debit',
        -v_amount_delta,
        v_new_balance,
        'order',
        NEW.id,
        'Cargo adicional por edición de orden #' || LEFT(NEW.id::text, 8) ||
        ' ($' || OLD.total_amount || ' → $' || NEW.total_amount || ')'
    );

    -- Mantener wallets.balance como cache secundario
    UPDATE wallets
    SET balance = v_new_balance,
        last_updated = NOW()
    WHERE id = v_wallet_id;

    RAISE NOTICE '[Wallet Additional Charge] Charged $% to client %. New balance: $%',
        v_amount_delta, v_client_id, v_new_balance;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX 2: wallet_partial_refund_on_edit
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet_partial_refund_on_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_amount_delta NUMERIC;
    v_client_id UUID;
    v_wallet_id UUID;
    v_new_balance NUMERIC;
BEGIN
    IF NEW.payment_method != 'wallet'
       OR NEW.is_paid != TRUE
       OR NEW.total_amount >= OLD.total_amount
       OR NEW.status IN ('cancelled', 'refunded') THEN
        RETURN NEW;
    END IF;

    v_client_id := NEW.client_id;
    v_amount_delta := OLD.total_amount - NEW.total_amount;

    IF v_client_id IS NULL OR v_amount_delta < 0.01 THEN
        RETURN NEW;
    END IF;

    RAISE NOTICE '[Wallet Partial Refund] Order % edited: total reduced from $% to $% (refund: $%)',
        NEW.id, OLD.total_amount, NEW.total_amount, v_amount_delta;

    SELECT id, balance INTO v_wallet_id, v_new_balance
    FROM wallets
    WHERE user_id = v_client_id
      AND store_id = NEW.store_id
    FOR UPDATE;

    IF v_wallet_id IS NULL THEN
        RAISE WARNING '[Wallet Partial Refund] Wallet not found for client %', v_client_id;
        RETURN NEW;
    END IF;

    v_new_balance := v_new_balance + v_amount_delta;

    -- BUG-W2 FIX: wallet_id = v_client_id (clients.id) en vez de v_wallet_id (wallets.id)
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        entry_type,
        amount,
        balance_after,
        reference_type,
        reference_id,
        description
    ) VALUES (
        v_client_id,
        NEW.store_id,
        'refund',
        v_amount_delta,
        v_new_balance,
        'order',
        NEW.id,
        'Reembolso parcial por edición de orden #' || LEFT(NEW.id::text, 8) ||
        ' ($' || OLD.total_amount || ' → $' || NEW.total_amount || ')'
    );

    -- Mantener wallets.balance como cache secundario
    UPDATE wallets
    SET balance = v_new_balance,
        last_updated = NOW()
    WHERE id = v_wallet_id;

    RAISE NOTICE '[Wallet Partial Refund] Refunded $% to client %. New balance: $%',
        v_amount_delta, v_client_id, v_new_balance;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- FIX 3: wallet_refund_on_cancellation
-- ============================================================================

CREATE OR REPLACE FUNCTION wallet_refund_on_cancellation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_client_id UUID;
    v_wallet_id UUID;
    v_refund_amount NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    IF NEW.status = 'cancelled'
       AND OLD.payment_method = 'wallet'
       AND OLD.is_paid = TRUE
       AND OLD.status != 'cancelled' THEN

        v_client_id := OLD.client_id;
        v_refund_amount := OLD.total_amount;

        IF v_client_id IS NOT NULL AND v_refund_amount > 0 THEN
            RAISE NOTICE '[Wallet Refund] Order % cancelled, refunding $% to client %',
                NEW.id, v_refund_amount, v_client_id;

            SELECT id, balance INTO v_wallet_id, v_new_balance
            FROM wallets
            WHERE user_id = v_client_id
              AND store_id = NEW.store_id
            FOR UPDATE;

            IF v_wallet_id IS NULL THEN
                RAISE WARNING '[Wallet Refund] Wallet not found for client %', v_client_id;
                RETURN NEW;
            END IF;

            v_new_balance := v_new_balance + v_refund_amount;

            -- BUG-W2 FIX: wallet_id = v_client_id (clients.id) en vez de v_wallet_id (wallets.id)
            INSERT INTO wallet_ledger (
                wallet_id,
                store_id,
                entry_type,
                amount,
                balance_after,
                reference_type,
                reference_id,
                description
            ) VALUES (
                v_client_id,
                NEW.store_id,
                'refund',
                v_refund_amount,
                v_new_balance,
                'order',
                NEW.id,
                'Reembolso por cancelación de orden #' || LEFT(NEW.id::text, 8)
            );

            -- Mantener wallets.balance como cache secundario
            UPDATE wallets
            SET balance = v_new_balance,
                last_updated = NOW()
            WHERE id = v_wallet_id;

            RAISE NOTICE '[Wallet Refund] Refunded $% to client %. New balance: $%',
                v_refund_amount, v_client_id, v_new_balance;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_charge_fixed   BOOLEAN;
    v_refund_fixed   BOOLEAN;
    v_cancel_fixed   BOOLEAN;
BEGIN
    -- Verificar que los 3 INSERTs ahora usan v_client_id
    -- (buscamos que la función NO contenga el patrón de wallets.id como wallet_id)
    SELECT
        (prosrc ILIKE '%wallet_id,%' AND prosrc NOT ILIKE '%wallet_id, v_wallet_id%')
    INTO v_charge_fixed
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'wallet_additional_charge_on_edit';

    SELECT
        (prosrc ILIKE '%wallet_id,%' AND prosrc NOT ILIKE '%wallet_id, v_wallet_id%')
    INTO v_refund_fixed
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'wallet_partial_refund_on_edit';

    SELECT
        (prosrc ILIKE '%wallet_id,%' AND prosrc NOT ILIKE '%wallet_id, v_wallet_id%')
    INTO v_cancel_fixed
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'wallet_refund_on_cancellation';

    RAISE NOTICE '=== BUG-W2 Fix Applied ===';
    RAISE NOTICE 'wallet_additional_charge_on_edit: wallet_id usa v_client_id = %', v_charge_fixed;
    RAISE NOTICE 'wallet_partial_refund_on_edit:    wallet_id usa v_client_id = %', v_refund_fixed;
    RAISE NOTICE 'wallet_refund_on_cancellation:    wallet_id usa v_client_id = %', v_cancel_fixed;
    RAISE NOTICE '';
    RAISE NOTICE 'Flujo unificado:';
    RAISE NOTICE '  INSERT wallet_ledger(wallet_id=clients.id) → trigger → clients.wallet_balance ✓';
    RAISE NOTICE '  UPDATE wallets.balance (cache secundario) ✓';
    RAISE NOTICE '';
    RAISE NOTICE 'Post-deploy validation:';
    RAISE NOTICE '  1. Crear orden con wallet → editar (reducir monto)';
    RAISE NOTICE '     → clients.wallet_balance debe aumentar';
    RAISE NOTICE '     → wallet_ledger.wallet_id debe = clients.id';
    RAISE NOTICE '  2. Cancelar orden con wallet pagada';
    RAISE NOTICE '     → clients.wallet_balance debe aumentar con total_amount';
END $$;

COMMIT;
