// Test if the transfer_stock function works with 8 parameters
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjA5MTA1NywiZXhwIjoyMDgxNjY3MDU3fQ.5nX6p_CcLIGPHVJHkla8QJQexK5U2oIYjpCNPRJtd7c';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function testTransferFunction() {
    console.log('🧪 Probando función transfer_stock con 8 parámetros...');
    
    try {
        // Get a test inventory item
        const { data: items, error: itemsError } = await supabase
            .from('inventory_items')
            .select('id, name, current_stock')
            .limit(1);
            
        if (itemsError || !items || items.length === 0) {
            console.log('❌ No se pueden encontrar items de inventario para probar');
            console.log('Error:', itemsError);
            return;
        }
        
        console.log(`📦 Usando item de prueba: ${items[0].name} (Stock: ${items[0].current_stock})`);
        
        // Test the function with 8 parameters as frontend expects
        const testParams = {
            p_item_id: items[0].id,
            p_from_location_id: null, // Null = new stock/restock
            p_to_location_id: null,
            p_quantity: 0.1, // Small test quantity
            p_user_id: null, // Will use auth.uid()
            p_notes: 'Test function with 8 params',
            p_movement_type: 'PURCHASE',
            p_reason: 'Test hotfix'
        };
        
        console.log('🔧 Llamando transfer_stock con 8 parámetros...');
        const { data: result, error: funcError } = await supabase
            .rpc('transfer_stock', testParams);
        
        if (funcError) {
            console.error('❌ Error llamando función:', funcError);
            
            // Try with fewer parameters to see what the current function expects
            console.log('🔄 Probando con 4 parámetros (función actual)...');
            const { data: result4, error: error4 } = await supabase
                .rpc('transfer_stock', {
                    p_item_id: items[0].id,
                    p_from_location_id: null,
                    p_to_location_id: null,
                    p_quantity: 0.1
                });
                
            if (error4) {
                console.error('❌ Error con 4 parámetros:', error4);
            } else {
                console.log('✅ Función funciona con 4 parámetros (necesita actualización)');
                console.log('📊 Resultado:', result4);
            }
        } else {
            console.log('✅ Función transfer_stock funciona correctamente con 8 parámetros!');
            console.log('📊 Resultado:', result);
        }
        
    } catch (error) {
        console.error('❌ Error en prueba:', error.message);
    }
}

testTransferFunction();