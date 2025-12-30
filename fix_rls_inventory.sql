-- Enable RLS (just in case)
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- POLICY: Inventory Items
-- Allow read/write for users belonging to the same store
CREATE POLICY "Enable access for store members" ON inventory_items
    FOR ALL
    USING (store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ))
    WITH CHECK (store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ));

-- POLICY: Categories
CREATE POLICY "Enable access for store members" ON categories
    FOR ALL
    USING (store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ))
    WITH CHECK (store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ));

-- POLICY: Products (Update existing public policy to allow editing by owners)
-- Drop existing potential strict policies if needed, or just add a broad one for members
DROP POLICY IF EXISTS "Enable access for store members" ON products;
CREATE POLICY "Enable access for store members" ON products
    FOR ALL
    USING (store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ))
    WITH CHECK (store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ));
