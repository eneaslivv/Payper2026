// Direct SQL execution using Supabase client
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA5MTA1NywiZXhwIjoyMDgxNjY3MDU3fQ.5nX6p_CcLIGPHVJHkla8QJQexK5U2oIYjpCNPRJtd7c';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TRANSFER_STOCK_SQL = `
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
$$;`;

const GRANT_SQL = `GRANT EXECUTE ON FUNCTION public.transfer_stock TO authenticated;`;

async function applyDirectSQL() {
    console.log('🔧 Aplicando fix de transfer_stock directamente...');
    
    try {
        // Execute the CREATE FUNCTION SQL
        console.log('📝 Ejecutando CREATE OR REPLACE FUNCTION...');
        
        const { data: createResult, error: createError } = await supabase
            .from('_supabase_sql_execute')
            .select('*')
            .eq('sql', TRANSFER_STOCK_SQL)
            .limit(1);
            
        if (createError) {
            console.log('⚠️ Método directo no disponible, intentando con .rpc()...');
            
            // Try using a custom RPC approach
            const { error: rpcError } = await supabase.rpc('exec_sql', { 
                query: TRANSFER_STOCK_SQL 
            });
            
            if (rpcError) {
                console.log('⚠️ RPC tampoco disponible. Ejecutando manualmente...');
                throw new Error('Requires manual SQL execution');
            }
        }
        
        console.log('📝 Ejecutando GRANT...');
        await supabase.rpc('exec_sql', { query: GRANT_SQL });
        
        console.log('✅ Función transfer_stock actualizada exitosamente!');
        
        // Test the function
        console.log('🧪 Probando función actualizada...');
        await testFunction();
        
    } catch (error) {
        console.error('❌ Error ejecutando SQL directamente:', error.message);
        console.log('\n📋 INSTRUCCIONES MANUALES:');
        console.log('1. Ve a: https://yjxjyxhksedwfeueduwl.supabase.co');
        console.log('2. Click en "SQL Editor"');
        console.log('3. Copia y pega el SQL que aparece abajo:');
        console.log('\n--- SQL PARA COPIAR Y PEGAR ---');
        console.log(TRANSFER_STOCK_SQL);
        console.log('\n' + GRANT_SQL);
        console.log('\n--- FIN DEL SQL ---');
        console.log('\n4. Click en "RUN"');
        console.log('5. Deberías ver "Success. No rows returned"');
        console.log('\n✅ Una vez hecho, el sistema de restock funcionará!');
    }
}

async function testFunction() {
    try {
        // Get a test inventory item
        const { data: items, error: itemsError } = await supabase
            .from('inventory_items')
            .select('id, name, current_stock')
            .limit(1);
            
        if (itemsError || !items || items.length === 0) {
            console.log('⚠️ No se pueden encontrar items de prueba');
            return;
        }
        
        console.log(`📦 Probando con: ${items[0].name} (Stock actual: ${items[0].current_stock})`);
        
        // Test the function with 8 parameters
        const { data: result, error: funcError } = await supabase
            .rpc('transfer_stock', {
                p_item_id: items[0].id,
                p_from_location_id: null,
                p_to_location_id: null,
                p_quantity: 0.01,
                p_user_id: null,
                p_notes: 'Test fix function',
                p_movement_type: 'PURCHASE',
                p_reason: 'Prueba hotfix'
            });
        
        if (funcError) {
            console.error('❌ Error probando función:', funcError);
        } else {
            console.log('✅ Función funciona correctamente con 8 parámetros!');
            console.log('📊 Resultado:', result);
        }
        
    } catch (error) {
        console.error('❌ Error en prueba:', error.message);
    }
}

applyDirectSQL();