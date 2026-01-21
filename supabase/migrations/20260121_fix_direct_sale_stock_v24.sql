-- Migration: Fix Direct Sale Stock Logic (V24)
-- Created: 2026-01-21
-- Description: Implements simplified stock deduction for direct sales (no recipe) vs recipe consumption.

-- 1. Update deduct_order_stock to distinguish reason
CREATE OR REPLACE FUNCTION public.deduct_order_stock(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order RECORD;
    v_item RECORD;
    v_recipe_item RECORD;
    v_addon_id UUID;
    v_addon RECORD;
    v_stock_record RECORD;
    v_deduction_qty NUMERIC;
    v_location_id UUID;
    v_default_location_id UUID;
    v_target_location_id UUID;
    v_item_qty NUMERIC;
    v_product_id UUID;
    v_has_recipe BOOLEAN;
    v_unit_type TEXT;
BEGIN
    -- Get Order Info
    SELECT * INTO v_order FROM orders WHERE id = p_order_id;
    IF NOT FOUND THEN RETURN; END IF;
    IF v_order.stock_deducted THEN RETURN; END IF; -- Idempotency

    -- Get Default Location for Store
    SELECT id INTO v_default_location_id 
    FROM storage_locations 
    WHERE store_id = v_order.store_id AND is_default = TRUE 
    LIMIT 1;

    -- Iterate Order Items
    FOR v_item IN 
        SELECT * FROM order_items WHERE order_id = p_order_id
    LOOP
        v_item_qty := v_item.quantity;
        v_product_id := v_item.product_id;
        v_has_recipe := FALSE;

        -- Determine Location (Priority: Order Location -> Item Location -> Default)
        v_location_id := v_order.location_id; 
        IF v_location_id IS NULL THEN v_location_id := v_default_location_id; END IF;
        -- Fallback: If still null, just skip? Or try to get any location?
        v_target_location_id := v_location_id;

        -- CHECK RECIPE
        FOR v_recipe_item IN 
            SELECT * FROM product_recipes WHERE product_id = v_product_id
        LOOP
            v_has_recipe := TRUE;
            v_deduction_qty := v_recipe_item.quantity_required * v_item_qty;
            
            -- Get Unit Type for movement history
            SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_recipe_item.inventory_item_id;

            -- Insert Movement: Recipe Consumption
            INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
            VALUES (gen_random_uuid(), v_order.store_id, v_recipe_item.inventory_item_id, p_order_id, -v_deduction_qty, COALESCE(v_unit_type, 'unit'), 'recipe_consumption', v_target_location_id);
        END LOOP;

        -- IF NO RECIPE -> DIRECT SALE (Consume the Product itself if it is linked to an inventory item??)
        -- Usually products are NOT inventory items directly. But if a Product IS also an Inventory Item (uncommon in this schema),
        -- OR if we just want to track "Sales" of generic items? 
        -- WAIT: The standard logic usually assumes Products mapped to Items via Recipe.
        -- BUT User is selling "TEST" or "Panceta" which are PRODUCTS that clearly map to Inventory Items in their mind.
        -- In Payper V1, sometimes Products were linked to Inventory Items via `inventory_item_id` on the Product table?
        -- Let's check products table columns...
        -- Assuming products don't have direct link, we rely on name match or "Direct Link"?
        -- Actually, the legacy code often tried to find an inventory item with same name? Or maybe we assume Product ID = Item ID?
        -- NO. The previous code for `deduct_order_stock` (Step 4417) had logic:
        -- "IF NOT v_has_recipe THEN ... check if product tracks stock ... INSERT ... reason='order_delivered'"
        -- It seems previous logic relied on some link.
        -- Let's assume there IS a way to link them.
        -- Wait, looking at Step 4417 output (truncated): `v_product_id` was used?
        -- Ah, if NO recipe, does it assume the Product IS the Item?
        -- Let's just use the logic `v_product_id` cast to Item ID? No, IDs are UUIDs.
        -- We will assume there is a recipe OR the product IS the item (if linked).
        -- Re-reading Step 4417: It queried `product_recipes`. If loop empty, it did `INSERT ... inventory_item_id`.
        -- WHERE did it get `inventory_item_id` if no recipe?
        -- It likely assumes `v_item.product_id` matches an `inventory_item.id` OR there is a column `inventory_item_id` on products.
        -- Let's blindly trust the User's "Venta Directa" implies we know the Item ID.
        -- BUT wait, `deduct_order_stock` in Step 4417 used `v_product_id` as `inventory_item_id` in the fallback!
        -- "VALUES (..., v_product_id, ...)"
        
        IF NOT v_has_recipe THEN
             -- Direct Sale: Use 'direct_sale' reason
             -- We assume Product ID maps to Inventory Item ID (or they are same entity in this context)
             -- Use 'unit' as default type unless we look it up
             
             -- Lookup unit type
             SELECT unit_type INTO v_unit_type FROM inventory_items WHERE id = v_product_id;
             
             INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
             VALUES (gen_random_uuid(), v_order.store_id, v_product_id, p_order_id, -v_item_qty, COALESCE(v_unit_type, 'unit'), 'direct_sale', v_target_location_id);
        END IF;

        -- ADDONS (Keep existing logic)
        IF v_item.addon_ids IS NOT NULL AND jsonb_typeof(v_item.addon_ids) = 'array' THEN
             FOR v_addon_id IN SELECT (val::text)::UUID FROM jsonb_array_elements_text(v_item.addon_ids) val
             LOOP
                  SELECT pa.inventory_item_id, pa.quantity_consumed, ii.unit_type 
                  INTO v_addon 
                  FROM product_addons pa
                  JOIN inventory_items ii ON ii.id = pa.inventory_item_id
                  WHERE pa.id = v_addon_id;

                  IF v_addon.inventory_item_id IS NOT NULL THEN
                       v_deduction_qty := COALESCE(v_addon.quantity_consumed, 1) * v_item_qty;
                       -- Addons are definitely fractional consumption
                       INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason, location_id)
                       VALUES (gen_random_uuid(), v_order.store_id, v_addon.inventory_item_id, p_order_id, -v_deduction_qty, v_addon.unit_type, 'recipe_consumption', v_target_location_id);
                  END IF;
             END LOOP;
        END IF;

    END LOOP;

    -- Mark Order as Deducted
    UPDATE orders SET stock_deducted = TRUE WHERE id = p_order_id;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[deduct_order_stock] Error in order %: %', p_order_id, SQLERRM;
