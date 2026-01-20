-- Migration V20: Atomic Open Package Consumption & Multi-location Safety
-- This migration integrates the smart consumption logic into the movement-driven architecture.

-- 1. Update consume_from_open_packages with safety features
CREATE OR REPLACE FUNCTION public.consume_from_open_packages(
    p_item_id uuid, 
    p_store_id uuid, 
    p_required_qty numeric, 
    p_unit text DEFAULT 'un'::text, 
    p_reason text DEFAULT 'order_delivered'::text, 
    p_order_id uuid DEFAULT NULL::uuid, 
    p_location_id uuid DEFAULT NULL::uuid,
    p_skip_logging boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
    v_item RECORD;
    v_open_pkg RECORD;
    v_remaining_to_consume NUMERIC;
    v_packages_opened INTEGER := 0;
    v_target_location_id UUID := p_location_id;
    v_resolved_unit TEXT;
    v_pkg_capacity NUMERIC;
BEGIN
    -- A. Acquire lock on the Core Item (Strict Concurrency)
    SELECT * INTO v_item FROM inventory_items WHERE id = p_item_id FOR SHARE;
    
    IF v_item IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item not found');
    END IF;

    -- B. Resolve Location
    IF v_target_location_id IS NULL THEN
        SELECT id INTO v_target_location_id 
        FROM storage_locations 
        WHERE store_id = p_store_id AND is_default = TRUE 
        LIMIT 1;
    END IF;

    -- C. Acquire lock on Location Stock (Strict Concurrency for "Opening" packages)
    PERFORM 1 FROM inventory_location_stock 
    WHERE item_id = p_item_id AND location_id = v_target_location_id
    FOR UPDATE;

    v_resolved_unit := COALESCE(p_unit, v_item.unit_type, 'un');
    v_remaining_to_consume := p_required_qty;
    v_pkg_capacity := COALESCE(v_item.package_size, 1);

    -- D. LOOP: Consume Logic
    WHILE v_remaining_to_consume > 0 LOOP
        
        -- Try to find an ACTIVE open package in this location with locking
        SELECT * INTO v_open_pkg
        FROM open_packages
        WHERE inventory_item_id = p_item_id 
          AND store_id = p_store_id
          AND is_active = true 
          AND remaining > 0
          AND location_id = v_target_location_id
        ORDER BY opened_at ASC
        LIMIT 1
        FOR UPDATE;

        IF FOUND THEN
            IF v_open_pkg.remaining >= v_remaining_to_consume THEN
                -- Full consumption from this package
                UPDATE open_packages SET 
                    remaining = remaining - v_remaining_to_consume,
                    updated_at = NOW()
                WHERE id = v_open_pkg.id;
                
                v_remaining_to_consume := 0;
            ELSE
                -- Partial consumption, close this package and continue loop
                v_remaining_to_consume := v_remaining_to_consume - v_open_pkg.remaining;
                UPDATE open_packages SET 
                    remaining = 0, 
                    is_active = false, 
                    closed_at = NOW(),
                    updated_at = NOW()
                WHERE id = v_open_pkg.id;
            END IF;

        ELSE
            -- No open packages found -> Open a NEW one
            -- We already have the lock on inventory_location_stock
            
            -- If we have 0 or less closed_units, we still allow opening (negative closed) 
            -- or we could cap it. Business rule: allow "opening" from virtual stock if needed.
            UPDATE inventory_location_stock 
            SET closed_units = closed_units - 1,
                updated_at = NOW()
            WHERE item_id = p_item_id 
              AND location_id = v_target_location_id;

            -- Create the new open package
            INSERT INTO open_packages (
                inventory_item_id, store_id, package_capacity, remaining,
                unit, opened_at, is_active, location_id
            ) VALUES (
                p_item_id, p_store_id, v_pkg_capacity, v_pkg_capacity,
                v_resolved_unit, NOW(), true, v_target_location_id 
            );

            v_packages_opened := v_packages_opened + 1;
            
            -- Safety break to avoid infinite loop if capacity is 0
            IF v_pkg_capacity <= 0 THEN v_remaining_to_consume := 0; END IF;
        END IF;
    END LOOP;

    -- E. LOGGING (Only if NOT skip_logging)
    -- Skip logging is used when called from update_inventory_from_movement trigger
    IF NOT p_skip_logging THEN
        INSERT INTO stock_movements (
            inventory_item_id, store_id, qty_delta, unit_type, reason, order_id, location_id, created_at, idempotency_key
        ) VALUES (
            p_item_id, p_store_id, -p_required_qty, v_resolved_unit, p_reason, p_order_id, v_target_location_id, NOW(), gen_random_uuid()::text
        );
    END IF;

    -- Note: We NEVER update inventory_items.current_stock here to avoid double deduction.
    -- The trigger or the manual caller is responsible for the global sync.
    
    RETURN jsonb_build_object('success', true, 'packages_opened', v_packages_opened);
END;
$function$;

-- 2. Update stock engine trigger with multi-location safety and open package integration
CREATE OR REPLACE FUNCTION public.update_inventory_from_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
    -- Validation
    IF NEW.inventory_item_id IS NULL THEN
        RAISE EXCEPTION 'Stock movement must have an inventory_item_id';
    END IF;

    -- 1. RESTOCK VALIDATION (Rule 4)
    IF NEW.qty_delta > 0 AND NEW.location_id IS NULL THEN
        RAISE EXCEPTION 'Restock movements must have a location_id to maintain multi-location integrity.';
    END IF;

    -- 2. BRANCH: CONSUMPTION (Negative delta)
    IF NEW.qty_delta < 0 THEN
        -- Delegate to atomic open package logic
        PERFORM consume_from_open_packages(
            p_item_id := NEW.inventory_item_id,
            p_store_id := NEW.store_id,
            p_required_qty := ABS(NEW.qty_delta),
            p_unit := NEW.unit_type,
            p_reason := NEW.reason,
            p_order_id := NEW.order_id,
            p_location_id := NEW.location_id,
            p_skip_logging := TRUE -- CRITICAL: Avoid recursion
        );
        
    -- 3. BRANCH: RESTOCK/ADJUSTMENT (Positive delta)
    ELSE
        -- Incoming stock always adds to closed_units in the specific location (Option A)
        INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
        VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta)
        ON CONFLICT (store_id, item_id, location_id)
        DO UPDATE SET 
            closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units,
            updated_at = now();
    END IF;

    -- 4. SINGLE POINT OF TRUTH: ALWAYS Update Global Item Stock
    -- This update applies to every movement (inc. manual/orders)
    UPDATE inventory_items 
    SET current_stock = current_stock + NEW.qty_delta,
        updated_at = now()
    WHERE id = NEW.inventory_item_id;

    RETURN NEW;
END;
$function$;
