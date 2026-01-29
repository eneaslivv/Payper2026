-- MIGRATION: 20260129_audit_fix_complete.sql
-- Description: Comprehensive fix for Stock Deduction, Delivery Status, and Legacy/Duplicate Functions.
-- Includes fixes for "entregado" enum error, infinite recursion prevention, and data cleanup.

-- ==============================================================================
-- 1. CLEANUP DUPLICATE/LEGACY FUNCTIONS
-- ==============================================================================

-- Drop all variations of confirm_order_delivery to ensure a clean slate
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, uuid);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, text);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(text, text);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid);

-- Drop duplicate consume_from_open_packages (ensure we only have the 8-arg version)
DROP FUNCTION IF EXISTS public.consume_from_open_packages(uuid, uuid, numeric, text, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.consume_from_open_packages(uuid, uuid, numeric, text, text, uuid, uuid, boolean);

-- ==============================================================================
-- 2. RECREATE CORE FUNCTIONS (Canonical Versions)
-- ==============================================================================

-- 2.1. consume_from_open_packages (8 Arguments, Atomic Locking, Skip Logging Support)
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
    IF NOT p_skip_logging THEN
        INSERT INTO stock_movements (
            inventory_item_id, store_id, qty_delta, unit_type, reason, order_id, location_id, created_at, idempotency_key
        ) VALUES (
            p_item_id, p_store_id, -p_required_qty, v_resolved_unit, p_reason, p_order_id, v_target_location_id, NOW(), gen_random_uuid()::text
        );
    END IF;
    
    RETURN jsonb_build_object('success', true, 'packages_opened', v_packages_opened);
END;
$function$;

-- 2.2. confirm_order_delivery (Canonical Version)
CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id UUID, p_staff_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_exists BOOLEAN;
BEGIN
    -- 1. Check if order exists
    SELECT EXISTS(SELECT 1 FROM orders WHERE id = p_order_id) INTO v_order_exists;
    
    IF NOT v_order_exists THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado');
    END IF;

    -- 2. Update Status AND Delivery Details
    -- This fires the finalize_order_stock trigger
    UPDATE orders 
    SET status = 'served',
        delivery_status = 'delivered',
        delivered_at = NOW(),
        delivered_by = p_staff_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 3. Return Success
    RETURN jsonb_build_object('success', true, 'message', 'Pedido entregado y stock descontado');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- ==============================================================================
-- 3. TRIGGER FUNCTIONS (With Fixes)
-- ==============================================================================

-- 3.1. update_inventory_from_movement (Calls 8-arg consume_from_open_packages)
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

    -- 1. RESTOCK VALIDATION
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
        -- Incoming stock always adds to closed_units in the specific location
        INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
        VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta)
        ON CONFLICT (store_id, item_id, location_id)
        DO UPDATE SET 
            closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units,
            updated_at = now();
    END IF;

    -- 4. SINGLE POINT OF TRUTH: ALWAYS Update Global Item Stock
    UPDATE inventory_items 
    SET current_stock = current_stock + NEW.qty_delta,
        updated_at = now()
    WHERE id = NEW.inventory_item_id;

    RETURN NEW;
END;
$function$;

-- 3.2. finalize_order_stock (Fixes 'entregado' Enum Error)
CREATE OR REPLACE FUNCTION public.finalize_order_stock()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_store_id UUID;
    v_items JSONB;
    v_item JSONB;
    v_item_qty NUMERIC;
    v_product_id UUID;
    v_variant_id UUID;
    v_recipe_multiplier NUMERIC;
    v_recipe_record RECORD;
    v_target_location_id UUID;
    v_default_location_id UUID;
    v_has_recipe BOOLEAN;
    v_active_inventory_item_id UUID;
    v_direct_unit TEXT;
