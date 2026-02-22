-- Direct application of transfer_stock hotfix
-- This script applies the critical fix for the transfer_stock RPC function

-- Create the fixed transfer_stock function with 8 parameters
CREATE OR REPLACE FUNCTION public.transfer_stock(
    p_item_id uuid,
    p_from_location_id uuid,        -- Permite NULL para nuevos ingresos
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
    v_result jsonb;
BEGIN
    -- Validar que el usuario tenga acceso al item
    SELECT 
        ii.store_id,
        ii.name,
        ii.current_stock
    INTO 
        v_store_id,
        v_item_name, 
        v_current_stock
    FROM inventory_items ii
    WHERE ii.id = p_item_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ITEM_NOT_FOUND',
            'message', 'Item de inventario no encontrado'
        );
    END IF;
    
    -- Verificar permisos del usuario (debe pertenecer al store)
    IF NOT EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = COALESCE(p_user_id, auth.uid()) 
        AND (store_id = v_store_id OR role = 'super_admin')
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permisos para modificar este inventario'
        );
    END IF;
    
    -- Validar cantidad positiva
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_QUANTITY',
            'message', 'La cantidad debe ser mayor a 0'
        );
    END IF;
    
    -- Para transferencias desde una ubicación, verificar stock disponible
    IF p_from_location_id IS NOT NULL AND p_movement_type != 'PURCHASE' THEN
        -- Para transferencias normales, validar stock disponible
        IF v_current_stock < p_quantity THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'INSUFFICIENT_STOCK',
                'message', 'Stock insuficiente. Disponible: ' || v_current_stock
            );
        END IF;
    END IF;
    
    -- Crear registro de movimiento
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
        CASE 
            WHEN p_from_location_id IS NULL THEN 'restock'
            WHEN p_movement_type = 'PURCHASE' THEN 'purchase'
            ELSE 'transfer'
        END,
        p_quantity,
        p_from_location_id,
        p_to_location_id,
        COALESCE(p_user_id, auth.uid()),
        COALESCE(p_notes, ''),
        COALESCE(p_reason, 'Transferencia de stock'),
        NOW()
    ) RETURNING id INTO v_movement_id;
    
    -- Actualizar stock del item
    IF p_from_location_id IS NULL OR p_movement_type = 'PURCHASE' THEN
        -- Reingreso/Compra: Incrementar stock
        UPDATE inventory_items 
        SET 
            current_stock = current_stock + p_quantity,
            updated_at = NOW()
        WHERE id = p_item_id;
    ELSE
        -- Transferencia normal: mantener stock total pero cambiar ubicación
        UPDATE inventory_items 
        SET updated_at = NOW()
        WHERE id = p_item_id;
    END IF;
    
    -- Obtener stock actualizado
    SELECT current_stock INTO v_current_stock 
    FROM inventory_items 
    WHERE id = p_item_id;
    
    -- Log de auditoría
    INSERT INTO system_logs (
        level,
        category,
        message,
        metadata,
        created_at
    ) VALUES (
        'INFO',
        'INVENTORY_TRANSFER',
        'Stock transfer completed: ' || v_item_name,
        jsonb_build_object(
            'item_id', p_item_id,
            'quantity', p_quantity,
            'movement_type', p_movement_type,
            'from_location', p_from_location_id,
            'to_location', p_to_location_id,
            'user_id', COALESCE(p_user_id, auth.uid()),
            'movement_id', v_movement_id,
            'new_stock', v_current_stock
        ),
        NOW()
    );
    
    -- Retornar resultado exitoso
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
        -- Log error
        INSERT INTO system_logs (
            level,
            category,
            message,
            metadata,
            created_at
        ) VALUES (
            'ERROR',
            'INVENTORY_TRANSFER_ERROR',
            'Transfer failed: ' || SQLERRM,
            jsonb_build_object(
                'item_id', p_item_id,
                'quantity', p_quantity,
                'error_code', SQLSTATE,
                'error_message', SQLERRM
            ),
            NOW()
        );
        
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TRANSFER_FAILED',
            'message', 'Error en transferencia: ' || SQLERRM
        );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.transfer_stock TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.transfer_stock IS 'Función unificada para transferencias de stock. Soporta NULL from_location para nuevos ingresos. Acepta 8 parámetros como requiere el frontend.';