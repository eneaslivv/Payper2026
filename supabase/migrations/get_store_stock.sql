-- Function to get all stock for a store
-- Used in TransferStockModal to ensure available stock is visible
CREATE OR REPLACE FUNCTION public.get_store_stock(p_store_id uuid)
RETURNS TABLE (
    id uuid,
    store_id uuid,
    item_id uuid,
    location_id uuid,
    closed_units integer,
    open_packages jsonb,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ls.id,
        ls.store_id,
        ls.item_id,
        ls.location_id,
        ls.closed_units,
        ls.open_packages,
        ls.updated_at
    FROM public.inventory_location_stock ls
    WHERE ls.store_id = p_store_id;
END;
$$;
