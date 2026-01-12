-- Drop existing function first
DROP FUNCTION IF EXISTS get_menu_products(uuid);

-- Create simplified get_menu_products that uses inventory_items directly
-- Since menu_items table doesn't have the expected structure,
-- we fetch from inventory_items based on store_id and is_menu_visible

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
    -- (since menu_items table doesn't have menu-product relationship)
    RETURN QUERY
    SELECT 
        ii.id as product_id,
        ii.name::TEXT,
        COALESCE(ii.description, '')::TEXT as description,
        COALESCE(ii.price, 0)::NUMERIC as base_price,
        COALESCE(ii.price, 0)::NUMERIC as effective_price,
        COALESCE(c.name, 'General')::TEXT as category,
        COALESCE(ii.image_url, '')::TEXT as image_url,
        TRUE as is_available,
        0 as "position"
    FROM inventory_items ii
    LEFT JOIN categories c ON c.id = ii.category_id
    WHERE ii.store_id = v_store_id
      AND ii.is_menu_visible = TRUE
      AND ii.price > 0
    ORDER BY ii.name;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_menu_products TO authenticated;
GRANT EXECUTE ON FUNCTION get_menu_products TO anon;
