-- STOCK SYNCHRONIZATION: Global Stock = Sum(Location Stocks)
-- FINAL VERSION: Consolidating source of truth to inventory_location_stock

-- 1. Disable conflicting legacy triggers and functions
DROP TRIGGER IF EXISTS trg_sync_item_stock ON public.inventory_location_stock;
DROP TRIGGER IF EXISTS trg_recalc_stock_on_update ON public.inventory_items;

-- 2. Consolidate calculate_item_totals to use inventory_location_stock
CREATE OR REPLACE FUNCTION public.calculate_item_totals(p_item_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
DECLARE
    v_total_closed integer;
    v_total_stock numeric;
    v_package_size numeric;
BEGIN
    -- Get package size from inventory_items
    SELECT COALESCE(package_size, 1) INTO v_package_size 
    FROM public.inventory_items WHERE id = p_item_id;

    -- Calculate total closed units from inventory_location_stock (NEW SOURCE OF TRUTH)
    SELECT COALESCE(SUM(closed_units), 0)::integer INTO v_total_closed
    FROM public.inventory_location_stock
    WHERE item_id = p_item_id;

    -- Calculate open stock remaining from open units in locations
    SELECT COALESCE(SUM((pkg->>'remaining')::numeric), 0) INTO v_total_stock
    FROM public.inventory_location_stock ls
    CROSS JOIN LATERAL jsonb_array_elements(ls.open_packages) pkg
    WHERE ls.item_id = p_item_id;

    -- Combine: Closed * Size + Open Remaining
    v_total_stock := v_total_stock + (v_total_closed * COALESCE(v_package_size, 1));

    -- Update inventory_items
    UPDATE public.inventory_items
    SET 
        current_stock = v_total_stock,
        closed_stock = v_total_closed,
        updated_at = now()
    WHERE id = p_item_id;
END;
$$;

-- 3. Update sync_inventory_item_stock to use the unified calculator
CREATE OR REPLACE FUNCTION public.sync_inventory_item_stock()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM public.calculate_item_totals(OLD.item_id);
    ELSE
        PERFORM public.calculate_item_totals(NEW.item_id);
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Ensure trigger is attached and uniquely present
DROP TRIGGER IF EXISTS trg_sync_inventory_item_stock ON public.inventory_location_stock;
CREATE TRIGGER trg_sync_inventory_item_stock
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_location_stock
FOR EACH ROW
EXECUTE FUNCTION public.sync_inventory_item_stock();

-- 5. Attach to inventory_items to handle package_size changes
CREATE TRIGGER trg_recalc_stock_on_update
AFTER UPDATE OF package_size ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION trg_recalc_stock_on_item_update();

-- 6. REPAIR SCRIPT: Synchronize all existing items
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN (SELECT id FROM public.inventory_items) LOOP
        PERFORM public.calculate_item_totals(r.id);
    END LOOP;
END $$;
