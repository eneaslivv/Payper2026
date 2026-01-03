-- Trigger to prevent deletion of storage locations with active stock
CREATE OR REPLACE FUNCTION public.check_stock_before_delete_location()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_has_stock boolean;
BEGIN
    -- Check if there is any stock in this location
    SELECT EXISTS (
        SELECT 1
        FROM public.inventory_location_stock
        WHERE location_id = OLD.id
        AND (
            closed_units > 0 
            OR 
            (open_packages IS NOT NULL AND jsonb_array_length(open_packages) > 0)
        )
    ) INTO v_has_stock;

    IF v_has_stock THEN
        RAISE EXCEPTION 'Cannot delete location with active stock. Move stock to another location first.';
    END IF;

    RETURN OLD;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_check_stock_before_delete ON public.storage_locations;

-- Create Trigger
CREATE TRIGGER trg_check_stock_before_delete
BEFORE DELETE ON public.storage_locations
FOR EACH ROW
EXECUTE FUNCTION public.check_stock_before_delete_location();
