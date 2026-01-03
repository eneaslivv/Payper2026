-- TRIGGER TO SYNC GLOBAL STOCK FROM LOCATIONS
-- Asegura que inventory_items.current_stock y closed_stock sean siempre la suma de las ubicaciones

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
    -- Get package size
    SELECT COALESCE(package_size, 1) INTO v_package_size 
    FROM public.inventory_items WHERE id = p_item_id;

    -- Calculate totals
    SELECT 
        COALESCE(SUM(ls.closed_units), 0),
        COALESCE(SUM(
            ls.closed_units * COALESCE(v_package_size, 1) +
            (SELECT COALESCE(SUM((pkg->>'remaining')::numeric), 0) FROM jsonb_array_elements(ls.open_packages) pkg)
        ), 0)
    INTO v_total_closed, v_total_stock
    FROM public.inventory_location_stock ls
    WHERE ls.item_id = p_item_id;

    -- Update inventory_items
    UPDATE public.inventory_items
    SET 
        current_stock = v_total_stock,
        closed_stock = v_total_closed
    WHERE id = p_item_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_item_stock_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        PERFORM public.calculate_item_totals(OLD.item_id);
        RETURN OLD;
    ELSE
        PERFORM public.calculate_item_totals(NEW.item_id);
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_item_stock ON public.inventory_location_stock;
CREATE TRIGGER trg_sync_item_stock
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_location_stock
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_item_stock_fn();

-- Recalcular todo una vez para asegurar consistencia inicial
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN SELECT id FROM public.inventory_items LOOP
        PERFORM public.calculate_item_totals(r.id);
    END LOOP;
END $$;
