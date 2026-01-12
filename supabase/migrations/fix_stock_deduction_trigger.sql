-- Function to deduct stock for a specific order
CREATE OR REPLACE FUNCTION deduct_stock_for_order() RETURNS TRIGGER AS $$
DECLARE
    v_item RECORD;
    v_recipe RECORD;
    v_consumption_result JSONB;
BEGIN
    -- Only proceed if order is just marked as paid
    IF NEW.is_paid = true AND OLD.is_paid = false THEN
        
        -- Loop through order items
        FOR v_item IN SELECT * FROM order_items WHERE order_id = NEW.id LOOP
            
            -- Find recipe for this product (support multiple ingredients)
            FOR v_recipe IN 
                SELECT pr.inventory_item_id, pr.quantity_required, ii.unit_type
                FROM product_recipes pr
                JOIN inventory_items ii ON ii.id = pr.inventory_item_id
                WHERE pr.product_id = v_item.product_id
            LOOP
                -- Deduct stock using the smart consumption function (which handles recursive open packages)
                -- Note: consume_from_open_packages MUST be available (defined in fix_open_package_consumption.sql)
                PERFORM consume_from_open_packages(
                    v_recipe.inventory_item_id,
                    NEW.store_id,
                    (v_recipe.quantity_required * v_item.quantity), -- Total needed
                    COALESCE(v_recipe.unit_type, 'un'),
                    'sale', -- Reason
                    NEW.id  -- Order ID for tracking
                );
            END LOOP;
        END LOOP;
        
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Trigger
DROP TRIGGER IF EXISTS trigger_deduct_stock_on_payment ON orders;
CREATE TRIGGER trigger_deduct_stock_on_payment
    AFTER UPDATE OF is_paid ON orders
    FOR EACH ROW
    EXECUTE FUNCTION deduct_stock_for_order();
