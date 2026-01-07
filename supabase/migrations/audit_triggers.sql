-- SISTEMA DE AUDITORÍA - TRIGGERS AUTOMÁTICOS
-- Ejecutar en Supabase SQL Editor

-- 1. CREAR TABLA audit_logs (si no existe)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    store_id UUID REFERENCES stores(id),
    user_id UUID,
    table_name TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_store_id ON audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_name ON audit_logs(table_name);

-- RLS para audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select_policy" ON audit_logs;
CREATE POLICY "audit_logs_select_policy" ON audit_logs
    FOR SELECT USING (
        store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid())
    );

-- 2. FUNCIÓN GENÉRICA DE AUDITORÍA
CREATE OR REPLACE FUNCTION log_audit_change()
RETURNS TRIGGER AS $$
DECLARE
    v_store_id UUID;
    v_user_id UUID;
    v_old_data JSONB;
    v_new_data JSONB;
BEGIN
    v_user_id := auth.uid();
    
    IF TG_OP = 'DELETE' THEN
        v_store_id := OLD.store_id;
        v_old_data := to_jsonb(OLD);
        v_new_data := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_store_id := NEW.store_id;
        v_old_data := NULL;
        v_new_data := to_jsonb(NEW);
    ELSE
        v_store_id := COALESCE(NEW.store_id, OLD.store_id);
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
    END IF;
    
    INSERT INTO audit_logs (store_id, user_id, table_name, operation, old_data, new_data)
    VALUES (v_store_id, v_user_id, TG_TABLE_NAME, TG_OP, v_old_data, v_new_data);
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. CREAR TRIGGERS PARA CADA TABLA

DROP TRIGGER IF EXISTS audit_products_trigger ON products;
CREATE TRIGGER audit_products_trigger
    AFTER INSERT OR UPDATE OR DELETE ON products
    FOR EACH ROW EXECUTE FUNCTION log_audit_change();

DROP TRIGGER IF EXISTS audit_inventory_items_trigger ON inventory_items;
CREATE TRIGGER audit_inventory_items_trigger
    AFTER INSERT OR UPDATE OR DELETE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION log_audit_change();

DROP TRIGGER IF EXISTS audit_product_recipes_trigger ON product_recipes;
CREATE TRIGGER audit_product_recipes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON product_recipes
    FOR EACH ROW EXECUTE FUNCTION log_audit_change();

DROP TRIGGER IF EXISTS audit_orders_trigger ON orders;
CREATE TRIGGER audit_orders_trigger
    AFTER INSERT OR UPDATE OR DELETE ON orders
    FOR EACH ROW EXECUTE FUNCTION log_audit_change();

DROP TRIGGER IF EXISTS audit_profiles_trigger ON profiles;
CREATE TRIGGER audit_profiles_trigger
    AFTER INSERT OR UPDATE OR DELETE ON profiles
    FOR EACH ROW EXECUTE FUNCTION log_audit_change();

DROP TRIGGER IF EXISTS audit_stores_trigger ON stores;
CREATE TRIGGER audit_stores_trigger
    AFTER INSERT OR UPDATE OR DELETE ON stores
    FOR EACH ROW EXECUTE FUNCTION log_audit_change();

DROP TRIGGER IF EXISTS audit_stock_movements_trigger ON stock_movements;
CREATE TRIGGER audit_stock_movements_trigger
    AFTER INSERT OR UPDATE OR DELETE ON stock_movements
    FOR EACH ROW EXECUTE FUNCTION log_audit_change();
