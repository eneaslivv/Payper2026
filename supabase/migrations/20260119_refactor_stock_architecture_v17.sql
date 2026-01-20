-- V17: Refactor Stock Architecture (Single Source of Truth)

-- 1. Create Trigger Function to Update Inventory from Stock Movements
-- This ensures that ANY movement (order, damage, adjustment) updates the real stock.
CREATE OR REPLACE FUNCTION public.update_inventory_from_movement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Validation
    IF NEW.inventory_item_id IS NULL THEN
        RAISE EXCEPTION 'Stock movement must have an inventory_item_id';
    END IF;

    -- Update Logic based on Location
    IF NEW.location_id IS NOT NULL THEN
        -- Link movement to location stock
        INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
        VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta)
        ON CONFLICT (store_id, item_id, location_id)
        DO UPDATE SET 
            closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units,
            updated_at = now();
    ELSE
        -- Fallback: Update global item stock (if no specific location)
        UPDATE inventory_items 
        SET current_stock = current_stock + NEW.qty_delta 
        WHERE id = NEW.inventory_item_id;
    END IF;

    RETURN NEW;
END;
$function$;

-- 2. Attach Trigger to stock_movements
DROP TRIGGER IF EXISTS trg_update_inventory_from_movement ON stock_movements;
CREATE TRIGGER trg_update_inventory_from_movement
    AFTER INSERT ON stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_from_movement();

-- 3. Refactor finalize_order_stock to ONLY generate movements
-- It now relies purely on product_recipes (1:1 or N:M) and does NOT touch inventory directly.
CREATE OR REPLACE FUNCTION public.finalize_order_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order_id UUID;
    v_store_id UUID;
    v_items JSONB;
    v_item JSONB;
    v_item_qty NUMERIC;
    v_sellable_id UUID;
    v_variant_id UUID;
    v_recipe_multiplier NUMERIC;
    v_recipe_record RECORD;
    v_location_id UUID;
    v_default_location_id UUID;
BEGIN
    -- Execute only on delivery (served) and if not already deducted
    IF NEW.status = 'served' AND NEW.stock_deducted = FALSE THEN
       
        v_order_id := NEW.id;
        v_store_id := NEW.store_id;
        v_items := NEW.items;

        -- Fallback to order_items
        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
             SELECT jsonb_agg(jsonb_build_object('id', product_id, 'quantity', quantity, 'variant_id', variant_id))
             INTO v_items FROM order_items WHERE order_id = v_order_id;
        END IF;

        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
            NEW.stock_deducted := TRUE;
            RETURN NEW;
        END IF;

        -- Get Default Location (Dispatch Station)
        SELECT id INTO v_default_location_id FROM storage_locations WHERE store_id = v_store_id AND is_default = TRUE LIMIT 1;
        v_location_id := v_default_location_id;

        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
            v_sellable_id := (v_item->>'id')::UUID;
            v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);
            
            -- RECIPES ONLY LOGIC
            -- We iterate through all recipes associated with this product.
            -- If a product is "Simple", it MUST have a 1:1 recipe in product_recipes to be deducted.
            FOR v_recipe_record IN SELECT * FROM product_recipes WHERE product_id = v_sellable_id LOOP
                v_recipe_multiplier := COALESCE(v_recipe_record.quantity_required, 1);
                
                -- Generate Movement
                -- The Trigger on stock_movements will handle the actual inventory update.
                INSERT INTO stock_movements (
                    idempotency_key, 
                    store_id, 
                    inventory_item_id, 
                    order_id, 
                    qty_delta, 
                    unit_type, 
                    reason, 
                    location_id
                )
                VALUES (
                    gen_random_uuid(), 
                    v_store_id, 
                    v_recipe_record.inventory_item_id, 
                    v_order_id, 
                    -(v_item_qty * v_recipe_multiplier), 
                    'recipe', 
                    'order_delivered', 
                    v_location_id
                );
            END LOOP;
        END LOOP;

        NEW.stock_deducted := TRUE;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Stock deduction trigger failed for Order %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

-- 4. Clean up Redundant Triggers
DROP TRIGGER IF EXISTS trigger_recalc_after_order ON orders;
DROP FUNCTION IF EXISTS recalc_after_order_complete();
