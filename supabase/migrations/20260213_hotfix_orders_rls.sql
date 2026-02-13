-- ============================================
-- HOTFIX: Reemplazar RLS policy rota con versión correcta
-- ============================================
-- Migration: 20260213_hotfix_orders_rls.sql
-- Purpose: Fix broken RLS policy that returns 0 orders due to NULL subquery comparison
-- Issue: Policy from 20251230_venue_command_center.sql uses IN (subquery) which returns NULL
-- Solution: Use auth.get_user_store_id() function consistently for all policies

-- 1. Drop la policy conflictiva del 30/12/2025
DROP POLICY IF EXISTS "Users can manage orders of their store" ON public.orders;

-- 2. Crear función helper en public schema (no tenemos permisos en auth schema)
CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- 3. Re-crear policies correctas usando la función
DROP POLICY IF EXISTS "Users can view orders from their store" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders to their store" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders from their store" ON public.orders;

CREATE POLICY "Users can view orders from their store"
ON orders FOR SELECT
USING (store_id = public.get_user_store_id());

CREATE POLICY "Users can insert orders to their store"
ON orders FOR INSERT
WITH CHECK (store_id = public.get_user_store_id());

CREATE POLICY "Users can update orders from their store"
ON orders FOR UPDATE
USING (store_id = public.get_user_store_id())
WITH CHECK (store_id = public.get_user_store_id());

-- 4. Super admins policy (mantener)
DROP POLICY IF EXISTS "Super admins can manage all orders" ON public.orders;
CREATE POLICY "Super admins can manage all orders"
ON orders FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'super_admin'
  )
);

-- 5. Verificación
COMMENT ON TABLE orders IS 'RLS HOTFIX 2026-02-13: Fixed NULL comparison in subquery. Uses public.get_user_store_id() for consistency.';
