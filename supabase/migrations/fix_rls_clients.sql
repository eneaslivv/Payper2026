-- POLICY: Clients Access for Store Owners
DROP POLICY IF EXISTS "Enable access for store members" ON clients;

CREATE POLICY "Enable access for store members" ON clients
    FOR ALL
    USING (store_id = get_user_store_id())
    WITH CHECK (store_id = get_user_store_id());
