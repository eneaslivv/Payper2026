-- HOTFIX: Comprehensive RLS policies for clients table
-- Fixes the "permission denied for table clients" error

-- First, enable RLS if not already enabled
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "allow_client_self_insert" ON clients;
DROP POLICY IF EXISTS "allow_self_registration" ON clients;
DROP POLICY IF EXISTS "allow_client_self_read" ON clients;
DROP POLICY IF EXISTS "clients_insert_policy" ON clients;
DROP POLICY IF EXISTS "clients_select_policy" ON clients;
DROP POLICY IF EXISTS "clients_update_policy" ON clients;

-- POLICY 1: Allow authenticated users to INSERT their own client record
-- This enables self-registration when scanning QR or accessing menu
CREATE POLICY "clients_insert_policy" ON clients
    FOR INSERT
    TO authenticated
    WITH CHECK (
        auth_user_id = auth.uid() OR
        auth.uid() IS NOT NULL -- Allow insert if authenticated
    );

-- POLICY 2: Allow clients to READ their own record (for profile, balance, etc.)
CREATE POLICY "clients_select_policy" ON clients
    FOR SELECT
    TO authenticated
    USING (
        auth_user_id = auth.uid() -- Client can read their own record
        OR 
        store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()) -- Staff can read clients of their store
    );

-- POLICY 3: Allow clients to UPDATE their own record (for profile edits)
CREATE POLICY "clients_update_policy" ON clients
    FOR UPDATE
    TO authenticated
    USING (auth_user_id = auth.uid())
    WITH CHECK (auth_user_id = auth.uid());

-- POLICY 4: Allow staff to read ALL clients in their store (for admin panel)
CREATE POLICY "staff_read_store_clients" ON clients
    FOR SELECT
    TO authenticated
    USING (
        store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid())
    );

-- POLICY 5: Allow staff to update client records (for balance, points, etc.)
CREATE POLICY "staff_update_store_clients" ON clients
    FOR UPDATE
    TO authenticated
    USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));

-- Also grant basic table permissions
GRANT SELECT, INSERT, UPDATE ON clients TO authenticated;
