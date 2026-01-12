-- Add item_type column to inventory_items
ALTER TABLE inventory_items 
ADD COLUMN item_type text DEFAULT 'ingredient';

-- Optional: Add check constraint if we want to enforce values
-- ALTER TABLE inventory_items ADD CONSTRAINT check_item_type 
-- CHECK (item_type IN ('ingredient', 'sellable', 'prepared', 'final_product', 'pack'));
