-- ============================================================================
-- Fix: get_menu_products() returns duplicate rows for recipe products
-- Date: 2026-02-24
--
-- Root cause:
--   Items that exist in BOTH inventory_items AND products tables are returned
--   twice in the UNION ALL. The inventory_items version uses
--   current_stock > 0 for availability (wrong for recipe products whose
--   current_stock = 0), while the products version uses
--   check_product_stock_availability() (correct). The frontend dedup has
--   equal priority for both → the wrong version can win → "AGOTADO" shown
--   even when all recipe ingredients are in stock.
--
-- Fix:
--   Add NOT EXISTS to inventory_items subquery to exclude items that also
--   exist as active products. This ensures recipe products only show up
--   once with correct recipe-based availability.
-- ============================================================================

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
    "position" INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_store_id UUID;
BEGIN
    SELECT store_id INTO v_store_id FROM menus WHERE id = p_menu_id;
    IF v_store_id IS NULL THEN RETURN; END IF;

    RETURN QUERY
    (
        -- Inventory Items (direct sellables) — exclude items that exist as products
        SELECT
            ii.id as product_id,
            ii.name::TEXT,
            COALESCE(ii.description, '')::TEXT as description,
            COALESCE(ii.price, 0)::NUMERIC as base_price,
            COALESCE(ii.price, 0)::NUMERIC as effective_price,
            COALESCE(c.name, 'General')::TEXT as category,
            COALESCE(ii.image_url, '')::TEXT as image_url,
            CASE
                WHEN ii.item_type = 'service' THEN TRUE
                ELSE COALESCE(ii.current_stock, 0) > 0
            END as is_available,
            0 as "position"
        FROM inventory_items ii
        LEFT JOIN categories c ON c.id = ii.category_id
        WHERE ii.store_id = v_store_id
          AND ii.is_menu_visible = TRUE
          AND ii.price > 0
          AND NOT EXISTS (
              SELECT 1 FROM products p
              WHERE p.id = ii.id
                AND p.active = TRUE
          )

        UNION ALL

        -- Products (recipes) - use REAL stock check
        SELECT
            p.id as product_id,
            p.name::TEXT,
            COALESCE(p.description, '')::TEXT as description,
            COALESCE(p.base_price, 0)::NUMERIC as base_price,
            COALESCE(p.base_price, 0)::NUMERIC as effective_price,
            COALESCE(p.category, 'General')::TEXT as category,
            COALESCE(p.image, '')::TEXT as image_url,
            public.check_product_stock_availability(p.id) as is_available,
            0 as "position"
        FROM products p
        WHERE p.store_id = v_store_id
          AND p.active = TRUE
          AND p.is_visible = TRUE
    )
    ORDER BY name;
END;
$$;
