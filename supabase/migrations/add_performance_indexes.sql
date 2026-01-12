-- Create indexes to improve query performance
CREATE INDEX IF NOT EXISTS idx_inventory_items_store_id ON public.inventory_items (store_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category_id ON public.inventory_items (category_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_menu_visible ON public.inventory_items (is_menu_visible);
CREATE INDEX IF NOT EXISTS idx_inventory_items_item_type ON public.inventory_items (item_type);

-- Also check inventory_location_stock
CREATE INDEX IF NOT EXISTS idx_inventory_location_stock_item_id ON public.inventory_location_stock (item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_location_stock_store_id ON public.inventory_location_stock (store_id);

-- And order_items
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON public.order_items (product_id);

-- And orders
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON public.orders (store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
