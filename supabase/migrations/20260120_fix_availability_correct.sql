-- Migration: Fix Availability Logic for Client Menu (Corrected)
-- Date: 2026-01-20
-- Description: 
-- 1. Creates check_product_stock_availability using CORRECT column names (package_size)
-- 2. Creates trigger to auto-update products.is_available when stock changes
-- 3. Creates RPC get_products_with_availability for ClientContext

-- ==============================================================================
-- PART 1: Function to check if a product can be made (has all ingredients)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.check_product_stock_availability(p_product_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_available BOOLEAN := TRUE;
    v_item RECORD;
    v_total_closed INTEGER;
    v_total_stock NUMERIC;
    v_package_size NUMERIC;
BEGIN
    -- Iterate through all ingredients for the product
    FOR v_item IN
        SELECT 
            pr.inventory_item_id, 
            pr.quantity_required, 
            ii.package_size,  -- CORRECTED: verified column name
            ii.current_stock
        FROM product_recipes pr
        JOIN inventory_items ii ON ii.id = pr.inventory_item_id
        WHERE pr.product_id = p_product_id
    LOOP
        v_package_size := COALESCE(v_item.package_size, 1);
        
        -- Check 1: Basic mass/quantity check
        IF v_item.current_stock < v_item.quantity_required THEN
            v_available := FALSE;
            EXIT;
        END IF;

        -- Check 2: If recipe requires a WHOLE UNIT (>= 90% of package_size)
        -- Then we need at least 1 closed unit available
        IF v_package_size > 0 AND v_item.quantity_required >= (v_package_size * 0.9) THEN
            -- Sum closed units across all locations for this item
            SELECT COALESCE(SUM(closed_units), 0) INTO v_total_closed
            FROM inventory_location_stock
            WHERE item_id = v_item.inventory_item_id;

            IF v_total_closed < 1 THEN
                v_available := FALSE;
                EXIT;
            END IF;
        END IF;
    END LOOP;

    RETURN v_available;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- PART 2: Trigger to auto-update product availability when stock changes
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_product_availability()
RETURNS TRIGGER AS $$
DECLARE
    v_product RECORD;
BEGIN
    -- Find all products that use this ingredient
    FOR v_product IN
        SELECT DISTINCT pr.product_id
        FROM product_recipes pr
        WHERE pr.inventory_item_id = COALESCE(NEW.item_id, OLD.item_id)
    LOOP
        -- Update the product's is_available flag
        UPDATE products 
        SET is_available = public.check_product_stock_availability(v_product.product_id),
            updated_at = now()
        WHERE id = v_product.product_id;
    END LOOP;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to inventory_location_stock
DROP TRIGGER IF EXISTS trg_update_product_availability ON public.inventory_location_stock;
CREATE TRIGGER trg_update_product_availability
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_location_stock
FOR EACH ROW
EXECUTE FUNCTION public.update_product_availability();

-- Also trigger when inventory_items.current_stock changes directly
CREATE OR REPLACE FUNCTION public.update_product_availability_from_item()
RETURNS TRIGGER AS $$
DECLARE
    v_product RECORD;
BEGIN
    -- Find all products that use this ingredient
    FOR v_product IN
        SELECT DISTINCT pr.product_id
        FROM product_recipes pr
        WHERE pr.inventory_item_id = NEW.id
    LOOP
        UPDATE products 
        SET is_available = public.check_product_stock_availability(v_product.product_id),
            updated_at = now()
        WHERE id = v_product.product_id;
    END LOOP;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_product_availability_item ON public.inventory_items;
CREATE TRIGGER trg_update_product_availability_item
AFTER UPDATE OF current_stock, closed_stock ON public.inventory_items
FOR EACH ROW
EXECUTE FUNCTION public.update_product_availability_from_item();

-- ==============================================================================
-- PART 3: Initial sync - Update all products now
-- ==============================================================================
DO $$
DECLARE
    r RECORD;
    v_available BOOLEAN;
BEGIN
    FOR r IN SELECT id FROM products WHERE active = true LOOP
        v_available := public.check_product_stock_availability(r.id);
        UPDATE products 
        SET is_available = v_available, 
            updated_at = now() 
        WHERE id = r.id;
        
        RAISE NOTICE 'Product % availability: %', r.id, v_available;
    END LOOP;
END $$;

-- ==============================================================================
-- PART 4: RPC for ClientContext to check availability in real-time
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_products_with_availability(p_store_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    price NUMERIC,
    image_url TEXT,
    category_id UUID,
    is_available BOOLEAN,
    is_visible BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.description,
        p.price,
        p.image_url,
        p.category_id,
        public.check_product_stock_availability(p.id) AS is_available,
        p.is_visible
    FROM products p
    WHERE p.store_id = p_store_id
      AND p.active = true
    ORDER BY p.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
