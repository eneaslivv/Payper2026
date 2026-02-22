-- P4 Fix v3: Add 'restock' to trigger skip list to prevent double-counting
-- transfer_stock() already handles inventory_location_stock directly for restocks.
-- Without this fix, the trigger ALSO adds to inventory_location_stock, causing 2x the stock increase.

CREATE OR REPLACE FUNCTION public.update_inventory_from_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Basic validation
    IF NEW.inventory_item_id IS NULL THEN
        RAISE EXCEPTION 'Stock movement must have an inventory_item_id';
    END IF;

    -- Only track if has location_id
    IF NEW.location_id IS NOT NULL THEN
        -- SKIP inventory_location_stock updates for reasons that are handled
        -- by their respective RPC functions directly:
        -- - consume_from_smart_packages: manages open_packages + inventory_items.closed_stock
        -- - transfer_stock: manages inventory_location_stock directly for restocks
        -- - finalize_order_stock: manages stock through consume_from_smart_packages
        -- Applying qty_delta here would cause double-deduction or double-counting.
        IF NEW.reason NOT IN (
            'loss', 'sale', 'recipe_consumption', 'direct_sale',
            'variant_override', 'addon_consumed', 'order_paid', 'order_delivered',
            'restock'  -- transfer_stock() handles this directly
        ) THEN
            -- UPSERT: update closed_units for transfers, adjustments, reversals
            INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units)
            VALUES (NEW.store_id, NEW.inventory_item_id, NEW.location_id, NEW.qty_delta)
            ON CONFLICT (store_id, item_id, location_id)
            DO UPDATE SET
                closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units,
                updated_at = now();
        END IF;
    END IF;

    -- NO actualizamos inventory_items aquí — v7 (consume_from_smart_packages) ya lo hace

    RETURN NEW;
END;
$function$;
