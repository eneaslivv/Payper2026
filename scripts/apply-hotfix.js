// Script to apply the critical transfer_stock hotfix directly to the database
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA5MTA1NywiZXhwIjoyMDgxNjY3MDU3fQ.5nX6p_CcLIGPHVJHkla8QJQexK5U2oIYjpCNPRJtd7c';

const supabase = createClient(supabaseUrl, serviceRoleKey);

const fixSQL = `
-- Create the fixed transfer_stock function with 8 parameters
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
`;

async function applyHotfix() {
    console.log('🔧 Aplicando hotfix crítico para transfer_stock...');
    
    try {
        // Execute the SQL
        const { error } = await supabase.rpc('exec', { sql: fixSQL });
        
        if (error) {
            console.error('❌ Error ejecutando SQL:', error);
            
            // Try direct SQL execution
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${serviceRoleKey}`,
                    'apikey': serviceRoleKey
                },
                body: JSON.stringify({ sql: fixSQL })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            console.log('✅ Hotfix aplicado mediante REST API');
        } else {
            console.log('✅ Hotfix aplicado exitosamente via RPC');
        }
        
        // Test the function
        console.log('🧪 Probando la función transfer_stock...');
        
        // Get a test inventory item
        const { data: items, error: itemsError } = await supabase
            .from('inventory_items')
            .select('id')
            .limit(1);
            
        if (itemsError || !items || items.length === 0) {
            console.log('⚠️ No se pueden encontrar items de inventario para probar');
            return;
        }
        
        // Test the function with correct 8-parameter signature
        const testParams = {
            p_item_id: items[0].id,
            p_from_location_id: null, // Nuevo ingreso
            p_to_location_id: null,
            p_quantity: 0.01, // Cantidad muy pequeña para test
            p_user_id: null, // Will use auth.uid()
            p_notes: 'Test hotfix application',
            p_movement_type: 'PURCHASE',
            p_reason: 'Test de hotfix'
        };
        
        const { data: testResult, error: testError } = await supabase
            .rpc('transfer_stock', testParams);
        
        if (testError) {
            console.error('❌ Error probando función:', testError);
        } else {
            console.log('✅ Función transfer_stock funcionando correctamente');
            console.log('📊 Resultado test:', testResult);
        }
        
    } catch (error) {
        console.error('❌ Error aplicando hotfix:', error.message);
        process.exit(1);
    }
}

applyHotfix();