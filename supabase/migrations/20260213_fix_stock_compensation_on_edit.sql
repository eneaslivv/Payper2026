-- =============================================
-- FIX #8: STOCK COMPENSATION ON ORDER EDIT
-- Fecha: 2026-02-13
-- Problema:
--   Cuando staff edita una orden (cambia cantidades, items):
--   - Stock queda desincronizado
--   - Si ya se descontó stock, no se compensa
--   - Editar qty de 2→5 no descuenta los 3 extra
--   - Editar qty de 5→2 no devuelve los 3 sobrantes
-- Solución:
--   Trigger que detecta cambios en items JSONB y compensa stock
-- =============================================

-- 1. FUNCTION: Compensate Stock on Order Item Changes
CREATE OR REPLACE FUNCTION compensate_stock_on_order_edit()
RETURNS TRIGGER AS $$
DECLARE
    v_old_item JSONB;
    v_new_item JSONB;
    v_old_items_map JSONB := '{}'::JSONB;
    v_new_items_map JSONB := '{}'::JSONB;
    v_product_id UUID;
    v_old_qty NUMERIC;
    v_new_qty NUMERIC;
    v_qty_delta NUMERIC;
    v_has_recipe BOOLEAN;
    v_recipe_record RECORD;
    v_active_inventory_item_id UUID;
    v_target_location_id UUID;
    v_direct_unit TEXT;
BEGIN
    -- GUARD: Only compensate if:
    -- 1. Order items changed (JSONB comparison)
    -- 2. Stock was already deducted
    -- 3. Order is not cancelled/refunded
    IF NEW.items::text = OLD.items::text
       OR NEW.stock_deducted = FALSE
       OR NEW.status IN ('cancelled', 'refunded') THEN
        RETURN NEW;
    END IF;

    RAISE NOTICE '[Stock Compensation] Order % items changed, compensating stock', NEW.id;

    -- Resolve target location
    IF NEW.node_id IS NOT NULL THEN
        SELECT location_id INTO v_target_location_id
        FROM venue_nodes
        WHERE id = NEW.node_id;
    END IF;

    IF v_target_location_id IS NULL THEN
        SELECT id INTO v_target_location_id
        FROM storage_locations
        WHERE store_id = NEW.store_id AND is_default = TRUE
        LIMIT 1;
    END IF;

    -- Build OLD items map: { productId: quantity }
    FOR v_old_item IN SELECT * FROM jsonb_array_elements(OLD.items)
    LOOP
        v_old_items_map := v_old_items_map || jsonb_build_object(
            v_old_item->>'productId',
            (v_old_item->>'quantity')::NUMERIC
        );
    END LOOP;

    -- Build NEW items map: { productId: quantity }
    FOR v_new_item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
        v_new_items_map := v_new_items_map || jsonb_build_object(
            v_new_item->>'productId',
            (v_new_item->>'quantity')::NUMERIC
        );
    END LOOP;

    -- Process each product to find quantity changes
    -- Check both old and new items to catch additions/removals
    FOR v_product_id IN
        SELECT DISTINCT key::UUID
        FROM jsonb_each(v_old_items_map || v_new_items_map)
    LOOP
        -- Get quantities (default to 0 if item doesn't exist in one version)
        v_old_qty := COALESCE((v_old_items_map->>v_product_id::text)::NUMERIC, 0);
        v_new_qty := COALESCE((v_new_items_map->>v_product_id::text)::NUMERIC, 0);

        -- Calculate delta (positive = need to deduct more, negative = need to restore)
        v_qty_delta := v_new_qty - v_old_qty;

        -- Skip if no change
        IF v_qty_delta = 0 THEN
            CONTINUE;
        END IF;

        RAISE NOTICE '[Stock Compensation] Product %: qty changed from % to % (delta: %)',
            v_product_id, v_old_qty, v_new_qty, v_qty_delta;

        -- Check if product has recipe
        SELECT EXISTS (
            SELECT 1 FROM product_recipes WHERE product_id = v_product_id
        ) INTO v_has_recipe;

        -- CASE A: Recipe-based product (compensate ingredients)
        IF v_has_recipe = TRUE THEN
            FOR v_recipe_record IN
                SELECT
                    pr.inventory_item_id,
                    pr.quantity_required,
                    ii.unit_type
                FROM product_recipes pr
                JOIN inventory_items ii ON pr.inventory_item_id = ii.id
                WHERE pr.product_id = v_product_id
            LOOP
                -- Lock inventory row
                PERFORM 1
                FROM inventory_items
                WHERE id = v_recipe_record.inventory_item_id
                FOR UPDATE NOWAIT;

                -- Create compensating movement
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
                    NEW.store_id,
                    v_recipe_record.inventory_item_id,
                    NEW.id,
                    -(v_recipe_record.quantity_required * v_qty_delta),  -- Negative if delta is positive (deduct), positive if delta is negative (restore)
                    v_recipe_record.unit_type,
                    'order_edit_compensation',
                    v_target_location_id,
                    'Order edited: qty changed from ' || v_old_qty || ' to ' || v_new_qty || ' (delta: ' || v_qty_delta || ')'
                );
            END LOOP;

        -- CASE B: Direct sale product
        ELSE
            BEGIN
                -- Attempt to find mapping first
                SELECT inventory_item_id INTO v_active_inventory_item_id
                FROM inventory_product_mapping
                WHERE product_id = v_product_id;

                IF v_active_inventory_item_id IS NULL THEN
                    v_active_inventory_item_id := v_product_id;
                END IF;

                -- Lock inventory row
                SELECT unit_type INTO v_direct_unit
                FROM inventory_items
                WHERE id = v_active_inventory_item_id
                FOR UPDATE NOWAIT;

                IF FOUND THEN
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
                        NEW.store_id,
                        v_active_inventory_item_id,
                        NEW.id,
                        -v_qty_delta,  -- Negative if increasing qty, positive if decreasing
                        COALESCE(v_direct_unit, 'unit'),
                        'order_edit_compensation',
                        v_target_location_id,
                        'Order edited: qty changed from ' || v_old_qty || ' to ' || v_new_qty || ' (delta: ' || v_qty_delta || ')'
                    );
                END IF;
            END;
        END IF;
    END LOOP;

    RETURN NEW;