BEGIN
    -- Prevent double deduction
    IF NEW.stock_deducted = TRUE THEN
        RETURN NEW;
    END IF;

    -- Conditions to Deduct Stock: Finalized status OR Prepaid
    -- FIX: REMOVED 'entregado'/'finalizado' to prevent invalid enum errors
    IF NOT (
        NEW.status IN ('served', 'delivered') OR 
        NEW.is_paid = TRUE OR 
        NEW.payment_status IN ('paid', 'approved')
    ) THEN
        RETURN NEW;
    END IF;

    v_order_id := NEW.id;
    v_store_id := NEW.store_id;
    v_items := NEW.items;

    -- A. Target Location
    SELECT id INTO v_default_location_id 
    FROM storage_locations 
    WHERE store_id = v_store_id AND is_default = TRUE 
    LIMIT 1;
    v_target_location_id := v_default_location_id;

    -- Fallback for items
    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        SELECT jsonb_agg(
            jsonb_build_object(
                'productId', product_id,
                'quantity', quantity,
                'variant', variant_id
            )
        )
        INTO v_items
        FROM order_items 
        WHERE order_id = v_order_id;
    END IF;

    IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
        NEW.stock_deducted := TRUE;
        RETURN NEW;
    END IF;

    -- C. Loop Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
        v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
        v_product_id := COALESCE(
            (v_item->>'productId')::UUID, 
            (v_item->>'product_id')::UUID,
            (v_item->>'id')::UUID
        );
        
        IF v_product_id IS NULL OR v_item_qty <= 0 THEN CONTINUE; END IF;

        v_variant_id := NULL;
        BEGIN
            IF v_item->>'variant' IS NOT NULL AND (v_item->>'variant')::TEXT != 'null' THEN
                v_variant_id := (v_item->>'variant')::UUID;
            ELSIF v_item->>'variant_id' IS NOT NULL AND (v_item->>'variant_id')::TEXT != 'null' THEN
                v_variant_id := (v_item->>'variant_id')::UUID;
            END IF;
        EXCEPTION WHEN OTHERS THEN v_variant_id := NULL; END;

        v_has_recipe := FALSE;

        -- 1. Recipes
        v_recipe_multiplier := 1.0;
        IF v_variant_id IS NOT NULL THEN
            SELECT COALESCE(recipe_multiplier, 1.0) INTO v_recipe_multiplier
            FROM product_variants WHERE id = v_variant_id;
        END IF;

        FOR v_recipe_record IN 
            SELECT inventory_item_id, quantity_required FROM product_recipes WHERE product_id = v_product_id
        LOOP
            v_has_recipe := TRUE;
            DECLARE
                v_final_qty NUMERIC := v_recipe_record.quantity_required * v_recipe_multiplier * v_item_qty;
                v_r_unit TEXT;
            BEGIN
                SELECT unit_type INTO v_r_unit FROM inventory_items WHERE id = v_recipe_record.inventory_item_id;
                IF v_r_unit = 'unit' THEN v_final_qty := ROUND(v_final_qty); END IF;

                INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
                VALUES (gen_random_uuid(), v_store_id, v_recipe_record.inventory_item_id, v_order_id, -v_final_qty, COALESCE(v_r_unit, 'unit'), 'recipe_consumption', v_target_location_id);
            END;
        END LOOP;

        -- 2. Direct Sale (NO RECIPE)
        IF v_has_recipe = FALSE THEN
            BEGIN
                -- Attempt to find mapping first
                SELECT inventory_item_id INTO v_active_inventory_item_id 
                FROM inventory_product_mapping 
                WHERE product_id = v_product_id;

                -- Fallback to product_id
                IF v_active_inventory_item_id IS NULL THEN
                    v_active_inventory_item_id := v_product_id;
                END IF;

                SELECT unit_type INTO v_direct_unit 
                FROM inventory_items 
                WHERE id = v_active_inventory_item_id;
                
                IF FOUND THEN
                    INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
                    VALUES (gen_random_uuid(), v_store_id, v_active_inventory_item_id, v_order_id, -v_item_qty, COALESCE(v_direct_unit, 'unit'), 'direct_sale', v_target_location_id);
                END IF;
            END;
        END IF;
    END LOOP;

    NEW.stock_deducted := TRUE;
    RETURN NEW;
END;
$$;

-- ==============================================================================
-- 4. DATA CLEANUP & REPAIR
-- ==============================================================================

-- 4.1. Delete Broken Recipes (Referencing inactive ingredients)
DELETE FROM product_recipes 
WHERE inventory_item_id NOT IN (SELECT id FROM inventory_items WHERE is_active = TRUE);

-- 4.2. Pending Orders (Ready/Paid but not deducted)
-- Force them to 'served' so the stock deduction trigger fires (if they aren't already deducted)
UPDATE orders 
SET status = 'served', updated_at = NOW()
WHERE status = 'ready' 
  AND payment_status = 'paid' 
  AND stock_deducted = FALSE;

-- 4.3. Menu Visibility (Ensure General Menu is Active)
UPDATE categories SET is_active = TRUE WHERE name = 'Menú General';

-- 4.4. Ghost Items (Optional: ensure all products have at least one mapping or recipe)
-- (Skipped to avoid creating clutter, rely on Direct Sale Fallback in finalize_order_stock)

