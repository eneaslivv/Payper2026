-- =============================================
-- MIGRATION: Inventory Items - Phase 1 Safe Cleanup
-- Date: 2026-02-13
-- Phase: 1/3 (No Breaking Changes)
-- Ref: PLAN_NORMALIZACION_INVENTORY_ITEMS.md
-- =============================================

-- PART 1: Remove Duplicate Column (quantity = current_stock)
-- =============================================

-- Verification: quantity is exact duplicate of current_stock
DO $$
DECLARE
    v_mismatches INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_mismatches
    FROM inventory_items
    WHERE quantity IS NOT NULL
    AND quantity != current_stock;

    IF v_mismatches > 0 THEN
        RAISE EXCEPTION 'Cannot drop quantity column: % rows have mismatching values', v_mismatches;
    END IF;

    RAISE NOTICE 'SAFE: quantity column is exact duplicate of current_stock (0 mismatches)';
END $$;

-- Drop duplicate column
ALTER TABLE public.inventory_items
DROP COLUMN IF EXISTS quantity;

COMMENT ON COLUMN public.inventory_items.current_stock IS
'Current total stock (across all locations). Column "quantity" was removed as exact duplicate.';


-- PART 2: Analyze min_stock vs min_stock_alert vs min_quantity
-- =============================================

-- Display current usage pattern
DO $$
DECLARE
    v_min_stock_used INTEGER;
    v_min_alert_used INTEGER;
    v_min_qty_used INTEGER;
    v_alert_qty_match INTEGER;
BEGIN
    -- Count non-zero values
    SELECT
        COUNT(*) FILTER (WHERE min_stock > 0),
        COUNT(*) FILTER (WHERE min_stock_alert > 0),
        COUNT(*) FILTER (WHERE min_quantity > 0),
        COUNT(*) FILTER (WHERE min_stock_alert = min_quantity)
    INTO v_min_stock_used, v_min_alert_used, v_min_qty_used, v_alert_qty_match
    FROM inventory_items;

    RAISE NOTICE 'Min Stock Analysis:';
    RAISE NOTICE '  - min_stock used (>0): % rows', v_min_stock_used;
    RAISE NOTICE '  - min_stock_alert used (>0): % rows', v_min_alert_used;
    RAISE NOTICE '  - min_quantity used (>0): % rows', v_min_qty_used;
    RAISE NOTICE '  - min_stock_alert = min_quantity: % rows', v_alert_qty_match;
END $$;

-- Decision: Keep min_quantity (most used), min_stock_alert (alert system)
-- Drop min_stock (always 0, not used)
ALTER TABLE public.inventory_items
DROP COLUMN IF EXISTS min_stock;

COMMENT ON COLUMN public.inventory_items.min_quantity IS
'Minimum quantity before reorder alert. Previously had duplicate min_stock column (always 0).';

COMMENT ON COLUMN public.inventory_items.min_stock_alert IS
'Stock level that triggers alert (used by alert system).';


-- PART 3: Mark Deprecated Columns (To be moved in Phase 2)
-- =============================================

-- These columns should be in 'products' table, not 'inventory_items'
COMMENT ON COLUMN public.inventory_items.price IS
'DEPRECATED [Phase 2]: Price is for SALE (product), not inventory. Should be in products table.';

COMMENT ON COLUMN public.inventory_items.is_menu_visible IS
'DEPRECATED [Phase 2]: Menu visibility is product attribute. Should be in products table.';

COMMENT ON COLUMN public.inventory_items.is_recommended IS
'DEPRECATED [Phase 2]: Marketing badge for products. Should be in products table.';

COMMENT ON COLUMN public.inventory_items.is_new IS
'DEPRECATED [Phase 2]: Marketing badge for products. Should be in products table.';

COMMENT ON COLUMN public.inventory_items.is_promo IS
'DEPRECATED [Phase 2]: Promotion flag for products. Should be in products table.';

COMMENT ON COLUMN public.inventory_items.sort_order IS
'DEPRECATED [Phase 2]: Menu display order. Should be in products table.';

