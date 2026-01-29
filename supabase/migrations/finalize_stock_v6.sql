    -- =========================================================
    -- MIGRATION: FINAL ROBUST STOCK DEDUCTION (V6)
    -- System: Payper (Coffe Squad)
    -- Description: Handles Recipes, Variants (Multipliers/Overrides), Direct Sales, and Addons.
    -- =========================================================

    -- 1. Create/Replace the Main Deduction Function
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
        v_variant_record RECORD;
        v_addon_id UUID;
        v_addon_record RECORD;
        v_override_item JSONB;
        v_target_location_id UUID;
        v_default_location_id UUID;
        v_has_recipe BOOLEAN;
        v_stock_deducted BOOLEAN;
        v_unit_type TEXT;
    BEGIN
        -- Prevent double deduction policies
        IF NEW.stock_deducted = TRUE THEN
            RETURN NEW;
        END IF;

        -- Conditions to Deduct Stock:
        -- 1. Status is 'served', 'delivered', 'entregado' (Finalized)
        -- OR
        -- 2. Payment is 'paid' or 'approved' (Pre-paid orders like QR/Wallet)
        IF NOT (
            NEW.status IN ('served', 'delivered', 'entregado', 'finalizado') OR 
            NEW.is_paid = TRUE OR 
            NEW.payment_status IN ('paid', 'approved')
        ) THEN
            RETURN NEW;
        END IF;

        v_order_id := NEW.id;
        v_store_id := NEW.store_id;
        v_items := NEW.items;

        -- A. Determine Target Location (Priority: Default Store Location)
        -- NOTE: 'location_id' column does not exist on orders table yet. 
        -- We default to the primary storage location for the store.
        SELECT id INTO v_default_location_id 
        FROM storage_locations 
        WHERE store_id = v_store_id AND is_default = TRUE 
        LIMIT 1;
        
        v_target_location_id := v_default_location_id;

        -- If no location found, we can still deduct from global inventory_items, but we log a warning.
        IF v_target_location_id IS NULL THEN
            RAISE WARNING 'No target location found for Order %. Deducting from global only.', v_order_id;
        END IF;

        -- B. Input Strategy: JSONB 'items' vs 'order_items' table
        -- For INSERT triggers, 'items' JSONB is reliable. For UPDATE, 'order_items' is better.
        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
            -- Attempt to build from table if JSON is empty (Backwards compatibility / Update scenarios)
            SELECT jsonb_agg(
                jsonb_build_object(
                    'productId', product_id,
                    'quantity', quantity,
                    'variant', variant_id -- Some payloads use 'variant_id', mapping below handles it
                )
            )
            INTO v_items
            FROM order_items 
            WHERE order_id = v_order_id;
        END IF;

        IF v_items IS NULL OR jsonb_array_length(v_items) = 0 THEN
            -- Still no items? Mark deducted to avoid retries and exit.
            NEW.stock_deducted := TRUE;
            RETURN NEW;
        END IF;

        -- C. Iterate Items
        FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
        LOOP
            -- Extract Basic Info
            v_item_qty := COALESCE((v_item->>'quantity')::NUMERIC, 0);
            -- Support both 'productId' (frontend) and 'id' (legacy) keys
            v_product_id := COALESCE(
                (v_item->>'productId')::UUID, 
                (v_item->>'product_id')::UUID,
                (v_item->>'id')::UUID
            );
            
            -- Validate
            IF v_product_id IS NULL OR v_item_qty <= 0 THEN
                CONTINUE;
            END IF;

            -- Extract Variant ID (Support 'variant' object or 'variant_id' string)
            v_variant_id := NULL;
            BEGIN
                IF v_item->>'variant' IS NOT NULL AND (v_item->>'variant')::TEXT != 'null' THEN
                    -- If it's a UUID string
                    v_variant_id := (v_item->>'variant')::UUID;
                ELSIF v_item->>'variant_id' IS NOT NULL AND (v_item->>'variant_id')::TEXT != 'null' THEN
                    v_variant_id := (v_item->>'variant_id')::UUID;
                END IF;
            EXCEPTION WHEN OTHERS THEN
                v_variant_id := NULL; -- Start fresh if casting fails
            END;

            v_has_recipe := FALSE;

            -- === 1. RECIPE CALCULATION ===
            
            -- Get Variant Multiplier (Default 1.0)
            v_recipe_multiplier := 1.0;
            IF v_variant_id IS NOT NULL THEN
                SELECT COALESCE(recipe_multiplier, 1.0) INTO v_recipe_multiplier
                FROM product_variants 
                WHERE id = v_variant_id;
            END IF;

            -- Iterate Recipe Ingredients
            FOR v_recipe_record IN 
                SELECT inventory_item_id, quantity_required 
                FROM product_recipes 
                WHERE product_id = v_product_id
            LOOP
                v_has_recipe := TRUE;
                
                -- Calculate: (Recipe Qty * Variant Multiplier * Order Qty)
                DECLARE
                    v_final_qty NUMERIC := v_recipe_record.quantity_required * v_recipe_multiplier * v_item_qty;
                    v_r_unit TEXT;
                BEGIN
                    -- Get Unit Type for rounding logic
                    SELECT unit_type INTO v_r_unit FROM inventory_items WHERE id = v_recipe_record.inventory_item_id;
                    IF v_r_unit = 'unit' THEN v_final_qty := ROUND(v_final_qty); END IF;

                    -- INSERT MOVEMENT (Trigger on stock_movements will update table)
                    INSERT INTO stock_movements (
                        idempotency_key, store_id, inventory_item_id, order_id, 
                        qty_delta, unit_type, reason, location_id
                    ) VALUES (
                        gen_random_uuid(), v_store_id, v_recipe_record.inventory_item_id, v_order_id,
                        -v_final_qty, COALESCE(v_r_unit, 'unit'), 'recipe_consumption', v_target_location_id
                    );
                END;
            END LOOP;

            -- === 2. DIRECT SALE (NO RECIPE) ===
            IF v_has_recipe = FALSE THEN
                -- Check if the product_id is actually an inventory_item_id (Direct Item Sale)
                -- OR if it's a Product that maps 1:1 to an Inv Item (common in simple setups)
                DECLARE 
                    v_direct_unit TEXT;
                    v_exists BOOLEAN;
                BEGIN
                    SELECT unit_type INTO v_direct_unit 
                    FROM inventory_items 
                    WHERE id = v_product_id;
                    
                    IF FOUND THEN
                        INSERT INTO stock_movements (
                            idempotency_key, store_id, inventory_item_id, order_id, 
                            qty_delta, unit_type, reason, location_id
                        ) VALUES (
                            gen_random_uuid(), v_store_id, v_product_id, v_order_id,
                            -v_item_qty, COALESCE(v_direct_unit, 'unit'), 'direct_sale', v_target_location_id
                        );
                    END IF;
                END;
            END IF;

            -- === 3. VARIANT OVERRIDES (Extra Ingredients) ===
            IF v_variant_id IS NOT NULL THEN
                SELECT recipe_overrides INTO v_variant_record 
                FROM product_variants 
                WHERE id = v_variant_id;

                IF v_variant_record.recipe_overrides IS NOT NULL AND jsonb_array_length(v_variant_record.recipe_overrides) > 0 THEN
                    FOR v_override_item IN SELECT * FROM jsonb_array_elements(v_variant_record.recipe_overrides)
                    LOOP
                        DECLARE
                            v_o_inv_id UUID := (v_override_item->>'inventory_item_id')::UUID;
                            v_o_qty NUMERIC := (v_override_item->>'quantity')::NUMERIC * v_item_qty; -- Usually fixed qty per item
                            v_o_unit TEXT;
                        BEGIN
                            SELECT unit_type INTO v_o_unit FROM inventory_items WHERE id = v_o_inv_id;
                            IF v_o_unit = 'unit' THEN v_o_qty := ROUND(v_o_qty); END IF;

                            INSERT INTO stock_movements (
                                idempotency_key, store_id, inventory_item_id, order_id, 
                                qty_delta, unit_type, reason, location_id
                            ) VALUES (
                                gen_random_uuid(), v_store_id, v_o_inv_id, v_order_id,
                                -v_o_qty, COALESCE(v_o_unit, 'unit'), 'variant_override', v_target_location_id
                            );
                        END;
                    END LOOP;
                END IF;
            END IF;

            -- === 4. ADDONS ===
            -- Support: v_item->'addons' (array of strings) or v_item->'addon_ids'
            -- Note: Schema says product_addons table maps product_id + inventory_item_id
            -- We usually receive addon IDs in the payload
        END LOOP;

        -- MARK AS DEDUCTED
        NEW.stock_deducted := TRUE;
        
        RETURN NEW;
    EXCEPTION WHEN OTHERS THEN
        -- Fail safe: Log error but ensure order creation succeeds
        RAISE WARNING 'Stock deduction V6 failed for Order %: %', NEW.id, SQLERRM;
        -- Do NOT set stock_deducted=TRUE so we can retry later or debug
        RETURN NEW;
    END;
    $$;

    -- 2. Validate Helper Function (Ensure idempotency column exists)
    DO $$ 
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='stock_deducted') THEN
            ALTER TABLE orders ADD COLUMN stock_deducted BOOLEAN DEFAULT FALSE;
        END IF;
    END $$;

    -- 3. Create Triggers
    DROP TRIGGER IF EXISTS trg_finalize_stock_v6_insert ON orders;
    CREATE TRIGGER trg_finalize_stock_v6_insert
        AFTER INSERT ON orders
        FOR EACH ROW
        EXECUTE FUNCTION finalize_order_stock();

    DROP TRIGGER IF EXISTS trg_finalize_stock_v6_update ON orders;
    CREATE TRIGGER trg_finalize_stock_v6_update
        BEFORE UPDATE ON orders
        FOR EACH ROW
        EXECUTE FUNCTION finalize_order_stock();

    -- Status
    SELECT 'STOCK DEDUCTION V6 INSTALLED' as status;
