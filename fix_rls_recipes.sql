-- Enable RLS just in case
ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;

-- POLICY: Product Recipes
-- Allow access if the user owns the product referenced
DROP POLICY IF EXISTS "Enable access for store members" ON product_recipes;

CREATE POLICY "Enable access for store members" ON product_recipes
    FOR ALL
    USING (
        product_id IN (
            SELECT id FROM products WHERE store_id IN (
                SELECT store_id FROM profiles WHERE id = auth.uid()
            )
        )
    )
    WITH CHECK (
        product_id IN (
            SELECT id FROM products WHERE store_id IN (
                SELECT store_id FROM profiles WHERE id = auth.uid()
            )
        )
    );
