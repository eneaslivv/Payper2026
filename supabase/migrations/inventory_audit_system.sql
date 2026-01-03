-- INVENTORY AUDIT SYSTEM - Phase 1 Migration
-- Ejecutar en Supabase SQL Editor

-- 1. TABLA DE PROVEEDORES
CREATE TABLE IF NOT EXISTS public.inventory_suppliers (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name text NOT NULL,
    contact_info text,
    email text,
    phone text,
    address text,
    notes text,
    active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_store ON public.inventory_suppliers(store_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON public.inventory_suppliers(active) WHERE active = true;

ALTER TABLE public.inventory_suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View suppliers" ON public.inventory_suppliers;
CREATE POLICY "View suppliers" ON public.inventory_suppliers
    FOR SELECT USING (store_id IN (
        SELECT store_id FROM public.profiles WHERE id = auth.uid()
    ));

DROP POLICY IF EXISTS "Manage suppliers" ON public.inventory_suppliers;
CREATE POLICY "Manage suppliers" ON public.inventory_suppliers
    FOR ALL USING (store_id IN (
        SELECT store_id FROM public.profiles WHERE id = auth.uid()
    ));

-- 2. TABLA DE AUDITORIA DE INVENTARIO
CREATE TABLE IF NOT EXISTS public.inventory_audit_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    action_type text NOT NULL CHECK (action_type IN (
        'purchase', 'loss', 'adjustment', 'edit_item', 'transfer', 'recount', 'sale', 'open_package', 'use_open'
    )),
    quantity_delta numeric,
    unit text,
    package_delta integer,
    old_value jsonb,
    new_value jsonb,
    reason text NOT NULL,
    supplier_id uuid REFERENCES public.inventory_suppliers(id) ON DELETE SET NULL,
    location_from uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL,
    location_to uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL,
    order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    source_ui text CHECK (source_ui IN (
        'item_detail', 'quick_action', 'admin_panel', 'order_delivery', 'bulk_import', 'invoice_scan'
    )),
    invoice_ref text,
    unit_cost numeric,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_audit_item ON public.inventory_audit_logs(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_audit_store ON public.inventory_audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_inv_audit_created ON public.inventory_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_audit_action ON public.inventory_audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_inv_audit_user ON public.inventory_audit_logs(user_id);

ALTER TABLE public.inventory_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View inventory audit logs" ON public.inventory_audit_logs;
CREATE POLICY "View inventory audit logs" ON public.inventory_audit_logs
    FOR SELECT USING (store_id IN (
        SELECT store_id FROM public.profiles WHERE id = auth.uid()
    ));

-- 3. TABLA OPEN_PACKAGES (crear o actualizar columnas)
CREATE TABLE IF NOT EXISTS public.open_packages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    location_id uuid REFERENCES public.storage_locations(id) ON DELETE SET NULL,
    package_capacity numeric NOT NULL DEFAULT 1,
    remaining numeric NOT NULL DEFAULT 0,
    unit text NOT NULL DEFAULT 'un',
    opened_at timestamptz DEFAULT now(),
    opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    closed_at timestamptz,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Agregar columnas faltantes si la tabla ya existe
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'open_packages' AND column_name = 'is_active') THEN
        ALTER TABLE public.open_packages ADD COLUMN is_active boolean DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'open_packages' AND column_name = 'package_capacity') THEN
        ALTER TABLE public.open_packages ADD COLUMN package_capacity numeric NOT NULL DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'open_packages' AND column_name = 'remaining') THEN
        ALTER TABLE public.open_packages ADD COLUMN remaining numeric NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'open_packages' AND column_name = 'unit') THEN
        ALTER TABLE public.open_packages ADD COLUMN unit text NOT NULL DEFAULT 'un';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'open_packages' AND column_name = 'opened_at') THEN
        ALTER TABLE public.open_packages ADD COLUMN opened_at timestamptz DEFAULT now();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'open_packages' AND column_name = 'opened_by') THEN
        ALTER TABLE public.open_packages ADD COLUMN opened_by uuid;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'open_packages' AND column_name = 'closed_at') THEN
        ALTER TABLE public.open_packages ADD COLUMN closed_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'open_packages' AND column_name = 'store_id') THEN
        ALTER TABLE public.open_packages ADD COLUMN store_id uuid REFERENCES public.stores(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'open_packages' AND column_name = 'location_id') THEN
        ALTER TABLE public.open_packages ADD COLUMN location_id uuid REFERENCES public.storage_locations(id);
    END IF;
