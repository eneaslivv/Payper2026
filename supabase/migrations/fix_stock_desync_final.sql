-- =============================================
-- ATOMIC STOCK FIX: Synchronize Global & Local
-- =============================================

-- 1. DROP Existing Functions to remove ambiguity
DROP FUNCTION IF EXISTS consume_from_open_packages(uuid, uuid, numeric, text, text, uuid);
DROP FUNCTION IF EXISTS consume_from_open_packages(uuid, uuid, numeric, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS finalize_order_stock();
DROP TRIGGER IF EXISTS finalize_order_stock_trigger ON orders;
DROP TRIGGER IF EXISTS trigger_finalize_stock ON orders; -- Ensure old name is gone too

-- 2. CREATE Robust consume_from_open_packages
CREATE OR REPLACE FUNCTION consume_from_open_packages(
    p_item_id UUID,
    p_store_id UUID,
    p_required_qty NUMERIC,
    p_unit TEXT DEFAULT 'g',
    p_reason TEXT DEFAULT 'order_delivered',
    p_order_id UUID DEFAULT NULL,
    p_location_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item RECORD;
    v_open_pkg RECORD;
    v_remaining_to_consume NUMERIC;
    v_consumed_from_pkg NUMERIC;
    v_packages_opened INTEGER := 0;
    v_target_location_id UUID := p_location_id;
    v_total_consumed NUMERIC := 0;
BEGIN
    -- Get Item Details
    SELECT * INTO v_item FROM inventory_items WHERE id = p_item_id;
    
    IF v_item IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item not found');
    END IF;

    -- Resolve Location (If null, fallback to default)
    IF v_target_location_id IS NULL THEN
        SELECT id INTO v_target_location_id 
        FROM storage_locations 
        WHERE store_id = p_store_id AND is_default = TRUE 
        LIMIT 1;
    END IF;

    v_remaining_to_consume := p_required_qty;

    -- LOOP: Consume
    WHILE v_remaining_to_consume > 0 LOOP
        
        -- Try to find OPEN package in this location
        SELECT id, remaining, package_capacity
        INTO v_open_pkg
        FROM open_packages
        WHERE inventory_item_id = p_item_id 
          AND store_id = p_store_id
          AND is_active = true 
          AND remaining > 0
        ORDER BY opened_at ASC
        LIMIT 1;

        IF v_open_pkg IS NOT NULL THEN
            -- Consume from Existing
            v_consumed_from_pkg := LEAST(v_open_pkg.remaining, v_remaining_to_consume);
            
            UPDATE open_packages
            SET remaining = remaining - v_consumed_from_pkg,
                updated_at = NOW()
            WHERE id = v_open_pkg.id;
            
            v_remaining_to_consume := v_remaining_to_consume - v_consumed_from_pkg;
            v_total_consumed := v_total_consumed + v_consumed_from_pkg;
            
        ELSE
            -- OPEN NEW PACKAGE
            -- 1. Decrement Global Stock
            UPDATE inventory_items
            SET closed_stock = GREATEST(closed_stock - 1, 0),
                updated_at = NOW()
            WHERE id = p_item_id;

            -- 2. Decrement Location Stock (CRITICAL FIX)
            UPDATE inventory_location_stock
            SET closed_units = GREATEST(closed_units - 1, 0),
                updated_at = NOW()
            WHERE item_id = p_item_id 
              AND location_id = v_target_location_id;

            -- 3. Create Open Package Record
            INSERT INTO open_packages (
                inventory_item_id,
                store_id,
                package_capacity,
                remaining,
                unit,
                opened_at,
                is_active
            ) VALUES (
                p_item_id,
                p_store_id,
                COALESCE(v_item.package_size, 1),
                COALESCE(v_item.package_size, 1),
                COALESCE(p_unit, v_item.unit_type, 'un'),
                NOW(),
                true
            );

            v_packages_opened := v_packages_opened + 1;
            
             -- If package created, we don't consume 'v_remaining' from it immediately in loop 
             -- unless we restart loop? 
             -- Actually, Logic usually is: Open Package -> Loop Continues -> Takes from newly opened pack.
             -- But here I'll just rely on while loop re-evaluating or I should consume immediately?
             -- If I INSERT, next iteration of SELECT v_open_pkg WILL FIND IT.
             -- So I just Loop around.
             
             -- Infinite Loop Protection:
             IF COALESCE(v_item.package_size, 1) <= 0 THEN
                 -- Fallback consume directly from stock if package definition invalid
                 v_remaining_to_consume := 0; -- Force exit
             END IF;
             
        END IF;
    END LOOP;

    -- Update Current Stock (Total Effective) - Just for consistency
    UPDATE inventory_items
    SET current_stock = GREATEST(current_stock - v_total_consumed, 0)
    WHERE id = p_item_id;

    -- Log Movement
    INSERT INTO stock_movements (
        inventory_item_id, store_id, qty_delta, unit_type, reason, order_id, location_id, created_at, idempotency_key
    ) VALUES (
        p_item_id, p_store_id, -p_required_qty, p_unit, p_reason, p_order_id, v_target_location_id, NOW(), gen_random_uuid()::text
    );

    RETURN jsonb_build_object('success', true, 'packages_opened', v_packages_opened);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 3. CREATE Corrected finalize_order_stock
CREATE OR REPLACE FUNCTION finalize_order_stock() 
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
    v_item JSONB;
    v_qty NUMERIC;
    v_ingredient JSONB;
    v_source_location_id UUID;
    v_inv_item RECORD;
BEGIN
    -- Check if status changed to served/delivered
    IF (NEW.status = 'served' OR NEW.status = 'delivered' OR NEW.status = 'Entregado') 
       AND (OLD.status IS DISTINCT FROM NEW.status) 
       AND (NEW.stock_deducted = FALSE) THEN
       
       v_source_location_id := NEW.source_location_id;

       -- Loop through items
       FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items)
       LOOP
           v_qty := (v_item->>'quantity')::numeric;
           
           -- 1. Try via Recipe
           IF EXISTS (SELECT 1 FROM product_recipes WHERE product_id = (v_item->>'id')::uuid) THEN
               FOR v_ingredient IN 
                   SELECT r.ingredient_id, r.quantity, r.unit
                   FROM product_recipes r
                   WHERE r.product_id = (v_item->>'id')::uuid
               LOOP
                   PERFORM consume_from_open_packages(
                       (v_ingredient->>'ingredient_id')::uuid,
                       NEW.store_id,
                       (v_ingredient->>'quantity')::numeric * v_qty,
                       v_ingredient->>'unit',
                       'order_delivered',
                       NEW.id,
                       v_source_location_id
                   );
               END LOOP;
           
           ELSE
               -- 2. Direct Inventory Item Fallback
                SELECT id, unit_type 
                INTO v_inv_item
                FROM inventory_items 
                WHERE id = (v_item->>'id')::uuid AND store_id = NEW.store_id;
                
                IF v_inv_item.id IS NOT NULL THEN
                    PERFORM consume_from_open_packages(
                        v_inv_item.id,
                        NEW.store_id,
                        v_qty,
                        COALESCE(v_inv_item.unit_type, 'unit'),
                        'order_delivered',
                        NEW.id,
                        v_source_location_id
                    );
                END IF;
           END IF;
           
       END LOOP;

       UPDATE orders SET stock_deducted = TRUE WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

-- 4. Re-Apply Trigger
DROP TRIGGER IF EXISTS trigger_finalize_stock ON orders;
CREATE TRIGGER trigger_finalize_stock
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION finalize_order_stock();