EXCEPTION
    WHEN lock_not_available THEN
        RAISE WARNING '[Stock Compensation] Lock timeout for order %, stock is being modified', NEW.id;
        -- Don't fail the order update, just log warning
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. CREATE TRIGGER
DROP TRIGGER IF EXISTS trg_compensate_stock_on_edit ON orders;
CREATE TRIGGER trg_compensate_stock_on_edit
BEFORE UPDATE OF items ON orders
FOR EACH ROW
EXECUTE FUNCTION compensate_stock_on_order_edit();

-- 3. VIEW: Order Edit Audit Trail
CREATE OR REPLACE VIEW order_edit_stock_audit AS
SELECT
    o.id as order_id,
    o.order_number,
    o.store_id,
    s.name as store_name,
    o.status,
    o.total_amount,
    -- Count of compensation movements
    (
        SELECT COUNT(*)
        FROM stock_movements sm
        WHERE sm.order_id = o.id
          AND sm.reason = 'order_edit_compensation'
    ) as compensation_movements,
    -- Total compensation delta
    (
        SELECT SUM(sm.qty_delta)
        FROM stock_movements sm
        WHERE sm.order_id = o.id
          AND sm.reason = 'order_edit_compensation'
    ) as total_compensation_delta,
    -- List of compensated items
    (
        SELECT json_agg(
            json_build_object(
                'inventory_item_id', sm.inventory_item_id,
                'qty_delta', sm.qty_delta,
                'unit_type', sm.unit_type,
                'notes', sm.notes,
                'created_at', sm.created_at
            )
            ORDER BY sm.created_at
        )
        FROM stock_movements sm
        WHERE sm.order_id = o.id
          AND sm.reason = 'order_edit_compensation'
    ) as compensation_details,
    o.updated_at,
    o.created_at
FROM orders o
JOIN stores s ON o.store_id = s.id
WHERE EXISTS (
    SELECT 1
    FROM stock_movements sm
    WHERE sm.order_id = o.id
      AND sm.reason = 'order_edit_compensation'
)
ORDER BY o.updated_at DESC;

-- 4. GRANT PERMISSIONS
GRANT SELECT ON order_edit_stock_audit TO authenticated;
GRANT EXECUTE ON FUNCTION compensate_stock_on_order_edit() TO authenticated;

-- 5. COMMENT
COMMENT ON FUNCTION compensate_stock_on_order_edit IS
'Automatically compensates stock when order items are edited.
Detects changes in items JSONB (quantity changes, additions, removals).
Creates compensating stock_movements with reason: order_edit_compensation.
Uses FOR UPDATE NOWAIT to prevent race conditions.
Only acts if stock was already deducted and order is not cancelled.';

COMMENT ON VIEW order_edit_stock_audit IS
'Audit trail of orders that had stock compensations due to item edits.
Shows count and details of all compensation movements.
Useful for reconciliation and debugging stock discrepancies.';
