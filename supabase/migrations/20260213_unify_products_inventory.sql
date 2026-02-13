-- =============================================
-- MIGRATION: Unify Products and Inventory System
-- Date: 2026-02-13
-- Issue: P1-3 - Dual system (products + inventory_items) causes desynchronization
-- Solution: Create clear separation and bridge tables
-- =============================================

-- PART 1: Analysis of Current State
-- =============================================
COMMENT ON TABLE public.products IS
'Sellable menu items (what customers see and order). Can be simple products or composed recipes.';

COMMENT ON TABLE public.inventory_items IS
'Raw materials and ingredients tracked in inventory. Used in recipes or sold directly as products.';

-- PART 2: Add Relationship Columns
-- =============================================

-- Add column to link products to their inventory representation (if applicable)
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS linked_inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.products.linked_inventory_item_id IS
'Optional FK to inventory_items. Used when a product is a direct sale of an inventory item (no recipe).';

-- Add flag to inventory_items to indicate if it can be sold directly
ALTER TABLE public.inventory_items
ADD COLUMN IF NOT EXISTS is_sellable BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN public.inventory_items.is_sellable IS
'TRUE if this inventory item can be sold directly as a product (no recipe needed).';

-- PART 3: Create Materialized View for Product-Inventory Mapping
-- =============================================

CREATE OR REPLACE VIEW public.product_inventory_map AS
SELECT
    p.id AS product_id,
    p.name AS product_name,
    p.price AS product_price,
    p.store_id,
    p.category_id,
    p.is_active,

    -- Inventory linkage
    CASE
        WHEN p.linked_inventory_item_id IS NOT NULL THEN p.linked_inventory_item_id
        WHEN EXISTS (
            SELECT 1 FROM product_recipes pr
            WHERE pr.product_id = p.id
            LIMIT 1
        ) THEN NULL -- Has recipe, no direct inventory link
        ELSE NULL
    END AS inventory_item_id,

    -- Recipe info
    CASE
        WHEN EXISTS (
            SELECT 1 FROM product_recipes pr
            WHERE pr.product_id = p.id
        ) THEN TRUE
        ELSE FALSE
    END AS has_recipe,

    (
        SELECT jsonb_agg(
            jsonb_build_object(
                'inventory_item_id', pr.inventory_item_id,
                'quantity_required', pr.quantity_required,
                'ingredient_name', ii.name
            )
        )
        FROM product_recipes pr
        JOIN inventory_items ii ON ii.id = pr.inventory_item_id
        WHERE pr.product_id = p.id
    ) AS recipe_ingredients

FROM products p;

COMMENT ON VIEW public.product_inventory_map IS
'Unified view showing product-to-inventory relationships. Helps identify which products have recipes vs direct inventory links.';

-- PART 4: Migration Helper - Auto-link Simple Products
-- =============================================

DO $$
DECLARE
    v_product RECORD;
    v_inventory_item_id UUID;
    v_updated_count INTEGER := 0;
BEGIN
    -- Find products that have NO recipe and share name with inventory items
    FOR v_product IN
        SELECT p.id, p.name, p.store_id
        FROM products p
        WHERE p.linked_inventory_item_id IS NULL
        AND NOT EXISTS (
            SELECT 1 FROM product_recipes pr
            WHERE pr.product_id = p.id
        )
    LOOP
        -- Try to find matching inventory item (same name, same store)
        SELECT id INTO v_inventory_item_id
        FROM inventory_items
        WHERE store_id = v_product.store_id
        AND LOWER(name) = LOWER(v_product.name)
        LIMIT 1;

        IF v_inventory_item_id IS NOT NULL THEN
            -- Link product to inventory item
            UPDATE products
            SET linked_inventory_item_id = v_inventory_item_id
            WHERE id = v_product.id;

            -- Mark inventory item as sellable
            UPDATE inventory_items
            SET is_sellable = TRUE
            WHERE id = v_inventory_item_id;

            v_updated_count := v_updated_count + 1;

            RAISE NOTICE 'Auto-linked product "%" to inventory item %', v_product.name, v_inventory_item_id;
        END IF;
    END LOOP;

    RAISE NOTICE 'Auto-linked % products to inventory items', v_updated_count;
