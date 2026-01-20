CREATE OR REPLACE FUNCTION public.consume_from_open_packages(p_item_id uuid, p_store_id uuid, p_required_qty numeric, p_unit text DEFAULT 'g'::text, p_reason text DEFAULT 'order_delivered'::text, p_order_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_item RECORD;
    v_open_pkg RECORD;
    v_remaining_to_consume NUMERIC;
    v_consumed_from_pkg NUMERIC;
    v_packages_opened INTEGER := 0;
    v_target_location_id UUID := p_location_id;
    v_total_consumed NUMERIC := 0;
    v_resolved_unit TEXT; -- NEW VARIABLE
BEGIN
    -- Get Item Details
    SELECT * INTO v_item FROM inventory_items WHERE id = p_item_id;
    
    IF v_item IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Item not found');
    END IF;

    -- Resolve Unit Type EARLY
    v_resolved_unit := COALESCE(p_unit, v_item.unit_type, 'un');

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
          -- PRIORITIZE LOCATION MATCH
          AND (location_id = v_target_location_id OR location_id IS NULL) 
        ORDER BY 
          CASE WHEN location_id = v_target_location_id THEN 0 ELSE 1 END,
          opened_at ASC
        LIMIT 1;

        IF v_open_pkg IS NOT NULL THEN
            -- Consume from Existing
            v_consumed_from_pkg := LEAST(v_open_pkg.remaining, v_remaining_to_consume);
            
            UPDATE open_packages
            SET remaining = remaining - v_consumed_from_pkg
            WHERE id = v_open_pkg.id;
            
            v_remaining_to_consume := v_remaining_to_consume - v_consumed_from_pkg;
            v_total_consumed := v_total_consumed + v_consumed_from_pkg;
            
            IF (v_open_pkg.remaining - v_consumed_from_pkg) <= 0.001 THEN
                 -- Close package if empty
                 UPDATE open_packages SET is_active = false, closed_at = NOW() WHERE id = v_open_pkg.id;
            END IF;

        ELSE
            -- Open NEW Package
            -- Deduct from CLOSED units in the specific location
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
                is_active,
                location_id -- Set location on open
            ) VALUES (
                p_item_id,
                p_store_id,
                COALESCE(v_item.package_size, 1),
                COALESCE(v_item.package_size, 1),
                v_resolved_unit, -- Use resolved unit
                NOW(),
                true,
                v_target_location_id 
            );

            v_packages_opened := v_packages_opened + 1;
            
             -- Infinite Loop Protection:
             IF COALESCE(v_item.package_size, 1) <= 0 THEN
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
        p_item_id, p_store_id, -p_required_qty, v_resolved_unit, p_reason, p_order_id, v_target_location_id, NOW(), gen_random_uuid()::text
    );

    RETURN jsonb_build_object('success', true, 'packages_opened', v_packages_opened);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
