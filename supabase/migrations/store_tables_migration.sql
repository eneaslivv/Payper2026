-- ==============================================
-- MIGRACIÓN: store_tables
-- Gestión de Mesas y Puntos QR por Tienda
-- CoffeeSaaS Multi-Tenant
-- ==============================================

-- 1. Función Helper para Seguridad (si no existe)
CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER;

-- 2. Tabla store_tables
CREATE TABLE IF NOT EXISTS public.store_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    label TEXT NOT NULL, -- Ej: "Mesa 1", "Barra A", "Terraza 4"
    qr_code_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_store_tables_store_id ON store_tables(store_id);
CREATE INDEX IF NOT EXISTS idx_store_tables_active ON store_tables(store_id, is_active);

-- 4. Trigger para updated_at automático
CREATE OR REPLACE FUNCTION update_store_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_store_tables_updated_at ON store_tables;
CREATE TRIGGER trigger_store_tables_updated_at
BEFORE UPDATE ON store_tables
FOR EACH ROW EXECUTE FUNCTION update_store_tables_updated_at();

-- 5. Habilitar RLS (Row Level Security)
ALTER TABLE store_tables ENABLE ROW LEVEL SECURITY;

-- 6. Política de aislamiento por tenant
DROP POLICY IF EXISTS "Tenant Isolation: All Actions" ON store_tables;
CREATE POLICY "Tenant Isolation: All Actions" ON store_tables
FOR ALL USING (store_id = public.get_user_store_id());

-- ==============================================
-- EJECUTAR EN: Supabase Dashboard > SQL Editor
-- ==============================================
