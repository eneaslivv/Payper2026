-- Migration: Integrate Open Packages V20 (Atomic Consumption)
-- Description: Implements physical stock deduction logic (Open -> New Open -> Closed)
-- Date: 2026-01-20

-- 1. Create the atomic consumption function
CREATE OR REPLACE FUNCTION decrease_stock_atomic_v20(
    p_store_id UUID,
    p_location_id UUID,
    p_item_id UUID,
    p_quantity NUMERIC, -- Quantity to consume (e.g., 18g)
    p_reason TEXT
)
RETURNS VOID AS $$
DECLARE
    v_open_pkg RECORD;
    v_remaining_needed NUMERIC := p_quantity;
    v_inventory_item RECORD;
    v_location_stock RECORD;
    v_unit_size NUMERIC;
    v_new_open_qty NUMERIC;
BEGIN
    -- Validation
    IF p_quantity <= 0 THEN
        RETURN;
    END IF;

    -- Fetch item details (unit size)
    SELECT * INTO v_inventory_item
    FROM inventory_items
    WHERE id = p_item_id AND store_id = p_store_id;

    IF NOT FOUND THEN
        RAISE WARNING 'Item % not found in store %', p_item_id, p_store_id;
        RETURN;
    END IF;

    v_unit_size := COALESCE(v_inventory_item.unit_size, 1); -- Default to 1 if null (e.g. units)

    -- ---------------------------------------------------------
    -- STEP 1: CONSUME FROM EXISTING OPEN PACKAGES (Priority)
    -- ---------------------------------------------------------
    -- We loop through open packages until requirement is met or packages defined.
    -- Order by smallest remaining first (to clear near-empty bags)? 
    -- Or largest first? Let's go with Created At ASC (FIFO) generally good for food.
    
    FOR v_open_pkg IN 
        SELECT * FROM open_packages 
        WHERE item_id = p_item_id 
          AND location_id = p_location_id 
          AND remaining_qty > 0
        ORDER BY created_at ASC
        FOR UPDATE -- Lock rows
    LOOP
        IF v_remaining_needed <= 0 THEN
            EXIT;
        END IF;

        IF v_open_pkg.remaining_qty >= v_remaining_needed THEN
            -- Case A: Package has enough. Just deduct.
            UPDATE open_packages
            SET remaining_qty = remaining_qty - v_remaining_needed,
                updated_at = NOW()
            WHERE id = v_open_pkg.id;

            -- Audit Log for this partial consumption
            INSERT INTO inventory_audit_logs (store_id, location_id, item_id, quantity_delta, package_delta, reason, action_type)
            VALUES (p_store_id, p_location_id, p_item_id, -v_remaining_needed, 0, p_reason || ' (Desde Abierto)', 'consumption');
            
            v_remaining_needed := 0;
        ELSE
            -- Case B: Package has less than needed. Consume ALL and continue.
            v_remaining_needed := v_remaining_needed - v_open_pkg.remaining_qty;

            -- Audit Log for emptying package
            INSERT INTO inventory_audit_logs (store_id, location_id, item_id, quantity_delta, package_delta, reason, action_type)
            VALUES (p_store_id, p_location_id, p_item_id, -v_open_pkg.remaining_qty, 0, p_reason || ' (Vació Paquete)', 'consumption');

            -- Remove empty package
            DELETE FROM open_packages WHERE id = v_open_pkg.id;
        END IF;
    END LOOP;

    -- ---------------------------------------------------------
    -- STEP 2: OPEN NEW PACKAGE (If needed)
    -- ---------------------------------------------------------
    IF v_remaining_needed > 0 THEN
        -- Check 'location_stock' for closed units
        SELECT * INTO v_location_stock
        FROM location_stock
        WHERE item_id = p_item_id AND location_id = p_location_id
        FOR UPDATE; -- Lock stock record

        IF NOT FOUND THEN
             -- Create stock record if missing (allow negative)
             INSERT INTO location_stock (store_id, location_id, item_id, closed_units, min_stock, max_stock)
             VALUES (p_store_id, p_location_id, p_item_id, 0, 0, 0)
             RETURNING * INTO v_location_stock;
        END IF;

        -- How many full packages do we need to open?
        -- Usually just 1 is enough unless consumption > unit_size.
        -- We will loop opening packages until satisfied.
        
        WHILE v_remaining_needed > 0 LOOP
            -- Decrease Close Unit count (can go negative as debt)
            UPDATE location_stock
            SET closed_units = closed_units - 1,
                updated_at = NOW()
            WHERE id = v_location_stock.id;

            -- Audit Log: Package Opening
            INSERT INTO inventory_audit_logs (store_id, location_id, item_id, quantity_delta, package_delta, reason, action_type)
            VALUES (p_store_id, p_location_id, p_item_id, 0, -1, 'Apertura Automática por Consumo', 'adjustment');

            -- New Package Logic
            -- Amount we take from this NEW package is MIN(unit_size, remaining_needed)
            -- But wait, standard logic is: Open package -> It becomes a new Open Package with full size -> Then we consume from it.
            
            -- So, 'Open' logic:
            -- 1. Remove 1 Closed Unit.
            -- 2. Create 1 Open Package with (Size - Consumption).
            
            v_new_open_qty := v_unit_size;

            IF v_new_open_qty >= v_remaining_needed THEN
                -- This new package covers the rest
                v_new_open_qty := v_new_open_qty - v_remaining_needed;

                -- Log the consumption part
                INSERT INTO inventory_audit_logs (store_id, location_id, item_id, quantity_delta, package_delta, reason, action_type)
                VALUES (p_store_id, p_location_id, p_item_id, -v_remaining_needed, 0, p_reason || ' (Nuevo Paquete)', 'consumption');
                
                v_remaining_needed := 0;
            ELSE
                 -- Even a full new package isn't enough (rare, bulk consumption)
                 -- Consume entire new package effectively instantly (it never technically becomes 'open' in DB, just consumed)
                 v_remaining_needed := v_remaining_needed - v_new_open_qty;
                 
                  -- Log the consumption part
                INSERT INTO inventory_audit_logs (store_id, location_id, item_id, quantity_delta, package_delta, reason, action_type)
                VALUES (p_store_id, p_location_id, p_item_id, -v_new_open_qty, 0, p_reason || ' (Nuevo Paquete Entero)', 'consumption');
                
                v_new_open_qty := 0;
            END IF;

            -- Verify if we should persist the open package (if it has leftovers)
            IF v_new_open_qty > 0 THEN
                INSERT INTO open_packages (store_id, location_id, item_id, remaining_qty, opened_at)
                VALUES (p_store_id, p_location_id, p_item_id, v_new_open_qty, NOW());
            END IF;
            
        END LOOP;
        
    END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
