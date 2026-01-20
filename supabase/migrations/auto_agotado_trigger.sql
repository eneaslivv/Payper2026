-- auto_agotado_trigger.sql: MARK PRODUCTS AS UNAVAILABLE WHEN INGREDIENTS ARE OUT OF STOCK

-- 1. Helper Function to Check a Single Product
CREATE OR REPLACE FUNCTION check_product_stock_availability(p_product_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_item RECORD;
    v_variant RECORD;
    v_available BOOLEAN := TRUE;
    v_total_stock NUMERIC;
BEGIN
    -- Check Base Recipe
    FOR v_item IN 
        SELECT pr.inventory_item_id, pr.quantity_required, ii.current_stock
        FROM product_recipes pr
        JOIN inventory_items ii ON ii.id = pr.inventory_item_id
        WHERE pr.product_id = p_product_id
    LOOP
        IF v_item.current_stock < v_item.quantity_required THEN
            v_available := FALSE;
            EXIT;
        END IF;
    END LOOP;

    -- Note: If variants are used, availability might depend on variant selection.
    -- For now, we keep it simple: if the BASE recipe is out, the product is out.
    -- (In the future, we could check if ANY variant is available).

    RETURN v_available;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger Function to Update Products
CREATE OR REPLACE FUNCTION update_product_availability_on_stock_change()
RETURNS TRIGGER AS $$
DECLARE
    v_product_id UUID;
BEGIN
    -- Find all products that use this ingredient
    -- We use a loop to update each one (triggering product update triggers if any exist)
    FOR v_product_id IN 
        SELECT DISTINCT product_id 
        FROM product_recipes 
        WHERE inventory_item_id = NEW.id OR inventory_item_id = OLD.id
    LOOP
        UPDATE products 
        SET is_available = check_product_stock_availability(v_product_id),
            updated_at = NOW()
        WHERE id = v_product_id;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create Trigger on inventory_items
DROP TRIGGER IF EXISTS trg_auto_update_product_availability ON inventory_items;
CREATE TRIGGER trg_auto_update_product_availability
AFTER UPDATE OF current_stock ON inventory_items
FOR EACH ROW
EXECUTE FUNCTION update_product_availability_on_stock_change();

-- 4. Initial Synchronization: Run availability check for all products
DO $$
DECLARE
    v_pid UUID;
BEGIN
    FOR v_pid IN SELECT id FROM products WHERE active = true
    LOOP
        UPDATE products 
        SET is_available = check_product_stock_availability(v_pid)
        WHERE id = v_pid;
    END LOOP;
END $$;
