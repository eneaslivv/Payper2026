-- HOTFIX: Make order_number per-store instead of global
-- This creates a trigger that generates order_number based on MAX+1 for each store

-- First, remove the default sequence from order_number (we'll handle it in trigger)
ALTER TABLE orders ALTER COLUMN order_number DROP DEFAULT;

-- Create a function to generate per-store order numbers
CREATE OR REPLACE FUNCTION generate_store_order_number()
RETURNS TRIGGER AS $$
DECLARE
    next_order_num INTEGER;
BEGIN
    -- Only generate if order_number is not already set
    IF NEW.order_number IS NULL THEN
        -- Get the next order number for this store
        SELECT COALESCE(MAX(order_number), 0) + 1 
        INTO next_order_num
        FROM orders 
        WHERE store_id = NEW.store_id;
        
        NEW.order_number := next_order_num;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-generate order_number before insert
DROP TRIGGER IF EXISTS trigger_generate_order_number ON orders;
CREATE TRIGGER trigger_generate_order_number
    BEFORE INSERT ON orders
    FOR EACH ROW
    EXECUTE FUNCTION generate_store_order_number();

-- Reset order numbers for the new store (GDEE) to start from 1
-- First, identify orders that need to be renumbered
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at) as new_num
    FROM orders
    WHERE store_id = 'f1097064-302b-4851-a532-2dc4f44e5736'
)
UPDATE orders SET order_number = numbered.new_num
FROM numbered
WHERE orders.id = numbered.id;

-- Verify the fix
SELECT store_id, MIN(order_number) as min_order, MAX(order_number) as max_order, COUNT(*) as total
FROM orders
GROUP BY store_id;
