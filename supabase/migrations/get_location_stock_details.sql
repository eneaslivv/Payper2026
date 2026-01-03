-- Function to get detailed stock items for a location
-- Bypasses RLS to ensure consistency with get_location_stock metrics
CREATE OR REPLACE FUNCTION public.get_location_stock_details(p_location_id uuid)
RETURNS TABLE (
    id uuid, -- inventory_location_stock id
    item_id uuid,
    closed_units integer,
    open_packages jsonb,
    item_name text,
    item_unit_type text,
    item_image_url text,
    item_cost numeric,
    item_package_size numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ls.id,
        ls.item_id,
        ls.closed_units,
        ls.open_packages,
        ii.name as item_name,
        ii.unit_type as item_unit_type,
        ii.image_url as item_image_url,
        ii.cost as item_cost,
        ii.package_size as item_package_size
    FROM public.inventory_location_stock ls
    JOIN public.inventory_items ii ON ii.id = ls.item_id
    WHERE ls.location_id = p_location_id
    ORDER BY ii.name ASC;
END;
$$;