END $$;

-- Ahora crear indices (despues de asegurar que columnas existen)
CREATE INDEX IF NOT EXISTS idx_open_pkg_item ON public.open_packages(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_open_pkg_active ON public.open_packages(is_active) WHERE is_active = true;

ALTER TABLE public.open_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View open packages" ON public.open_packages;
CREATE POLICY "View open packages" ON public.open_packages
    FOR SELECT USING (store_id IN (
        SELECT store_id FROM public.profiles WHERE id = auth.uid()
    ));

DROP POLICY IF EXISTS "Manage open packages" ON public.open_packages;
CREATE POLICY "Manage open packages" ON public.open_packages
    FOR ALL USING (store_id IN (
        SELECT store_id FROM public.profiles WHERE id = auth.uid()
    ));

-- 4. COLUMNAS NUEVAS EN INVENTORY_ITEMS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'inventory_items' AND column_name = 'closed_stock') THEN
        ALTER TABLE public.inventory_items ADD COLUMN closed_stock integer DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'inventory_items' AND column_name = 'package_size') THEN
        ALTER TABLE public.inventory_items ADD COLUMN package_size numeric DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'inventory_items' AND column_name = 'content_unit') THEN
        ALTER TABLE public.inventory_items ADD COLUMN content_unit text DEFAULT 'un';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'inventory_items' AND column_name = 'min_packages') THEN
        ALTER TABLE public.inventory_items ADD COLUMN min_packages integer DEFAULT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'inventory_items' AND column_name = 'last_supplier_id') THEN
        ALTER TABLE public.inventory_items ADD COLUMN last_supplier_id uuid;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'inventory_items' AND column_name = 'last_purchase_price') THEN
        ALTER TABLE public.inventory_items ADD COLUMN last_purchase_price numeric;
    END IF;
END $$;

-- 5. COLUMNAS NUEVAS EN STOCK_TRANSFERS
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_transfers' AND column_name = 'supplier_id') THEN
        ALTER TABLE public.stock_transfers ADD COLUMN supplier_id uuid;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_transfers' AND column_name = 'invoice_ref') THEN
        ALTER TABLE public.stock_transfers ADD COLUMN invoice_ref text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_transfers' AND column_name = 'unit_cost') THEN
        ALTER TABLE public.stock_transfers ADD COLUMN unit_cost numeric;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_transfers' AND column_name = 'movement_type') THEN
        ALTER TABLE public.stock_transfers ADD COLUMN movement_type text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'stock_transfers' AND column_name = 'reason') THEN
        ALTER TABLE public.stock_transfers ADD COLUMN reason text;
    END IF;
END $$;

