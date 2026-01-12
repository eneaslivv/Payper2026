-- Habilitar RLS en caso de que no esté
ALTER TABLE cafe_roles ENABLE ROW LEVEL SECURITY;

-- 1. Política para INSERTAR roles
-- Permite insertar si el usuario es store_owner del store_id especificado
CREATE POLICY "Owners can create roles" ON cafe_roles
FOR INSERT
TO authenticated
WITH CHECK (
  auth.role() = 'authenticated' AND (
    -- Es Super Admin
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
    OR
    -- O es Dueño/Staff del mismo local
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() 
      AND store_id = cafe_roles.store_id
      AND role IN ('store_owner', 'staff') -- Asumimos que staff también puede si tiene permisos, o restringir solo a owner
    )
  )
);

-- 2. Política para ACTUALIZAR roles
CREATE POLICY "Owners can update roles" ON cafe_roles
FOR UPDATE
TO authenticated
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  OR
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND store_id = cafe_roles.store_id
    AND role IN ('store_owner', 'staff')
  )
)
WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  OR
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND store_id = cafe_roles.store_id
    AND role IN ('store_owner', 'staff')
  )
);

-- 3. Política para BORRAR roles
CREATE POLICY "Owners can delete roles" ON cafe_roles
FOR DELETE
TO authenticated
USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'super_admin'
  OR
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND store_id = cafe_roles.store_id
    AND role IN ('store_owner', 'staff')
  )
);
