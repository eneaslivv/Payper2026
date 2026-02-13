-- =============================================
-- FIX #2: OFFLINE STOCK SYNC VALIDATION
-- Fecha: 2026-02-13
-- Problema:
--   Sync offline puede causar stock negativo cuando:
--   - Staff A (offline) vende producto
--   - Staff B (online) vende último stock
--   - Staff A sync → intenta restar de stock=0 → CONSTRAINT ERROR
-- Solución:
--   1. Permitir stock negativo temporal con alertas
--   2. RPC especial para sync offline con validación
-- =============================================

-- 1. REMOVE HARD CONSTRAINT (Allow Negative Stock Temporarily)
DO $$
BEGIN
    -- Drop constraint if exists
    ALTER TABLE inventory_items
    DROP CONSTRAINT IF EXISTS stock_non_negative;

    ALTER TABLE inventory_items
    DROP CONSTRAINT IF EXISTS inventory_items_current_stock_check;

    RAISE NOTICE 'Removed hard stock constraint to allow offline sync compensation';
END $$;

-- 2. CREATE STOCK ALERTS TABLE
CREATE TABLE IF NOT EXISTS stock_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL, -- 'negative_stock', 'low_stock', 'offline_conflict'
    stock_level NUMERIC NOT NULL,
    expected_stock NUMERIC,
    message TEXT,
    order_id UUID REFERENCES orders(id),
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_by UUID REFERENCES profiles(id),
    acknowledged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_unacknowledged
ON stock_alerts(store_id, acknowledged)
WHERE acknowledged = FALSE;

-- 3. TRIGGER: Alert on Negative Stock
CREATE OR REPLACE FUNCTION alert_on_negative_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- Alert if stock goes negative
    IF NEW.current_stock < 0 AND (OLD.current_stock IS NULL OR OLD.current_stock >= 0) THEN
        INSERT INTO stock_alerts (
            store_id,
            inventory_item_id,
            alert_type,
            stock_level,
            message
        ) VALUES (
            NEW.store_id,
            NEW.id,
            'negative_stock',
            NEW.current_stock,
            'Stock negativo detectado: ' || NEW.name || ' tiene ' || NEW.current_stock || ' unidades'
        );

        -- Notify via pg_notify for real-time alerts
        PERFORM pg_notify(
            'stock_alert',
            json_build_object(
                'type', 'negative_stock',
                'item_id', NEW.id,
                'item_name', NEW.name,
                'stock', NEW.current_stock,
                'store_id', NEW.store_id
            )::text
        );

        RAISE WARNING 'STOCK NEGATIVO: % (%) tiene % unidades',
            NEW.name, NEW.id, NEW.current_stock;
    END IF;

    -- Alert if stock goes below minimum
    IF NEW.current_stock <= COALESCE(NEW.min_stock_alert, 5)
       AND (OLD.current_stock IS NULL OR OLD.current_stock > COALESCE(NEW.min_stock_alert, 5)) THEN

        INSERT INTO stock_alerts (
            store_id,
            inventory_item_id,
            alert_type,
            stock_level,
            expected_stock,
            message
        ) VALUES (
            NEW.store_id,
            NEW.id,
            'low_stock',
            NEW.current_stock,
            NEW.min_stock_alert,
            'Stock bajo: ' || NEW.name || ' tiene solo ' || NEW.current_stock || ' unidades (mínimo: ' || COALESCE(NEW.min_stock_alert, 5) || ')'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alert_negative_stock ON inventory_items;
CREATE TRIGGER trg_alert_negative_stock
AFTER UPDATE OF current_stock ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION alert_on_negative_stock();

-- 4. RPC: SYNC OFFLINE ORDER (With Stock Conflict Handling)
CREATE OR REPLACE FUNCTION sync_offline_order(
    p_order_data JSONB,
    p_allow_negative_stock BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_store_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_current_stock NUMERIC;
    v_stock_conflicts JSONB := '[]'::JSONB;
    v_has_conflicts BOOLEAN := FALSE;
BEGIN
    -- Extract order data
    v_order_id := (p_order_data->>'id')::UUID;
    v_store_id := (p_order_data->>'store_id')::UUID;

    -- 1. PRE-VALIDATE STOCK AVAILABILITY
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_data->'items')
    LOOP
        v_product_id := (v_item->>'productId')::UUID;
        v_quantity := (v_item->>'quantity')::NUMERIC;

        -- Check current stock
        SELECT current_stock INTO v_current_stock
        FROM inventory_items
        WHERE id = v_product_id;

        -- If insufficient stock
        IF v_current_stock IS NOT NULL AND v_current_stock < v_quantity THEN
            v_has_conflicts := TRUE;
            v_stock_conflicts := v_stock_conflicts || jsonb_build_object(
                'product_id', v_product_id,
                'requested_qty', v_quantity,
                'available_qty', v_current_stock,
                'shortage', v_quantity - v_current_stock
            );

            -- Create alert
            INSERT INTO stock_alerts (
                store_id,
                inventory_item_id,
                alert_type,
                stock_level,
                expected_stock,
                message,
                order_id
            )
            SELECT
                v_store_id,
                v_product_id,
                'offline_conflict',
                v_current_stock,
                v_quantity,
                'Conflicto de sincronización offline: Se intentó vender ' || v_quantity || ' pero solo quedan ' || v_current_stock,
                v_order_id
            FROM inventory_items WHERE id = v_product_id;
        END IF;
    END LOOP;

    -- 2. HANDLE CONFLICTS
    IF v_has_conflicts AND NOT p_allow_negative_stock THEN
        -- Return error with conflict details
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INSUFFICIENT_STOCK',
            'message', 'Stock insuficiente para completar la sincronización',
            'conflicts', v_stock_conflicts,
            'action_required', 'Ajustar cantidades o permitir stock negativo'
        );
    END IF;

    -- 3. IF ALLOWING NEGATIVE OR NO CONFLICTS: Proceed with order sync
    -- Check if order already exists
    IF EXISTS (SELECT 1 FROM orders WHERE id = v_order_id) THEN
        -- Update existing order
        UPDATE orders
        SET
            status = (p_order_data->>'status')::order_status_enum,
            total_amount = (p_order_data->>'total_amount')::NUMERIC,
            items = p_order_data->'items',
            updated_at = NOW()
        WHERE id = v_order_id;
    ELSE
        -- Insert new order
        INSERT INTO orders (
            id,
            store_id,
            client_id,
            status,
            channel,
            total_amount,
            subtotal,
            items,
            payment_method,
            is_paid,
            created_at
        ) VALUES (
            v_order_id,
            v_store_id,
            (p_order_data->>'client_id')::UUID,
            (p_order_data->>'status')::order_status_enum,
            (p_order_data->>'channel')::TEXT,
            (p_order_data->>'total_amount')::NUMERIC,
            (p_order_data->>'subtotal')::NUMERIC,
            p_order_data->'items',
            (p_order_data->>'payment_method')::TEXT,
            COALESCE((p_order_data->>'is_paid')::BOOLEAN, FALSE),
            COALESCE((p_order_data->>'created_at')::TIMESTAMPTZ, NOW())
        );
    END IF;

    -- 4. Return success
    RETURN jsonb_build_object(
        'success', TRUE,
        'order_id', v_order_id,
        'message', 'Orden sincronizada exitosamente',
        'stock_went_negative', v_has_conflicts,
        'conflicts', v_stock_conflicts
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', SQLSTATE,
        'message', SQLERRM
    );
