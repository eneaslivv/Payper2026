
-- Update get_menu_products with robust case-insensitive join
CREATE OR REPLACE FUNCTION public.get_menu_products(p_menu_id UUID)
RETURNS TABLE (
    product_id UUID,
    name TEXT,
    description TEXT,
    base_price NUMERIC,
    effective_price NUMERIC,
    category TEXT,
    image_url TEXT,
    is_available BOOLEAN,
    "position" INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_store_id UUID;
BEGIN
    SELECT store_id INTO v_store_id FROM menus WHERE id = p_menu_id;
    IF v_store_id IS NULL THEN RETURN; END IF;

    RETURN QUERY
    SELECT 
        ii.id as product_id,
        ii.name::TEXT,
        COALESCE(ii.description, '')::TEXT as description,
        COALESCE(p.base_price, ii.price, 0)::NUMERIC as base_price,
        COALESCE(p.base_price, ii.price, 0)::NUMERIC as effective_price,
        COALESCE(c.name, 'General')::TEXT as category,
        COALESCE(NULLIF(p.image, ''), NULLIF(p.image_url, ''), NULLIF(ii.image_url, ''), '')::TEXT as image_url,
        TRUE as is_available,
        0 as "position"
    FROM inventory_items ii
    LEFT JOIN categories c ON c.id = ii.category_id
    LEFT JOIN products p ON (
        (p.sku = ii.sku AND ii.sku IS NOT NULL AND ii.sku <> '') OR 
        (LOWER(TRIM(p.name)) = LOWER(TRIM(ii.name)))
    ) AND p.store_id = v_store_id
    WHERE ii.store_id = v_store_id
      AND ii.is_menu_visible = TRUE
    ORDER BY ii.name;
END;
$$;
