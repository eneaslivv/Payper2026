
-- Update get_menu_products to join with products table for images
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
    -- Get the store_id for the menu
    SELECT store_id INTO v_store_id FROM menus WHERE id = p_menu_id;

    -- If menu doesn't exist, return empty
    IF v_store_id IS NULL THEN
        RETURN;
    END IF;

    -- Return ALL visible inventory_items for the store
    -- Joining with products to pick up images that might be stored there
    RETURN QUERY
    SELECT 
        ii.id as product_id,
        ii.name::TEXT,
        COALESCE(ii.description, '')::TEXT as description,
        COALESCE(ii.price, 0)::NUMERIC as base_price,
        COALESCE(ii.price, 0)::NUMERIC as effective_price,
        COALESCE(c.name, 'General')::TEXT as category,
        COALESCE(p.image, p.image_url, ii.image_url, '')::TEXT as image_url,
        TRUE as is_available,
        0 as "position"
    FROM inventory_items ii
    LEFT JOIN categories c ON c.id = ii.category_id
    -- Join with products by SKU or Name to find potential images
    LEFT JOIN products p ON (
        (p.sku = ii.sku AND ii.sku IS NOT NULL AND ii.sku <> '') OR 
        (p.name = ii.name AND (ii.sku IS NULL OR ii.sku = ''))
    ) AND p.store_id = v_store_id
    WHERE ii.store_id = v_store_id
      AND ii.is_menu_visible = TRUE
      AND ii.price > 0
    ORDER BY ii.name;
END;
$$;
