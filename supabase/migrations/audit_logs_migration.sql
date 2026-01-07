-- =====================================================
-- AUDIT LOG SYSTEM - CoffeeSquad
-- Ejecutar en Supabase SQL Editor
-- =====================================================

-- 1. CREAR TABLA audit_logs
-- =====================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    table_name text NOT NULL,
    operation text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data jsonb,
    new_data jsonb
);

-- Índices para optimizar consultas
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_id ON public.audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON public.audit_logs(table_name);

-- Comentario de documentación
COMMENT ON TABLE public.audit_logs IS 'Registro inmutable de cambios en tablas críticas del sistema';

-- 2. HABILITAR RLS
-- =====================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. POLÍTICAS RLS
-- =====================================================

-- Política SELECT: Solo owner o admin de la tienda pueden leer los logs
CREATE POLICY "audit_logs_select_policy" ON public.audit_logs
    FOR SELECT
    USING (
        -- Permitir si el usuario es owner de la tienda
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.store_id = audit_logs.store_id
            AND (p.role = 'store_owner' OR p.role = 'super_admin')
        )
        OR
        -- Permitir si el usuario tiene rol admin en la tienda
        EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.cafe_roles cr ON cr.id = p.role_id
            WHERE p.id = auth.uid()
            AND p.store_id = audit_logs.store_id
            AND (cr.name ILIKE '%admin%' OR cr.name ILIKE '%owner%')
        )
        OR
        -- Super admin puede ver todo
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
            AND p.role = 'super_admin'
        )
    );

-- Política INSERT: Solo via trigger (service role internamente)
-- Los triggers se ejecutan con SECURITY DEFINER, bypasando RLS
-- No creamos política INSERT para usuarios normales

-- Política DELETE: BLOQUEADA para todos (inmutabilidad)
-- No se crea política DELETE = nadie puede borrar

-- Política UPDATE: BLOQUEADA para todos (inmutabilidad)
-- No se crea política UPDATE = nadie puede modificar

-- 4. FUNCIÓN TRIGGER handle_audit_log()
-- =====================================================
CREATE OR REPLACE FUNCTION public.handle_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER  -- Ejecutar con privilegios del owner para bypassear RLS
SET search_path = public
AS $$
DECLARE
    v_store_id uuid;
    v_user_id uuid;
    v_old_data jsonb;
    v_new_data jsonb;
BEGIN
    -- Capturar el user_id del contexto de autenticación
    v_user_id := auth.uid();
    
    -- Determinar store_id según la tabla
    -- Intentamos extraerlo del registro afectado
    IF TG_OP = 'DELETE' THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := NULL;
        
        -- Intentar obtener store_id del registro OLD
        IF OLD ? 'store_id' THEN
            v_store_id := (OLD::jsonb->>'store_id')::uuid;
        ELSIF TG_TABLE_NAME = 'stores' THEN
            v_store_id := OLD.id;
        ELSIF TG_TABLE_NAME = 'profiles' THEN
            v_store_id := OLD.store_id;
        END IF;
        
    ELSIF TG_OP = 'INSERT' THEN
        v_old_data := NULL;
        v_new_data := to_jsonb(NEW);
        
        -- Intentar obtener store_id del registro NEW
        IF NEW ? 'store_id' THEN
            v_store_id := (NEW::jsonb->>'store_id')::uuid;
        ELSIF TG_TABLE_NAME = 'stores' THEN
            v_store_id := NEW.id;
        ELSIF TG_TABLE_NAME = 'profiles' THEN
            v_store_id := NEW.store_id;
        END IF;
        
    ELSIF TG_OP = 'UPDATE' THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
        
        -- Intentar obtener store_id del registro NEW
        IF NEW ? 'store_id' THEN
            v_store_id := (NEW::jsonb->>'store_id')::uuid;
        ELSIF TG_TABLE_NAME = 'stores' THEN
            v_store_id := NEW.id;
        ELSIF TG_TABLE_NAME = 'profiles' THEN
            v_store_id := NEW.store_id;
        END IF;
    END IF;
    
    -- Insertar el registro de auditoría
    INSERT INTO public.audit_logs (
        store_id,
        user_id,
        table_name,
        operation,
        old_data,
        new_data
    ) VALUES (
        v_store_id,
        v_user_id,
        TG_TABLE_NAME,
        TG_OP,
        v_old_data,
        v_new_data
    );
    
    -- Retornar el registro apropiado
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- 5. APLICAR TRIGGERS A TABLAS CRÍTICAS
-- =====================================================

-- Trigger en products
DROP TRIGGER IF EXISTS audit_products_trigger ON public.products;
CREATE TRIGGER audit_products_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_log();

-- Trigger en inventory_items
DROP TRIGGER IF EXISTS audit_inventory_items_trigger ON public.inventory_items;
CREATE TRIGGER audit_inventory_items_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.inventory_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_log();

-- Trigger en stores
DROP TRIGGER IF EXISTS audit_stores_trigger ON public.stores;
CREATE TRIGGER audit_stores_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.stores
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_log();

-- Trigger en orders
DROP TRIGGER IF EXISTS audit_orders_trigger ON public.orders;
CREATE TRIGGER audit_orders_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_log();

-- Trigger en profiles
DROP TRIGGER IF EXISTS audit_profiles_trigger ON public.profiles;
CREATE TRIGGER audit_profiles_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_log();

-- Trigger en product_recipes
DROP TRIGGER IF EXISTS audit_product_recipes_trigger ON public.product_recipes;
CREATE TRIGGER audit_product_recipes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.product_recipes
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_audit_log();

-- 6. VERIFICACIÓN
-- =====================================================
-- Ejecutar después de la migración para verificar:
-- SELECT * FROM public.audit_logs ORDER BY created_at DESC LIMIT 10;
