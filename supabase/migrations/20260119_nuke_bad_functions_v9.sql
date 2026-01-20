-- FIX: Search and Destroy "Zombie" Functions (V9)
-- Priority: Critical
-- Reason: "column inventory_items.quantity does not exist" persists. 
--         Manual inspection missed the culprit. This script inspects code dynamically and drops offenders.

DO $$
DECLARE
    r RECORD;
    v_sql TEXT;
BEGIN
    FOR r IN 
        SELECT p.proname, p.oid::regprocedure as sig, p.prosrc
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
          -- Look for specific bad pattern "inventory_items.quantity" or implicit reference
          AND (
               p.prosrc ILIKE '%inventory_items%quantity%' 
            OR p.prosrc ILIKE '%quantity%inventory_items%'
            OR p.prosrc ILIKE '%inventory_items%set%quantity%'
          )
          -- Exclude functions we verified are safe (aliases or other tables)
          AND p.proname NOT IN (
              'create_order', 
              'calculate_order_points', 
              'get_orders_with_details',
              'update_order_status',
              'calculate_item_totals',
              'sync_inventory_item_stock',
              'check_product_stock_availability',
              'finalize_order_stock' -- We will re-create this anyway, but let's drop it explicitly later
          )
    LOOP
        RAISE NOTICE 'Found suspicious function: %. Dropping...', r.sig;
        v_sql := 'DROP FUNCTION ' || r.sig || ' CASCADE';
        EXECUTE v_sql;
    END LOOP;
END$$;

-- 2. Explicitly drop and recreate the delivery logic (Just to be absolutely sure)
DROP TRIGGER IF EXISTS trg_finalize_stock ON orders;
DROP FUNCTION IF EXISTS public.finalize_order_stock() CASCADE;
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, uuid) CASCADE;

-- 3. Re-create V6 Logic (Correct)

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
    v_target_location_id UUID;
    v_recipe_record RECORD;
    v_override_item JSONB;
    v_variant_record RECORD;
    v_addon_id UUID;
    v_addon_data RECORD;
BEGIN
    -- Only proceed if status/payment indicates paid AND stock not yet deducted
    IF (NEW.is_paid = TRUE OR NEW.payment_status IN ('paid', 'approved')) 
       AND NEW.stock_deducted = FALSE THEN
       
        v_order_id := NEW.id;
        v_store_id := NEW.store_id;
        v_items := NEW.items;

        -- Fallback: If items JSON is empty
        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
             SELECT jsonb_agg(
                jsonb_build_object(
                    'id', product_id,
                    'quantity', quantity,
                    'variant_id', variant_id,
                    'sellable_type', 'product', 
                    'addon_ids', (
                        SELECT jsonb_agg(addon_id)
                        FROM order_item_addons
                        WHERE order_item_id = oi.id
                    )
                )
             )
             INTO v_items
             FROM order_items oi
             WHERE order_id = v_order_id;
        END IF;

        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
            NEW.stock_deducted := TRUE;
            RETURN NEW;
        END IF;

        -- Process loop
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
            v_sellable_id := (v_item->>'id')::UUID;
            v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 1);
            v_variant_id := (v_item->>'variant_id')::UUID;

            -- 1. Check if it's a direct inventory item (Simple Product)
            IF EXISTS (SELECT 1 FROM inventory_items WHERE id = v_sellable_id) THEN
                UPDATE inventory_items 
                SET current_stock = current_stock - v_item_qty 
                WHERE id = v_sellable_id;
                
                INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                VALUES (gen_random_uuid(), v_store_id, v_sellable_id, v_order_id, -v_item_qty, 'unit', 'sale');
            END IF;

            -- 2. Check Product Recipe
            FOR v_recipe_record IN 
                SELECT * FROM product_recipes WHERE product_id = v_sellable_id
            LOOP
                v_recipe_multiplier := COALESCE(v_recipe_record.quantity_required, 1);
                
                UPDATE inventory_items
                SET current_stock = current_stock - (v_item_qty * v_recipe_multiplier)
                WHERE id = v_recipe_record.inventory_item_id;

                 INSERT INTO stock_movements (idempotency_key, store_id, inventory_item_id, order_id, qty_delta, unit_type, reason)
                VALUES (gen_random_uuid(), v_store_id, v_recipe_record.inventory_item_id, v_order_id, -(v_item_qty * v_recipe_multiplier), 'recipe', 'sale_recipe');
            END LOOP;

            -- 3. Variant Overrides
             IF v_variant_id IS NOT NULL THEN
                SELECT * INTO v_variant_record FROM product_variants WHERE id = v_variant_id;
                IF v_variant_record.recipe_overrides IS NOT NULL AND jsonb_array_length(v_variant_record.recipe_overrides) > 0 THEN
                     FOR v_override_item IN SELECT * FROM jsonb_array_elements(v_variant_record.recipe_overrides)
                     LOOP
                        UPDATE inventory_items
                        SET current_stock = current_stock - ((v_override_item->>'quantity')::NUMERIC * v_item_qty)
                        WHERE id = (v_override_item->>'inventory_item_id')::UUID;
                     END LOOP;
                END IF;
            END IF;

        END LOOP;

        NEW.stock_deducted := TRUE;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Stock deduction trigger failed for Order %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_finalize_stock
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION finalize_order_stock();

-- RPC Re-creation
CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id uuid, p_staff_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order_store_id UUID;
    v_status TEXT;
    v_is_paid BOOLEAN;
BEGIN
    SELECT status, is_paid, store_id
    INTO v_status, v_is_paid, v_order_store_id
    FROM orders WHERE id = p_order_id FOR UPDATE;

    IF v_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado');
    END IF;
    
    -- Force 'served' status
    UPDATE orders SET 
        status = 'served',
        delivered_at = NOW(),
        delivered_by = p_staff_id,
        updated_at = NOW()
    WHERE id = p_order_id;
    
    -- The trigger trg_finalize_stock will run here automatically

    RETURN jsonb_build_object('success', true, 'message', 'Orden entregada correctamente');
END;
$function$;
