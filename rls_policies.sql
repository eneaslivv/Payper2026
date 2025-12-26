-- ==============================================
-- POLÍTICAS DE SEGURIDAD RLS (Row Level Security)
-- CoffeeSaaS - Multi-Tenant Security
-- ==============================================

-- Primero, habilitar RLS en todas las tablas críticas
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cafe_role_permissions ENABLE ROW LEVEL SECURITY;

-- ==============================================
-- FUNCIÓN HELPER: Obtener store_id del usuario actual
-- ==============================================
CREATE OR REPLACE FUNCTION auth.get_user_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ==============================================
-- POLÍTICAS PARA: stores
-- Los super_admins pueden ver todo, los owners solo su tienda
-- ==============================================
CREATE POLICY "Super admins can view all stores"
ON stores FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'super_admin'
  )
);

CREATE POLICY "Store owners can view their own store"
ON stores FOR SELECT
USING (id = auth.get_user_store_id());

CREATE POLICY "Store owners can update their own store"
ON stores FOR UPDATE
USING (id = auth.get_user_store_id());

CREATE POLICY "Super admins can manage all stores"
ON stores FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'super_admin'
  )
);

-- ==============================================
-- POLÍTICAS PARA: profiles
-- ==============================================
CREATE POLICY "Users can view their own profile"
ON profiles FOR SELECT
USING (id = auth.uid());

CREATE POLICY "Users can view profiles from their store"
ON profiles FOR SELECT
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
USING (id = auth.uid());

CREATE POLICY "Super admins can manage all profiles"
ON profiles FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'super_admin'
  )
);

-- ==============================================
-- POLÍTICAS PARA: products
-- ==============================================
CREATE POLICY "Users can view products from their store"
ON products FOR SELECT
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Users can insert products to their store"
ON products FOR INSERT
WITH CHECK (store_id = auth.get_user_store_id());

CREATE POLICY "Users can update products from their store"
ON products FOR UPDATE
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Users can delete products from their store"
ON products FOR DELETE
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Super admins can manage all products"
ON products FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'super_admin'
  )
);

-- ==============================================
-- POLÍTICAS PARA: inventory_items
-- ==============================================
CREATE POLICY "Users can view inventory from their store"
ON inventory_items FOR SELECT
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Users can insert inventory to their store"
ON inventory_items FOR INSERT
WITH CHECK (store_id = auth.get_user_store_id());

CREATE POLICY "Users can update inventory from their store"
ON inventory_items FOR UPDATE
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Users can delete inventory from their store"
ON inventory_items FOR DELETE
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Super admins can manage all inventory"
ON inventory_items FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'super_admin'
  )
);

-- ==============================================
-- POLÍTICAS PARA: orders
-- ==============================================
CREATE POLICY "Users can view orders from their store"
ON orders FOR SELECT
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Users can insert orders to their store"
ON orders FOR INSERT
WITH CHECK (store_id = auth.get_user_store_id());

CREATE POLICY "Users can update orders from their store"
ON orders FOR UPDATE
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Super admins can manage all orders"
ON orders FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'super_admin'
  )
);

-- ==============================================
-- POLÍTICAS PARA: clients
-- ==============================================
CREATE POLICY "Users can view clients from their store"
ON clients FOR SELECT
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Users can insert clients to their store"
ON clients FOR INSERT
WITH CHECK (store_id = auth.get_user_store_id());

CREATE POLICY "Users can update clients from their store"
ON clients FOR UPDATE
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Users can delete clients from their store"
ON clients FOR DELETE
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Super admins can manage all clients"
ON clients FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'super_admin'
  )
);

-- ==============================================
-- POLÍTICAS PARA: product_recipes
-- ==============================================
CREATE POLICY "Users can view recipes via products"
ON product_recipes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM products 
    WHERE products.id = product_recipes.product_id 
    AND products.store_id = auth.get_user_store_id()
  )
);

CREATE POLICY "Users can manage recipes via products"
ON product_recipes FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM products 
    WHERE products.id = product_recipes.product_id 
    AND products.store_id = auth.get_user_store_id()
  )
);

-- ==============================================
-- POLÍTICAS PARA: cafe_roles
-- ==============================================
CREATE POLICY "Users can view roles from their store"
ON cafe_roles FOR SELECT
USING (store_id = auth.get_user_store_id());

CREATE POLICY "Users can manage roles from their store"
ON cafe_roles FOR ALL
USING (store_id = auth.get_user_store_id());

-- ==============================================
-- POLÍTICAS PARA: cafe_role_permissions
-- ==============================================
CREATE POLICY "Users can view permissions via roles"
ON cafe_role_permissions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM cafe_roles 
    WHERE cafe_roles.id = cafe_role_permissions.role_id 
    AND cafe_roles.store_id = auth.get_user_store_id()
  )
);

CREATE POLICY "Users can manage permissions via roles"
ON cafe_role_permissions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM cafe_roles 
    WHERE cafe_roles.id = cafe_role_permissions.role_id 
    AND cafe_roles.store_id = auth.get_user_store_id()
  )
);

-- ==============================================
-- NOTA: Ejecutar este script en Supabase SQL Editor
-- En el Dashboard de Supabase > SQL Editor > New Query
-- Pegar y ejecutar
-- ==============================================
