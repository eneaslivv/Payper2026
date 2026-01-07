-- POLICY: Inventory Items
DROP POLICY IF EXISTS "Enable access for store members" ON inventory_items;

CREATE POLICY "Enable access for store members" ON inventory_items
    FOR ALL
    USING (store_id = get_user_store_id())
    WITH CHECK (store_id = get_user_store_id());

-- POLICY: Categories
DROP POLICY IF EXISTS "Enable access for store members" ON categories;

CREATE POLICY "Enable access for store members" ON categories
    FOR ALL
    USING (store_id = get_user_store_id())
    WITH CHECK (store_id = get_user_store_id());

-- POLICY: Products
DROP POLICY IF EXISTS "Enable access for store members" ON products;

CREATE POLICY "Enable access for store members" ON products
    FOR ALL
    USING (store_id = get_user_store_id())
    WITH CHECK (store_id = get_user_store_id());

-- POLICY: Product Recipes
DROP POLICY IF EXISTS "Enable access for store members" ON product_recipes;

CREATE POLICY "Enable access for store members" ON product_recipes
    FOR ALL
    USING (
        product_id IN (
            SELECT id FROM products WHERE store_id = get_user_store_id()
        )
    )
    WITH CHECK (
        product_id IN (
            SELECT id FROM products WHERE store_id = get_user_store_id()
        )
    );