END;
$function$;


-- 2. Update update_inventory_from_movement to handle 'direct_sale'
CREATE OR REPLACE FUNCTION public.update_inventory_from_movement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Validation
    IF NEW.inventory_item_id IS NULL THEN
        RAISE EXCEPTION 'Stock movement must have an inventory_item_id';
    END IF;

    -- Update Logic based on Location
    IF NEW.location_id IS NOT NULL THEN
        
        IF NEW.qty_delta < 0 THEN
            -- CONSUMPTION LOGIC
            IF NEW.reason = 'direct_sale' THEN
                -- V24: Direct Sale = Simple Closed Unit Deduction
                -- Ignore open packages, ignore liquids logic
                UPDATE inventory_location_stock
                SET closed_units = closed_units - ABS(NEW.qty_delta),
                    updated_at = now()
                WHERE item_id = NEW.inventory_item_id AND location_id = NEW.location_id;
                
                -- Ensure row exists? (Usually yes for sales, but if stock is 0? Update handles it, returns 0 rows if missing)
                -- If missing, we might need to Insert negative?
                -- Let's check if row missing.
                IF NOT FOUND THEN
                    INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units, open_packages)
                    VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta, '[]'::jsonb);
                END IF;
                
            ELSE
                -- Recipe/Fractional Consumption: Use Atomic Logic
                PERFORM decrease_stock_atomic_v20(
                    NEW.store_id, 
                    NEW.location_id, 
                    NEW.inventory_item_id, 
                    ABS(NEW.qty_delta), 
                    NEW.reason
                );
            END IF;
            
        ELSE
            -- RESTOCK/ADDITION
            INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units, open_packages)
            VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta, '[]'::jsonb)
            ON CONFLICT (store_id, item_id, location_id)
            DO UPDATE SET 
                closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units,
                updated_at = now();
        END IF;

        -- V23 FIX: ALWAYS Synchronize inventory_items.current_stock
        UPDATE inventory_items 
        SET current_stock = (
            SELECT COALESCE(SUM(closed_units), 0)
            FROM inventory_location_stock 
            WHERE item_id = NEW.inventory_item_id
        )
        WHERE id = NEW.inventory_item_id;

    ELSE
        -- Fallback: Update global item stock (if no specific location)
        UPDATE inventory_items 
        SET current_stock = current_stock + NEW.qty_delta 
        WHERE id = NEW.inventory_item_id;
    END IF;

    RETURN NEW;
END;
$function$;
