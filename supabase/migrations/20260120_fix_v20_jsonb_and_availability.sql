-- Migration: Fix V20 (JSONB) and Availability Logic
-- Description: 
-- 1. Reimplements 'decrease_stock_atomic_v20' to work with 'inventory_location_stock.open_packages' (JSONB).
-- 2. Updates 'check_product_stock_availability' to enforce Strict Whole Unit availability.
-- Date: 2026-01-20

-- ==============================================================================
-- PART 1: Strict Availability Logic (Fixes "ClientContext" issue via DB Trigger)
-- ==============================================================================

CREATE OR REPLACE FUNCTION check_product_stock_availability(p_product_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_available BOOLEAN := TRUE;
    v_item RECORD;
    v_total_closed INTEGER;
    v_unit_size NUMERIC;
BEGIN
    -- Iterate through all ingredients for the product
    FOR v_item IN
        SELECT pr.inventory_item_id, pr.quantity_required, ii.unit_size
        FROM product_recipes pr
        JOIN inventory_items ii ON ii.id = pr.inventory_item_id
        WHERE pr.product_id = p_product_id
    LOOP
        -- A. Mass Check (Global Stock)
        -- We still check if total mass is enough (ClientContext fallback relies on this implicitly via 'is_available')
        -- But strict check is more important.
        IF (SELECT current_stock FROM inventory_items WHERE id = v_item.inventory_item_id) < v_item.quantity_required THEN
             v_available := FALSE;
             EXIT;
        END IF;

        -- B. Whole Unit Check (Strict)
        -- If recipe implies a Whole Unit (>= 90% of Unit Size), we require a CLOSED UNIT.
        v_unit_size := COALESCE(v_item.unit_size, 0);
        
        IF v_unit_size > 0 AND v_item.quantity_required >= (v_unit_size * 0.9) THEN
             -- Sum closed units across all locations for this store/item
             SELECT COALESCE(SUM(closed_units), 0) INTO v_total_closed
             FROM inventory_location_stock
             WHERE item_id = v_item.inventory_item_id;

             IF v_total_closed < 1 THEN
                 v_available := FALSE;
                 EXIT;
             END IF;
        END IF;
    END LOOP;

    RETURN v_available;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- PART 2: V20 Atomic Consumption (JSONB Implementation)
-- ==============================================================================

CREATE OR REPLACE FUNCTION decrease_stock_atomic_v20(
    p_store_id UUID,
    p_location_id UUID,
    p_item_id UUID,
    p_quantity NUMERIC, 
    p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
    v_stock RECORD;
    v_new_open_packages JSONB := '[]'::jsonb;
    v_pkg JSONB;
    v_remaining_needed NUMERIC := p_quantity;
    v_unit_size NUMERIC;
    v_new_pkg_qty NUMERIC;
    v_pkg_remaining NUMERIC;
    v_inventory_item RECORD;
BEGIN
    -- Validation
    IF p_quantity <= 0 THEN RETURN; END IF;

    -- Get Unit Size
    SELECT * INTO v_inventory_item FROM inventory_items WHERE id = p_item_id;
    IF NOT FOUND THEN RETURN; END IF;
    v_unit_size := COALESCE(v_inventory_item.unit_size, 1);

    -- Lock Stock Row
    SELECT * INTO v_stock 
    FROM inventory_location_stock 
    WHERE item_id = p_item_id AND location_id = p_location_id AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Create if missing (empty)
        INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units, open_packages)
        VALUES (p_store_id, p_item_id, p_location_id, 0, '[]'::jsonb)
        RETURNING * INTO v_stock;
    END IF;

    -- 1. Consume from Open Packages (JSONB Array)
    -- Format: [{"id": "uuid", "remaining": 500, "opened_at": "..."}]
    
    FOR v_pkg IN SELECT * FROM jsonb_array_elements(v_stock.open_packages)
    LOOP
        v_pkg_remaining := (v_pkg->>'remaining')::NUMERIC;
        
        IF v_remaining_needed > 0 THEN
            IF v_pkg_remaining > v_remaining_needed THEN
                -- A. Partial consume
                v_pkg := jsonb_set(v_pkg, '{remaining}', to_jsonb(v_pkg_remaining - v_remaining_needed));
                v_remaining_needed := 0;
                v_new_open_packages := v_new_open_packages || v_pkg;
            ELSE
                -- B. Full consume (Package becomes empty, do NOT add to new array)
                v_remaining_needed := v_remaining_needed - v_pkg_remaining;
                -- Audit log implied by transaction finalization or can be explicit here
            END IF;
        ELSE
            -- Keep untouched package
            v_new_open_packages := v_new_open_packages || v_pkg;
        END IF;
    END LOOP;

    -- 2. Open New Packages if needed
    WHILE v_remaining_needed > 0 LOOP
        -- Decrease Closed Units (Allow negative debt)
        v_stock.closed_units := v_stock.closed_units - 1;
        
        -- Create New "Virtual" Open Package
        v_new_pkg_qty := v_unit_size;

        IF v_new_pkg_qty > v_remaining_needed THEN
            -- Remainder becomes a new open package
            v_new_pkg_qty := v_new_pkg_qty - v_remaining_needed;
            v_remaining_needed := 0;
            
            v_new_open_packages := v_new_open_packages || jsonb_build_object(
                'id', gen_random_uuid(),
                'remaining', v_new_pkg_qty,
                'opened_at', now()
            );
        ELSE
            -- Consumed entirely immediately
            v_remaining_needed := v_remaining_needed - v_new_pkg_qty;
        END IF;
    END LOOP;

    -- 3. Update Record
    UPDATE inventory_location_stock
    SET closed_units = v_stock.closed_units,
        open_packages = v_new_open_packages,
        updated_at = now()
    WHERE id = v_stock.id;

    -- 4. Audit Log (Summary)
    INSERT INTO inventory_audit_logs (store_id, location_id, item_id, quantity_delta, reason, action_type)
    VALUES (p_store_id, p_location_id, p_item_id, -p_quantity, p_reason || ' (V20 Atomic)', 'consumption');

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- PART 3: Refresh Product Availability Immediately
-- ==============================================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM products WHERE active = true LOOP
        PERFORM check_product_stock_availability(r.id);
        UPDATE products SET is_available = check_product_stock_availability(r.id), updated_at = now() WHERE id = r.id;
    END LOOP;
END $$;
