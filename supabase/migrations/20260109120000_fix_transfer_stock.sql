CREATE OR REPLACE FUNCTION public.transfer_stock(
    p_item_id uuid,
    p_from_location_id uuid,
    p_to_location_id uuid,
    p_quantity numeric,
    p_user_id uuid,
    p_notes text,
    p_movement_type text DEFAULT 'adjustment'::text,
    p_reason text DEFAULT 'Manual adjustment'::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_item_package_size numeric;
    v_store_id uuid;
    v_log_id uuid;
    
    -- Variables for Source Logic
    v_src_closed integer;
    v_src_open_arr jsonb;
    v_src_open_sum numeric;
    v_src_total_avail numeric;
    v_src_new_total numeric;
    v_src_new_closed integer;
    v_src_new_remainder numeric;
    v_src_new_open_arr jsonb;
    
    -- Variables for Dest Logic
    v_dest_closed integer;
    v_dest_open_arr jsonb;
    v_dest_open_sum numeric;
    v_dest_total_current numeric;
    v_dest_new_total numeric;
    v_dest_new_closed integer;
    v_dest_new_remainder numeric;
    v_dest_new_open_arr jsonb;

BEGIN
    -- 0. VALIDATE & SETUP
    IF p_quantity <= 0 THEN
        RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
    END IF;

    -- Get Item Info (Package Size & Store ID)
    SELECT 
        COALESCE(package_size, 1), 
        store_id 
    INTO v_item_package_size, v_store_id
    FROM public.inventory_items 
    WHERE id = p_item_id;

    IF v_item_package_size <= 0 THEN v_item_package_size := 1; END IF;
    IF v_store_id IS NULL THEN RAISE EXCEPTION 'Item/Store not found'; END IF;

    -- 1. HANDLE SOURCE (Deduct)
    IF p_from_location_id IS NOT NULL THEN
        -- Fetch current state using Lock for safety
        SELECT 
            COALESCE(closed_units, 0),
            COALESCE(open_packages, '[]'::jsonb)
        INTO v_src_closed, v_src_open_arr
        FROM public.inventory_location_stock
        WHERE location_id = p_from_location_id AND item_id = p_item_id
        FOR UPDATE; -- Lock row

        -- Calculate Open Sum
        SELECT COALESCE(SUM((qty->>'remaining')::numeric), 0)
        INTO v_src_open_sum
        FROM jsonb_array_elements(COALESCE(v_src_open_arr, '[]'::jsonb)) qty;

        -- Total Available in Base Units (e.g. Kg)
        v_src_total_avail := (v_src_closed * v_item_package_size) + v_src_open_sum;

        -- Check Sufficiency
        -- p_quantity here is interpreted as BASE UNITS because of the logic fix
        -- NOTE: Ensure p_quantity passed from Frontend is indeed Base Units.
        -- Based on analysis: User enters "1" for 1KG. Unit type is KG.
        -- So p_quantity is Base Units.
        
        IF v_src_total_avail < p_quantity THEN
             RAISE EXCEPTION 'Stock insuficiente en origen. Disponible: %', v_src_total_avail;
        END IF;

        -- Calculate New Total
        v_src_new_total := v_src_total_avail - p_quantity;

        -- DEFRAG: Redistribution
        v_src_new_closed := FLOOR(v_src_new_total / v_item_package_size);
        v_src_new_remainder := v_src_new_total - (v_src_new_closed * v_item_package_size);
        
        -- Build New Open Array (Consolidated)
        IF v_src_new_remainder > 0.0001 THEN -- Epsilon for float math
             v_src_new_open_arr := jsonb_build_array(
                 jsonb_build_object(
                     'remaining', v_src_new_remainder, 
                     'opened_at', now()
                 )
             );
        ELSE
             v_src_new_open_arr := '[]'::jsonb;
        END IF;

        -- Update Source Row
        UPDATE public.inventory_location_stock
        SET 
            closed_units = v_src_new_closed,
            open_packages = v_src_new_open_arr,
            updated_at = now()
        WHERE location_id = p_from_location_id AND item_id = p_item_id;
        
        -- Note: If row didn't exist, we raised exception earlier (v_src_total_avail would be 0 or null logic would act).
        -- Actually, SELECT INTO would set vars to null?
        -- COALESCE handled it. 0 stock. Exception raised.
    END IF;

    -- 2. HANDLE DESTINATION (Add)
    IF p_to_location_id IS NOT NULL THEN
        -- Fetch current or default 0
        -- We use ON CONFLICT usually, but for complex calculation we need current.
        -- We try to Insert first if not exists?
        -- Or just Upsert logic?
        -- Better: Lock row if exists, else assume 0.
        
        SELECT 
            COALESCE(closed_units, 0),
            COALESCE(open_packages, '[]'::jsonb)
        INTO v_dest_closed, v_dest_open_arr
        FROM public.inventory_location_stock
        WHERE location_id = p_to_location_id AND item_id = p_item_id
        FOR UPDATE;
        
        IF NOT FOUND THEN
            v_dest_closed := 0;
            v_dest_open_arr := '[]'::jsonb;
        END IF;

        -- Calculate Open Sum
        SELECT COALESCE(SUM((qty->>'remaining')::numeric), 0)
        INTO v_dest_open_sum
        FROM jsonb_array_elements(COALESCE(v_dest_open_arr, '[]'::jsonb)) qty;

        -- Total Current
        v_dest_total_current := (v_dest_closed * v_item_package_size) + v_dest_open_sum;

        -- New Total
        v_dest_new_total := v_dest_total_current + p_quantity;

        -- DEFRAG: Redistribution
        v_dest_new_closed := FLOOR(v_dest_new_total / v_item_package_size);
        v_dest_new_remainder := v_dest_new_total - (v_dest_new_closed * v_item_package_size);

        IF v_dest_new_remainder > 0.0001 THEN
             v_dest_new_open_arr := jsonb_build_array(
                 jsonb_build_object(
                     'remaining', v_dest_new_remainder, 
                     'opened_at', now()
                 )
             );
        ELSE
             v_dest_new_open_arr := '[]'::jsonb;
        END IF;

        -- Upsert
        INSERT INTO public.inventory_location_stock (store_id, item_id, location_id, closed_units, open_packages)
        VALUES (v_store_id, p_item_id, p_to_location_id, v_dest_new_closed, v_dest_new_open_arr)
        ON CONFLICT (store_id, item_id, location_id)
        DO UPDATE SET 
            closed_units = EXCLUDED.closed_units,
            open_packages = EXCLUDED.open_packages,
            updated_at = now();
            
    END IF;

    -- 3. AUDIT LOG
    -- Calculate generic deltas for log (informative)
    -- This assumes p_quantity is Base Units.
    -- v_item_package_size is Base Units per Package.
    v_log_id := public.log_inventory_action(
        p_item_id := p_item_id,
        p_action_type := LOWER(COALESCE(p_movement_type, 'adjustment')),
        p_quantity_delta := p_quantity, -- Base Units
        p_package_delta := FLOOR(p_quantity / v_item_package_size), -- Approx Packages
        p_reason := p_reason || (CASE WHEN p_notes <> '' THEN ': ' || p_notes ELSE '' END),
        p_location_from := p_from_location_id,
        p_location_to := p_to_location_id,
        p_source_ui := 'quick_action_v2'
    );

    RETURN json_build_object(
        'success', true,
        'quantity_moved', p_quantity,
        'from_location', p_from_location_id,
        'to_location', p_to_location_id,
        'audit_log_id', v_log_id
    );
END;
$function$;
