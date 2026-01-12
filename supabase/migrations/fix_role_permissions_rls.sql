-- Habilitar RLS en cafe_role_permissions
ALTER TABLE cafe_role_permissions ENABLE ROW LEVEL SECURITY;

-- 1. Política de Lectura (SELECT)
CREATE POLICY "Users can read permissions of their store roles" ON cafe_role_permissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM cafe_roles cr
    JOIN profiles p ON p.store_id = cr.store_id
    WHERE cr.id = cafe_role_permissions.role_id
    AND p.id = auth.uid()
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);

-- 2. Política de Inserción (INSERT)
CREATE POLICY "Owners can add permissions" ON cafe_role_permissions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cafe_roles cr
    JOIN profiles p ON p.store_id = cr.store_id
    WHERE cr.id = cafe_role_permissions.role_id
    AND p.id = auth.uid()
    AND p.role IN ('store_owner', 'staff') -- Verificar rol del usuario
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);

-- 3. Política de Actualización (UPDATE)
CREATE POLICY "Owners can update permissions" ON cafe_role_permissions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM cafe_roles cr
    JOIN profiles p ON p.store_id = cr.store_id
    WHERE cr.id = cafe_role_permissions.role_id
    AND p.id = auth.uid()
    AND p.role IN ('store_owner', 'staff')
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM cafe_roles cr
    JOIN profiles p ON p.store_id = cr.store_id
    WHERE cr.id = cafe_role_permissions.role_id
    AND p.id = auth.uid()
    AND p.role IN ('store_owner', 'staff')
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);

-- 4. Política de Eliminación (DELETE)
CREATE POLICY "Owners can delete permissions" ON cafe_role_permissions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM cafe_roles cr
    JOIN profiles p ON p.store_id = cr.store_id
    WHERE cr.id = cafe_role_permissions.role_id
    AND p.id = auth.uid()
    AND p.role IN ('store_owner', 'staff')
  )
  OR
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
);
