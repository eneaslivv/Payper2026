-- HOTFIX: Fix transfer_stock function to accept 8 parameters
-- This fixes the "COULD NOT FIND THE FUNCTION" error when restocking inventory

CREATE OR REPLACE FUNCTION public.transfer_stock(
    p_item_id uuid,
    p_from_location_id uuid,
    p_to_location_id uuid,
    p_quantity numeric,
    p_user_id uuid DEFAULT auth.uid(),
    p_notes text DEFAULT '',
    p_movement_type text DEFAULT 'transfer',
    p_reason text DEFAULT 'Transferencia'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_store_id uuid;
    v_item_name text;
    v_movement_id uuid;
    v_current_stock numeric;
BEGIN
    -- Get item details
    SELECT store_id, name, current_stock 
    INTO v_store_id, v_item_name, v_current_stock
    FROM inventory_items 
    WHERE id = p_item_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ITEM_NOT_FOUND',
            'message', 'Item no encontrado'
        );
    END IF;
    
    -- Validate positive quantity
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_QUANTITY',
            'message', 'Cantidad debe ser mayor a 0'
        );
    END IF;
    
    -- Create movement record
    INSERT INTO inventory_movements (
        id,
        inventory_item_id,
        movement_type,
        quantity,
        from_location_id,
        to_location_id,
        user_id,
        notes,
        reason,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_item_id,
        COALESCE(p_movement_type, 'transfer'),
        p_quantity,
        p_from_location_id,
        p_to_location_id,
        COALESCE(p_user_id, auth.uid()),
        COALESCE(p_notes, ''),
        COALESCE(p_reason, 'Transferencia'),
        NOW()
    ) RETURNING id INTO v_movement_id;
    
    -- Update stock (add quantity if from_location is null - restock scenario)
    IF p_from_location_id IS NULL THEN
        UPDATE inventory_items 
        SET 
            current_stock = current_stock + p_quantity,
            updated_at = NOW()
        WHERE id = p_item_id;
    ELSE
        UPDATE inventory_items 
        SET updated_at = NOW()
        WHERE id = p_item_id;
    END IF;
    
    -- Get updated stock
    SELECT current_stock INTO v_current_stock 
    FROM inventory_items 
    WHERE id = p_item_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Transferencia completada exitosamente',
        'data', jsonb_build_object(
            'movement_id', v_movement_id,
            'item_id', p_item_id,
            'item_name', v_item_name,
            'quantity_transferred', p_quantity,
            'new_stock_level', v_current_stock,
            'movement_type', p_movement_type
        )
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TRANSFER_FAILED',
            'message', 'Error: ' || SQLERRM
        );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.transfer_stock TO authenticated;

-- Add documentation
COMMENT ON FUNCTION public.transfer_stock IS 'Función de transferencia de stock que acepta 8 parámetros. Soporta restock cuando from_location_id es NULL.';