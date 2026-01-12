-- Fix transfer_stock function - ensure correct 8-parameter version exists
-- This drops the old 6-param version and creates the proper 8-param version

-- Drop the old 6-param version
DROP FUNCTION IF EXISTS public.transfer_stock(uuid, uuid, uuid, numeric, uuid, text);

-- Create the correct version with p_movement_type and p_reason
CREATE OR REPLACE FUNCTION public.transfer_stock(
    p_item_id uuid,
    p_from_location_id uuid,
    p_to_location_id uuid,
    p_quantity numeric,
    p_user_id uuid,
    p_notes text,
    p_movement_type text DEFAULT 'transfer'::text,
    p_reason text DEFAULT 'Transferencia entre ubicaciones'::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_item_package_size numeric;
    v_store_id uuid;
    v_log_id uuid;
    v_from_stock record;
    v_package_delta integer;
BEGIN
    -- VALIDATE
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
    END IF;

    IF p_from_location_id IS NOT NULL AND p_from_location_id = p_to_location_id THEN
        RAISE EXCEPTION 'Origen y destino no pueden ser iguales';
    END IF;

    -- Get Item Info
    SELECT COALESCE(package_size, 1), store_id 
    INTO v_item_package_size, v_store_id
    FROM public.inventory_items 
    WHERE id = p_item_id;

    IF v_store_id IS NULL THEN 
        RAISE EXCEPTION 'Item no encontrado'; 
    END IF;

    -- Calculate package delta (quantity is in base units, convert to packages)
    v_package_delta := CEIL(p_quantity / v_item_package_size)::integer;
    IF v_package_delta < 1 THEN v_package_delta := 1; END IF;

    -- 1. DECREMENT ORIGIN
    IF p_from_location_id IS NOT NULL THEN
        SELECT * INTO v_from_stock FROM public.inventory_location_stock
        WHERE location_id = p_from_location_id AND item_id = p_item_id;
        
        IF v_from_stock IS NULL OR v_from_stock.closed_units < v_package_delta THEN
            RAISE EXCEPTION 'Stock insuficiente en origen. Disponible: % unidades', COALESCE(v_from_stock.closed_units, 0);
        END IF;
        
        UPDATE public.inventory_location_stock
        SET closed_units = closed_units - v_package_delta, updated_at = now()
        WHERE location_id = p_from_location_id AND item_id = p_item_id;
    END IF;
    
    -- 2. INCREMENT DESTINATION
    IF p_to_location_id IS NOT NULL THEN
        INSERT INTO public.inventory_location_stock (store_id, item_id, location_id, closed_units)
        VALUES (v_store_id, p_item_id, p_to_location_id, v_package_delta)
        ON CONFLICT (store_id, item_id, location_id)
        DO UPDATE SET closed_units = inventory_location_stock.closed_units + v_package_delta, updated_at = now();
    END IF;
    
    -- 3. AUDIT LOG
    v_log_id := public.log_inventory_action(
        p_item_id := p_item_id,
        p_action_type := LOWER(COALESCE(p_movement_type, 'transfer')),
        p_quantity_delta := p_quantity,
        p_package_delta := v_package_delta,
        p_reason := COALESCE(p_reason, 'Transferencia') || (CASE WHEN p_notes <> '' THEN ': ' || p_notes ELSE '' END),
        p_location_from := p_from_location_id,
        p_location_to := p_to_location_id,
        p_source_ui := 'stock_transfer_modal'
    );
    
    RETURN json_build_object(
        'success', true,
        'quantity_moved', p_quantity,
        'packages_moved', v_package_delta,
        'from_location', p_from_location_id,
        'to_location', p_to_location_id,
        'audit_log_id', v_log_id
    );
END;
$function$;