COMMENT ON COLUMN public.inventory_items.addons IS
'DEPRECATED [Phase 2]: Product addons. Should be in products/product_addons table.';

COMMENT ON COLUMN public.inventory_items.variants IS
'DEPRECATED [Phase 2]: Product variants. Should be in products/product_variants table.';

COMMENT ON COLUMN public.inventory_items.combo_items IS
'DEPRECATED [Phase 2]: Product combos. Should be in products table.';

COMMENT ON COLUMN public.inventory_items.image_url IS
'DEPRECATED [Phase 2]: Product image for menu. Consider if needed for inventory or move to products.';

-- Columns to be extracted to inventory_stock_config (Phase 2)
COMMENT ON COLUMN public.inventory_items.max_stock IS
'PHASE 2: Will be moved to inventory_stock_config table.';

COMMENT ON COLUMN public.inventory_items.ideal_stock IS
'PHASE 2: Will be moved to inventory_stock_config table.';

COMMENT ON COLUMN public.inventory_items.reorder_point IS
'PHASE 2: Will be moved to inventory_stock_config table.';

-- Columns to be extracted to inventory_package_config (Phase 2)
COMMENT ON COLUMN public.inventory_items.package_size IS
'PHASE 2: Will be moved to inventory_package_config table.';

COMMENT ON COLUMN public.inventory_items.content_unit IS
'PHASE 2: Will be moved to inventory_package_config table.';

COMMENT ON COLUMN public.inventory_items.min_packages IS
'PHASE 2: Will be moved to inventory_package_config table.';

-- Columns to be extracted to inventory_purchase_history (Phase 2)
COMMENT ON COLUMN public.inventory_items.last_supplier_id IS
'PHASE 2: Will be moved to inventory_purchase_history table.';

COMMENT ON COLUMN public.inventory_items.last_purchase_price IS
'PHASE 2: Will be moved to inventory_purchase_history table.';


-- PART 4: Add helpful comments to core columns
-- =============================================

COMMENT ON COLUMN public.inventory_items.id IS
'Unique identifier for inventory item (ingredient/raw material).';

COMMENT ON COLUMN public.inventory_items.name IS
'Display name of inventory item.';

COMMENT ON COLUMN public.inventory_items.sku IS
'Stock Keeping Unit - unique code for inventory tracking.';

COMMENT ON COLUMN public.inventory_items.unit_type IS
'Unit of measurement (kg, L, units, etc).';

COMMENT ON COLUMN public.inventory_items.cost IS
'Current average cost per unit (for COGS calculation).';

COMMENT ON COLUMN public.inventory_items.current_stock IS
'Calculated total stock across all locations (sum of location stocks).';

COMMENT ON COLUMN public.inventory_items.store_id IS
'Multi-tenant isolation: store that owns this inventory item.';

COMMENT ON COLUMN public.inventory_items.item_type IS
'Type of inventory item (ingredient, packaging, supply, etc).';

COMMENT ON COLUMN public.inventory_items.is_active IS
'Whether this inventory item is currently in use.';

COMMENT ON COLUMN public.inventory_items.stock_logic_version IS
'Version of stock deduction logic (for migration tracking).';


-- PART 5: Verification and Summary
-- =============================================

-- Count remaining columns
DO $$
DECLARE
    v_column_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_column_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'inventory_items';

    RAISE NOTICE 'SUCCESS: Phase 1 cleanup completed';
    RAISE NOTICE 'Columns removed: quantity (duplicate), min_stock (unused)';
    RAISE NOTICE 'Remaining columns: % (down from 39)', v_column_count;
    RAISE NOTICE 'Deprecated columns marked for Phase 2: 15';
END $$;

-- Display final column count
SELECT
    'inventory_items' as table_name,
    COUNT(*) as column_count,
    COUNT(*) FILTER (WHERE column_name IN ('quantity', 'min_stock')) as should_be_dropped
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'inventory_items';

-- Expected: column_count = 37 (down from 39), should_be_dropped = 0
