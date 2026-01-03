-- INVENTORY LOCATIONS SYSTEM - Phase 2 Migration
-- Stock por Ubicación + Transferencias + Auditoría

-- 1. MODIFICAR storage_locations
DO $$
BEGIN
    -- Agregar location_type si no existe (renombrar 'type' si es necesario usar este)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'storage_locations' AND column_name = 'location_type') THEN
        ALTER TABLE public.storage_locations ADD COLUMN location_type text DEFAULT 'storage' CHECK (location_type IN ('base', 'bar', 'kitchen', 'storage', 'custom'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'storage_locations' AND column_name = 'is_deletable') THEN
        ALTER TABLE public.storage_locations ADD COLUMN is_deletable boolean DEFAULT true;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'storage_locations' AND column_name = 'bar_id') THEN
        ALTER TABLE public.storage_locations ADD COLUMN bar_id uuid;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'storage_locations' AND column_name = 'is_consumable') THEN
        ALTER TABLE public.storage_locations ADD COLUMN is_consumable boolean DEFAULT false;
    END IF;
END $$;

-- 2. CREAR TABLA inventory_location_stock
CREATE TABLE IF NOT EXISTS public.inventory_location_stock (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
    location_id uuid NOT NULL REFERENCES public.storage_locations(id) ON DELETE CASCADE,
    closed_units integer DEFAULT 0,
    open_packages jsonb DEFAULT '[]',
    updated_at timestamptz DEFAULT now(),
    UNIQUE(store_id, item_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_loc_stock_item ON public.inventory_location_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_loc_stock_location ON public.inventory_location_stock(location_id);
CREATE INDEX IF NOT EXISTS idx_loc_stock_store ON public.inventory_location_stock(store_id);

ALTER TABLE public.inventory_location_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View location stock" ON public.inventory_location_stock;
CREATE POLICY "View location stock" ON public.inventory_location_stock
    FOR SELECT USING (store_id IN (SELECT store_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Manage location stock" ON public.inventory_location_stock;
CREATE POLICY "Manage location stock" ON public.inventory_location_stock
    FOR ALL USING (store_id IN (SELECT store_id FROM public.profiles WHERE id = auth.uid()));

-- 3. FUNCION: create_default_location
CREATE OR REPLACE FUNCTION public.create_default_location(p_store_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_location_id uuid;
BEGIN
    SELECT id INTO v_location_id FROM public.storage_locations 
    WHERE store_id = p_store_id AND is_default = true LIMIT 1;
    
    IF v_location_id IS NULL THEN
        INSERT INTO public.storage_locations (store_id, name, type, location_type, is_default, is_deletable, is_consumable)
        VALUES (p_store_id, 'Almacenamiento General', 'warehouse', 'base', true, false, false)
        RETURNING id INTO v_location_id;
    END IF;
    
    RETURN v_location_id;
END;
$$;

-- 4. FUNCION: get_location_stock
CREATE OR REPLACE FUNCTION public.get_location_stock(p_location_id uuid)
RETURNS TABLE (
    total_items integer,
    total_closed_units integer,
    total_open_packages integer,
    total_effective_stock numeric,
    estimated_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT ls.item_id)::integer as total_items,
        COALESCE(SUM(ls.closed_units), 0)::integer as total_closed_units,
        COALESCE(SUM(jsonb_array_length(ls.open_packages)), 0)::integer as total_open_packages,
        COALESCE(SUM(
            ls.closed_units * COALESCE(ii.package_size, 1) +
            (SELECT COALESCE(SUM((pkg->>'remaining')::numeric), 0) FROM jsonb_array_elements(ls.open_packages) pkg)
        ), 0)::numeric as total_effective_stock,
        COALESCE(SUM(
            (ls.closed_units * COALESCE(ii.package_size, 1) +
             (SELECT COALESCE(SUM((pkg->>'remaining')::numeric), 0) FROM jsonb_array_elements(ls.open_packages) pkg)
            ) * COALESCE(ii.cost, 0)
        ), 0)::numeric as estimated_value
    FROM public.inventory_location_stock ls
    JOIN public.inventory_items ii ON ii.id = ls.item_id
    WHERE ls.location_id = p_location_id;
END;
$$;

-- 5. FUNCION: transfer_stock
CREATE OR REPLACE FUNCTION public.transfer_stock(
    p_from_location uuid,
    p_to_location uuid,
    p_item_id uuid,
    p_quantity integer,
    p_reason text,
    p_source_ui text DEFAULT 'locations'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_from_stock record;
    v_store_id uuid;
    v_user_id uuid;
    v_log_id uuid;
    v_item_package_size numeric;
BEGIN
    IF p_reason IS NULL OR p_reason = '' THEN
        RAISE EXCEPTION 'Motivo obligatorio para transferencia';
    END IF;
    
    IF p_from_location = p_to_location THEN
        RAISE EXCEPTION 'Origen y destino no pueden ser iguales';
    END IF;
    
    v_user_id := auth.uid();
    
    SELECT store_id, package_size INTO v_store_id, v_item_package_size
    FROM public.inventory_items WHERE id = p_item_id;
    
    SELECT * INTO v_from_stock FROM public.inventory_location_stock
    WHERE location_id = p_from_location AND item_id = p_item_id;
    
    IF v_from_stock IS NULL OR v_from_stock.closed_units < p_quantity THEN
        RAISE EXCEPTION 'Stock insuficiente en origen. Disponible: %', COALESCE(v_from_stock.closed_units, 0);
    END IF;
    
    UPDATE public.inventory_location_stock
    SET closed_units = closed_units - p_quantity, updated_at = now()
    WHERE location_id = p_from_location AND item_id = p_item_id;
    
    INSERT INTO public.inventory_location_stock (store_id, item_id, location_id, closed_units)
    VALUES (v_store_id, p_item_id, p_to_location, p_quantity)
    ON CONFLICT (store_id, item_id, location_id)
    DO UPDATE SET closed_units = inventory_location_stock.closed_units + p_quantity, updated_at = now();
    
    v_log_id := public.log_inventory_action(
        p_item_id := p_item_id,
        p_action_type := 'transfer',
        p_quantity_delta := p_quantity * COALESCE(v_item_package_size, 1),
        p_package_delta := p_quantity,
        p_reason := p_reason,
        p_location_from := p_from_location,
        p_location_to := p_to_location,
        p_source_ui := p_source_ui
    );
    
    RETURN json_build_object(
        'success', true,
        'transferred_units', p_quantity,
        'from_location', p_from_location,
        'to_location', p_to_location,
        'audit_log_id', v_log_id
    );
END;
$$;

-- 6. FUNCION: sync_bar_location (para futuro uso con barras)
CREATE OR REPLACE FUNCTION public.sync_bar_location(p_bar_id uuid, p_bar_name text, p_store_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_location_id uuid;
BEGIN
    SELECT id INTO v_location_id FROM public.storage_locations
    WHERE bar_id = p_bar_id LIMIT 1;
    
    IF v_location_id IS NULL THEN
        INSERT INTO public.storage_locations (store_id, name, type, location_type, is_default, is_deletable, bar_id, is_consumable)
        VALUES (p_store_id, 'Barra: ' || p_bar_name, 'bar', 'bar', false, true, p_bar_id, true)
        RETURNING id INTO v_location_id;
    END IF;
    
    RETURN v_location_id;
END;
$$;

-- 7. FUNCION: get_item_stock_by_locations (ver stock de un item en todas las ubicaciones)
CREATE OR REPLACE FUNCTION public.get_item_stock_by_locations(p_item_id uuid)
RETURNS TABLE (
    location_id uuid,
    location_name text,
    location_type text,
    closed_units integer,
    open_packages_count integer,
    effective_stock numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT
        sl.id as location_id,
        sl.name as location_name,
        COALESCE(sl.location_type, sl.type) as location_type,
        COALESCE(ls.closed_units, 0) as closed_units,
        COALESCE(jsonb_array_length(ls.open_packages), 0)::integer as open_packages_count,
        COALESCE(
            ls.closed_units * COALESCE(ii.package_size, 1) +
            (SELECT COALESCE(SUM((pkg->>'remaining')::numeric), 0) FROM jsonb_array_elements(ls.open_packages) pkg),
            0
        )::numeric as effective_stock
    FROM public.inventory_location_stock ls
    JOIN public.storage_locations sl ON sl.id = ls.location_id
    JOIN public.inventory_items ii ON ii.id = ls.item_id
    WHERE ls.item_id = p_item_id;
END;
$$;

-- 8. CREAR UBICACION BASE PARA STORES EXISTENTES
DO $$
DECLARE
    r record;
    v_loc_id uuid;
BEGIN
    FOR r IN SELECT DISTINCT store_id FROM public.inventory_items LOOP
        v_loc_id := public.create_default_location(r.store_id);
        RAISE NOTICE 'Created/verified default location % for store %', v_loc_id, r.store_id;
    END LOOP;
END $$;

-- 9. MIGRAR STOCK EXISTENTE A UBICACION BASE
DO $$
DECLARE
    r record;
    v_default_loc uuid;
BEGIN
    FOR r IN 
        SELECT ii.id as item_id, ii.store_id, 
               COALESCE(ii.closed_stock, FLOOR(ii.current_stock))::integer as closed_units
        FROM public.inventory_items ii
        WHERE ii.current_stock > 0 OR ii.closed_stock > 0
    LOOP
        SELECT id INTO v_default_loc FROM public.storage_locations
        WHERE store_id = r.store_id AND is_default = true LIMIT 1;
        
        IF v_default_loc IS NOT NULL THEN
            INSERT INTO public.inventory_location_stock (store_id, item_id, location_id, closed_units)
            VALUES (r.store_id, r.item_id, v_default_loc, r.closed_units)
            ON CONFLICT (store_id, item_id, location_id) DO UPDATE 
            SET closed_units = inventory_location_stock.closed_units + EXCLUDED.closed_units;
        END IF;
    END LOOP;
END $$;

-- Verificacion
SELECT 'Ubicaciones creadas:', COUNT(*) FROM public.storage_locations WHERE is_default = true;
SELECT 'Stock migrado:', COUNT(*) FROM public.inventory_location_stock;