END;
$$;

-- 5. RPC: ACKNOWLEDGE STOCK ALERT
CREATE OR REPLACE FUNCTION acknowledge_stock_alert(
    p_alert_id UUID,
    p_staff_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE stock_alerts
    SET acknowledged = TRUE,
        acknowledged_by = p_staff_id,
        acknowledged_at = NOW()
    WHERE id = p_alert_id;

    IF FOUND THEN
        RETURN jsonb_build_object('success', TRUE);
    ELSE
        RETURN jsonb_build_object('success', FALSE, 'error', 'Alert not found');
    END IF;
END;
$$;

-- 6. VIEW: UNACKNOWLEDGED ALERTS
CREATE OR REPLACE VIEW unacknowledged_stock_alerts AS
SELECT
    sa.*,
    ii.name as item_name,
    ii.sku,
    s.name as store_name
FROM stock_alerts sa
JOIN inventory_items ii ON sa.inventory_item_id = ii.id
JOIN stores s ON sa.store_id = s.id
WHERE sa.acknowledged = FALSE
ORDER BY sa.created_at DESC;

-- 7. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION sync_offline_order(JSONB, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION acknowledge_stock_alert(UUID, UUID) TO authenticated;
GRANT SELECT ON unacknowledged_stock_alerts TO authenticated;
GRANT ALL ON stock_alerts TO authenticated;

-- 8. COMMENT
COMMENT ON FUNCTION sync_offline_order IS
'Syncs an offline order with stock conflict detection.
Returns conflicts array if stock insufficient.
Set p_allow_negative_stock=TRUE to force sync with negative stock (creates alert).';

COMMENT ON TABLE stock_alerts IS
'Tracks stock alerts including negative stock from offline sync conflicts';
