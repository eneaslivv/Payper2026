-- CHECK POLICIES on order_items
SELECT schemaname, tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE tablename IN ('order_items', 'order_item_addons');

-- CHECK IF RLS IS ENABLED
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname IN ('order_items', 'order_item_addons');