-- 6. FUNCION GET_EFFECTIVE_STOCK
CREATE OR REPLACE FUNCTION public.get_effective_stock(p_item_id uuid)
RETURNS TABLE (
    closed_packages integer,
    open_packages_count integer,
    open_packages_percentage numeric,
    effective_stock numeric,
    unit text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_closed integer;
    v_package_size numeric;
    v_content_unit text;
    v_open_count integer;
    v_open_remaining numeric;
BEGIN
    SELECT COALESCE(ii.closed_stock, 0), COALESCE(ii.package_size, 1), COALESCE(ii.content_unit, 'un')
    INTO v_closed, v_package_size, v_content_unit
    FROM public.inventory_items ii WHERE ii.id = p_item_id;

    SELECT COUNT(*)::integer, COALESCE(SUM(op.remaining), 0)
    INTO v_open_count, v_open_remaining
    FROM public.open_packages op
    WHERE op.inventory_item_id = p_item_id AND op.is_active = true;

    RETURN QUERY SELECT
        v_closed as closed_packages,
        v_open_count as open_packages_count,
        CASE WHEN v_open_count > 0 AND v_package_size > 0 THEN ROUND((v_open_remaining / v_package_size) * 100, 1) ELSE 0 END as open_packages_percentage,
        v_closed + CASE WHEN v_package_size > 0 THEN (v_open_remaining / v_package_size) ELSE 0 END as effective_stock,
        v_content_unit as unit;
END;
$$;

-- 7. FUNCION LOG_INVENTORY_ACTION
CREATE OR REPLACE FUNCTION public.log_inventory_action(
    p_item_id uuid,
    p_action_type text,
    p_quantity_delta numeric DEFAULT NULL,
    p_package_delta integer DEFAULT NULL,
    p_reason text DEFAULT 'Sin motivo especificado',
    p_supplier_id uuid DEFAULT NULL,
    p_location_from uuid DEFAULT NULL,
    p_location_to uuid DEFAULT NULL,
    p_order_id uuid DEFAULT NULL,
    p_source_ui text DEFAULT 'quick_action',
    p_old_value jsonb DEFAULT NULL,
    p_new_value jsonb DEFAULT NULL,
    p_invoice_ref text DEFAULT NULL,
    p_unit_cost numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_store_id uuid;
    v_user_id uuid;
    v_unit text;
    v_log_id uuid;
BEGIN
    SELECT store_id, unit_type INTO v_store_id, v_unit FROM public.inventory_items WHERE id = p_item_id;
    IF v_store_id IS NULL THEN RAISE EXCEPTION 'Item not found: %', p_item_id; END IF;
    v_user_id := auth.uid();
    INSERT INTO public.inventory_audit_logs (
        item_id, store_id, action_type, quantity_delta, package_delta, unit, old_value, new_value,
        reason, supplier_id, location_from, location_to, order_id, user_id, source_ui, invoice_ref, unit_cost
    ) VALUES (
        p_item_id, v_store_id, p_action_type, p_quantity_delta, p_package_delta, v_unit, p_old_value, p_new_value,
        COALESCE(p_reason, 'Sin motivo especificado'), p_supplier_id, p_location_from, p_location_to, p_order_id, v_user_id, p_source_ui, p_invoice_ref, p_unit_cost
    ) RETURNING id INTO v_log_id;
    IF p_action_type = 'purchase' AND p_supplier_id IS NOT NULL THEN
        UPDATE public.inventory_items SET last_supplier_id = p_supplier_id, last_purchase_price = p_unit_cost WHERE id = p_item_id;
    END IF;
    RETURN v_log_id;
END;
$$;

-- 8. FUNCION REGISTER_PURCHASE
CREATE OR REPLACE FUNCTION public.register_purchase(
    p_item_id uuid,
    p_packages integer,
    p_unit_cost numeric,
    p_supplier_id uuid,
    p_location_id uuid,
    p_invoice_ref text DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_package_size numeric;
    v_total_quantity numeric;
    v_log_id uuid;
BEGIN
    SELECT package_size INTO v_package_size FROM public.inventory_items WHERE id = p_item_id;
    v_total_quantity := p_packages * COALESCE(v_package_size, 1);
    UPDATE public.inventory_items
    SET closed_stock = COALESCE(closed_stock, 0) + p_packages,
        current_stock = COALESCE(current_stock, 0) + v_total_quantity,
        cost = p_unit_cost, last_supplier_id = p_supplier_id, last_purchase_price = p_unit_cost, updated_at = now()
    WHERE id = p_item_id;
    INSERT INTO public.item_stock_levels (inventory_item_id, location_id, quantity)
    VALUES (p_item_id, p_location_id, v_total_quantity)
    ON CONFLICT (inventory_item_id, location_id) DO UPDATE SET quantity = item_stock_levels.quantity + v_total_quantity, updated_at = now();
    v_log_id := public.log_inventory_action(
        p_item_id := p_item_id, p_action_type := 'purchase', p_quantity_delta := v_total_quantity, p_package_delta := p_packages,
        p_reason := COALESCE(p_notes, 'Compra de stock'), p_supplier_id := p_supplier_id, p_location_to := p_location_id,
        p_source_ui := 'quick_action', p_invoice_ref := p_invoice_ref, p_unit_cost := p_unit_cost
    );
    RETURN json_build_object('success', true, 'packages_added', p_packages, 'quantity_added', v_total_quantity, 'audit_log_id', v_log_id);
END;
$$;

-- 9. FUNCION REGISTER_LOSS
CREATE OR REPLACE FUNCTION public.register_loss(
    p_item_id uuid,
    p_quantity numeric,
    p_reason text,
    p_location_id uuid,
    p_from_open_package uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_log_id uuid;
    v_package_size numeric;
    v_packages_lost integer := 0;
BEGIN
    IF p_reason IS NULL OR p_reason = '' THEN RAISE EXCEPTION 'Motivo obligatorio para registrar perdida'; END IF;
    SELECT package_size INTO v_package_size FROM public.inventory_items WHERE id = p_item_id;
    IF p_from_open_package IS NOT NULL THEN
        UPDATE public.open_packages
        SET remaining = remaining - p_quantity,
            is_active = CASE WHEN remaining - p_quantity <= 0 THEN false ELSE true END,
            closed_at = CASE WHEN remaining - p_quantity <= 0 THEN now() ELSE NULL END
        WHERE id = p_from_open_package;
    ELSE
        v_packages_lost := CEIL(p_quantity / COALESCE(v_package_size, 1))::integer;
        UPDATE public.inventory_items
        SET closed_stock = GREATEST(0, COALESCE(closed_stock, 0) - v_packages_lost),
            current_stock = GREATEST(0, COALESCE(current_stock, 0) - p_quantity), updated_at = now()
        WHERE id = p_item_id;
    END IF;
    UPDATE public.item_stock_levels SET quantity = GREATEST(0, quantity - p_quantity), updated_at = now()
    WHERE inventory_item_id = p_item_id AND location_id = p_location_id;
    v_log_id := public.log_inventory_action(
        p_item_id := p_item_id, p_action_type := 'loss', p_quantity_delta := -p_quantity, p_package_delta := -v_packages_lost,
        p_reason := p_reason, p_location_from := p_location_id, p_source_ui := 'quick_action'
    );
    RETURN json_build_object('success', true, 'quantity_lost', p_quantity, 'audit_log_id', v_log_id);
END;
$$;

-- 10. FUNCION OPEN_PACKAGE
CREATE OR REPLACE FUNCTION public.open_package(
    p_item_id uuid,
    p_location_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_package_size numeric;
    v_content_unit text;
    v_store_id uuid;
    v_user_id uuid;
    v_package_id uuid;
    v_log_id uuid;
BEGIN
    SELECT package_size, content_unit, store_id INTO v_package_size, v_content_unit, v_store_id
    FROM public.inventory_items WHERE id = p_item_id;
    IF v_package_size IS NULL THEN RAISE EXCEPTION 'Item no encontrado o sin tamano de envase configurado'; END IF;
    v_user_id := auth.uid();
    UPDATE public.inventory_items SET closed_stock = GREATEST(0, COALESCE(closed_stock, 0) - 1), updated_at = now()
    WHERE id = p_item_id AND closed_stock > 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'No hay envases cerrados disponibles para abrir'; END IF;
    INSERT INTO public.open_packages (inventory_item_id, store_id, location_id, package_capacity, remaining, unit, opened_by)
    VALUES (p_item_id, v_store_id, p_location_id, v_package_size, v_package_size, v_content_unit, v_user_id)
    RETURNING id INTO v_package_id;
    v_log_id := public.log_inventory_action(
        p_item_id := p_item_id, p_action_type := 'open_package', p_package_delta := -1,
        p_reason := 'Apertura de envase nuevo', p_location_from := p_location_id, p_source_ui := 'item_detail',
        p_new_value := json_build_object('open_package_id', v_package_id, 'capacity', v_package_size)::jsonb
    );
    RETURN json_build_object('success', true, 'package_id', v_package_id, 'capacity', v_package_size, 'unit', v_content_unit, 'audit_log_id', v_log_id);
END;
$$;

-- Verificacion: SELECT * FROM public.inventory_suppliers LIMIT 5;
