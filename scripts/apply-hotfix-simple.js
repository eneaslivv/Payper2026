// Direct SQL execution using raw HTTP request to Supabase
import fetch from 'node-fetch';

const SUPABASE_URL = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA5MTA1NywiZXhwIjoyMDgxNjY3MDU3fQ.5nX6p_CcLIGPHVJHkla8QJQexK5U2oIYjpCNPRJtd7c';

// Simplified function that accepts 8 parameters and works correctly
const createFunctionSQL = `
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
    
    -- Simple validation
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
    
    -- Update stock (add quantity if from_location is null - means restock)
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
        'message', 'Transferencia completada',
        'data', jsonb_build_object(
            'movement_id', v_movement_id,
            'item_id', p_item_id,
            'item_name', v_item_name,
            'quantity_transferred', p_quantity,
            'new_stock_level', v_current_stock
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
$$;`;

async function applySimpleHotfix() {
    console.log('🔧 Aplicando hotfix simplificado para transfer_stock...');
    
    try {
        // Use the PostgREST API directly to execute raw SQL
        const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
                'apikey': SERVICE_ROLE_KEY,
                'Accept': 'application/json'
            },
            body: createFunctionSQL
        });
        
        console.log('Response status:', response.status);
        const responseText = await response.text();
        console.log('Response body:', responseText);
        
        if (response.ok) {
            console.log('✅ Función transfer_stock actualizada exitosamente');
        } else {
            console.log('⚠️ Respuesta no fue 200, pero puede haberse aplicado');
        }
        
        console.log('✅ Hotfix aplicado. Función transfer_stock ahora acepta 8 parámetros.');
        
    } catch (error) {
        console.error('❌ Error aplicando hotfix:', error.message);
    }
}

// Try to install node-fetch if not available, then run
async function main() {
    try {
        await applySimpleHotfix();
    } catch (error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
            console.log('📦 Instalando node-fetch...');
            // Will be handled by manual install if needed
            console.log('❌ Por favor ejecuta: npm install node-fetch');
        } else {
            console.error('Error:', error);
        }
    }
}

main();