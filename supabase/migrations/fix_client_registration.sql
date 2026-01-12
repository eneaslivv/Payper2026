-- FIX 1: Allow authenticated users to insert their own client record
-- This policy allows users to create their own client profile during registration

DROP POLICY IF EXISTS "allow_client_self_insert" ON clients;
CREATE POLICY "allow_client_self_insert" ON clients
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Alternative: Allow insert if auth_user_id matches the authenticated user
DROP POLICY IF EXISTS "allow_self_registration" ON clients;
CREATE POLICY "allow_self_registration" ON clients
    FOR INSERT
    WITH CHECK (auth_user_id = auth.uid());

-- Ensure SELECT works for clients to see their own profile
DROP POLICY IF EXISTS "allow_client_self_read" ON clients;
CREATE POLICY "allow_client_self_read" ON clients
    FOR SELECT
    USING (auth_user_id = auth.uid() OR store_id IN (
        SELECT store_id FROM profiles WHERE id = auth.uid()
    ));

-- FIX 2: Simplified resolve_menu function without non-existent columns
CREATE OR REPLACE FUNCTION public.resolve_menu(
    p_store_id UUID,
    p_session_type TEXT DEFAULT 'generic',
    p_table_id UUID DEFAULT NULL,
    p_bar_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_menu_id UUID;
BEGIN
    -- Priority 1: Check for table-specific menu assignment
    IF p_table_id IS NOT NULL THEN
        SELECT menu_id INTO v_menu_id
        FROM venue_nodes
        WHERE id = p_table_id AND store_id = p_store_id AND menu_id IS NOT NULL;
        
        IF v_menu_id IS NOT NULL THEN
            RETURN v_menu_id;
        END IF;
    END IF;
    
    -- Priority 2: Get any active menu for the store
    -- (Simplified: removed references to non-existent columns)
    SELECT id INTO v_menu_id
    FROM menus
    WHERE store_id = p_store_id 
      AND is_active = TRUE
    ORDER BY created_at DESC
    LIMIT 1;
    
    -- If still no menu found, try ANY menu for the store
    IF v_menu_id IS NULL THEN
        SELECT id INTO v_menu_id
        FROM menus
        WHERE store_id = p_store_id
        ORDER BY created_at DESC
        LIMIT 1;
    END IF;
    
    RETURN v_menu_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION resolve_menu TO authenticated;
GRANT EXECUTE ON FUNCTION resolve_menu TO anon;