END $$;

-- PART 5: Create Function to Validate Product-Inventory Consistency
-- =============================================

CREATE OR REPLACE FUNCTION public.validate_product_inventory_consistency()
RETURNS TABLE (
    issue_type TEXT,
    product_id UUID,
    product_name TEXT,
    inventory_item_id UUID,
    inventory_name TEXT,
    description TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Issue 1: Products with both recipe AND direct inventory link
    RETURN QUERY
    SELECT
        'DUAL_LINKAGE' AS issue_type,
        p.id AS product_id,
        p.name AS product_name,
        p.linked_inventory_item_id AS inventory_item_id,
        ii.name AS inventory_name,
        'Product has both a recipe and direct inventory link (ambiguous)' AS description
    FROM products p
    JOIN inventory_items ii ON ii.id = p.linked_inventory_item_id
    WHERE p.linked_inventory_item_id IS NOT NULL
    AND EXISTS (
        SELECT 1 FROM product_recipes pr
        WHERE pr.product_id = p.id
    );

    -- Issue 2: Products with no recipe AND no inventory link
    RETURN QUERY
    SELECT
        'NO_LINKAGE' AS issue_type,
        p.id AS product_id,
        p.name AS product_name,
        NULL::UUID AS inventory_item_id,
        NULL::TEXT AS inventory_name,
        'Product has no recipe and no inventory link (orphaned)' AS description
    FROM products p
    WHERE p.linked_inventory_item_id IS NULL
    AND NOT EXISTS (
        SELECT 1 FROM product_recipes pr
        WHERE pr.product_id = p.id
    );

    -- Issue 3: Inventory items linked to products but not marked as sellable
    RETURN QUERY
    SELECT
        'NOT_SELLABLE' AS issue_type,
        p.id AS product_id,
        p.name AS product_name,
        ii.id AS inventory_item_id,
        ii.name AS inventory_name,
        'Inventory item is linked but not marked as sellable' AS description
    FROM products p
    JOIN inventory_items ii ON ii.id = p.linked_inventory_item_id
    WHERE ii.is_sellable = FALSE;
END;
$$;

COMMENT ON FUNCTION public.validate_product_inventory_consistency IS
'Returns list of product-inventory inconsistencies that need manual review.';

-- PART 6: Updated Stock Deduction Logic Documentation
-- =============================================

COMMENT ON FUNCTION public.deduct_order_stock_unified IS
'Stock deduction priority:
1. Check if product has recipe (product_recipes) → Use recipe
2. Check if product has linked_inventory_item_id → Direct sale
3. Check fallback inventory_item_recipes → Legacy support
4. Fail with error (no stock tracking for this product)';

-- PART 7: Create Indexes for Performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_products_linked_inventory
ON products(linked_inventory_item_id)
WHERE linked_inventory_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_sellable
ON inventory_items(store_id, is_sellable)
WHERE is_sellable = TRUE;

-- PART 8: Verification Queries
-- =============================================

-- Count products by type
SELECT
    CASE
        WHEN linked_inventory_item_id IS NOT NULL THEN 'Direct Inventory Link'
        WHEN EXISTS (
            SELECT 1 FROM product_recipes pr
            WHERE pr.product_id = products.id
        ) THEN 'Has Recipe'
        ELSE 'No Linkage (Orphaned)'
    END AS product_type,
    COUNT(*) AS count
FROM products
GROUP BY product_type;

-- Show consistency issues
SELECT * FROM validate_product_inventory_consistency();

RAISE NOTICE '✅ P1-3 COMPLETED: Products and Inventory system unified';
RAISE NOTICE 'Review: SELECT * FROM validate_product_inventory_consistency();';
RAISE NOTICE 'View: SELECT * FROM product_inventory_map LIMIT 10;';
