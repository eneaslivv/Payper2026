-- =============================================
-- FIX #5: LOYALTY ENUM CORRECTION + REVERSAL
-- Fecha: 2026-02-13
-- Problema:
--   1. Trigger usa 'Entregado' (español) que no existe en enum
--   2. No hay reversión de puntos al cancelar orden
-- =============================================

-- 1. DROP OLD TRIGGER
DROP TRIGGER IF EXISTS on_order_delivered_loyalty ON public.orders;
DROP FUNCTION IF EXISTS public.trigger_process_loyalty_on_delivery();

-- 2. CREATE FIXED FUNCTION WITH ENUM CORRECTION + REVERSAL
CREATE OR REPLACE FUNCTION public.trigger_process_loyalty_on_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_points_earned INTEGER;
    v_current_balance INTEGER;
    v_existing_tx UUID;
    v_existing_points INTEGER;
BEGIN
    -- ============================================
    -- BRANCH A: EARN POINTS (when order served)
    -- ============================================
    -- FIX: Changed 'Entregado' → 'served' (valid enum)
    IF NEW.status = 'served' AND (OLD.status IS NULL OR OLD.status != 'served') THEN

       -- Skip if no client
       IF NEW.client_id IS NULL THEN
           RETURN NEW;
       END IF;

       -- Skip if not paid
       IF NOT COALESCE(NEW.is_paid, false) AND NEW.payment_status NOT IN ('approved', 'paid') THEN
           RETURN NEW;
       END IF;

       -- Check if points already awarded (idempotency)
       SELECT id INTO v_existing_tx
       FROM loyalty_transactions
       WHERE order_id = NEW.id
         AND type = 'earn'
         AND is_rolled_back = false;

       IF v_existing_tx IS NOT NULL THEN
           -- Points already awarded by another trigger (payment_status)
           RETURN NEW;
       END IF;

       -- Calculate points
       v_points_earned := calculate_order_points(NEW.id);
       IF v_points_earned <= 0 THEN
           RETURN NEW;
       END IF;

       -- Insert transaction (idempotent)
       INSERT INTO loyalty_transactions (
           store_id,
           client_id,
           order_id,
           type,
           points,
           description,
           created_at
       ) VALUES (
           NEW.store_id,
           NEW.client_id,
           NEW.id,
           'earn',
           v_points_earned,
           'Puntos por compra entregada #' || LEFT(NEW.id::text, 8),
           NOW()
       )
       ON CONFLICT (order_id, type) DO NOTHING;

       -- Only update balance if insert succeeded
       IF FOUND THEN
           UPDATE clients
           SET loyalty_points = COALESCE(loyalty_points, 0) + v_points_earned,
               updated_at = NOW()
           WHERE id = NEW.client_id;

           RAISE NOTICE 'Loyalty: Awarded % points to client % for order %',
               v_points_earned, NEW.client_id, NEW.id;
       END IF;
    END IF;

    -- ============================================
    -- BRANCH B: ROLLBACK POINTS (when order cancelled after served)
    -- ============================================
    -- NEW: Handle cancellation after points were awarded
    IF NEW.status = 'cancelled'
       AND OLD.status IN ('served', 'delivered')
       AND NEW.client_id IS NOT NULL THEN

        -- Find existing earn transaction to rollback
        SELECT id, points INTO v_existing_tx, v_existing_points
        FROM loyalty_transactions
        WHERE order_id = NEW.id
          AND type = 'earn'
          AND is_rolled_back = FALSE
        LIMIT 1;

        IF v_existing_tx IS NOT NULL THEN
            -- Mark transaction as rolled back
            UPDATE loyalty_transactions
            SET is_rolled_back = TRUE,
                rollback_reason = 'Order cancelled after delivery',
                rollback_at = NOW()
            WHERE id = v_existing_tx;

            -- Subtract points from client (prevent negative)
            UPDATE clients
            SET loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - v_existing_points),
                updated_at = NOW()
            WHERE id = NEW.client_id;

            -- Create reversal transaction for audit trail
            INSERT INTO loyalty_transactions (
                store_id,
                client_id,
                order_id,
                type,
                points,
                description,
                created_at
            ) VALUES (
                NEW.store_id,
                NEW.client_id,
                NEW.id,
                'reversal',
                -v_existing_points,
                'Reversión por cancelación de orden #' || LEFT(NEW.id::text, 8),
                NOW()
            );

            RAISE NOTICE 'Loyalty: Rolled back % points from client % for cancelled order %',
                v_existing_points, NEW.client_id, NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 3. CREATE TRIGGER
CREATE TRIGGER on_order_delivered_loyalty
AFTER UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION trigger_process_loyalty_on_delivery();

-- 4. ENSURE UNIQUE CONSTRAINT FOR IDEMPOTENCY
-- Prevent duplicate earn transactions for same order
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'loyalty_transactions_order_type_unique'
    ) THEN
        ALTER TABLE loyalty_transactions
        ADD CONSTRAINT loyalty_transactions_order_type_unique
        UNIQUE (order_id, type)
        WHERE is_rolled_back = FALSE;
    END IF;
END $$;

-- 5. ADD is_rolled_back COLUMN IF MISSING
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'loyalty_transactions'
        AND column_name = 'is_rolled_back'
    ) THEN
        ALTER TABLE loyalty_transactions
        ADD COLUMN is_rolled_back BOOLEAN DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'loyalty_transactions'
        AND column_name = 'rollback_reason'
    ) THEN
        ALTER TABLE loyalty_transactions
        ADD COLUMN rollback_reason TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'loyalty_transactions'
        AND column_name = 'rollback_at'
    ) THEN
        ALTER TABLE loyalty_transactions
        ADD COLUMN rollback_at TIMESTAMPTZ;
    END IF;
END $$;

-- 6. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION trigger_process_loyalty_on_delivery() TO authenticated;
GRANT EXECUTE ON FUNCTION trigger_process_loyalty_on_delivery() TO service_role;

-- 7. COMMENT
COMMENT ON FUNCTION trigger_process_loyalty_on_delivery() IS
'Awards loyalty points when order status changes to ''served''.
Also handles REVERSAL when order is cancelled after being served.
Idempotent: prevents duplicate point awards via unique constraint.
FIX: Corrected enum from ''Entregado'' to ''served''.';
