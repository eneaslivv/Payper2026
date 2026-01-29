
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function inspectOrders() {
    console.log('Inspecting orders table...');
    const { data, error } = await supabase.from('orders').select('*').limit(1);

    if (error) {
        console.error('Error fetching orders:', error);
        // Try getting columns via RPC if select fails or returns empty
        const { data: cols, error: colError } = await supabase.rpc('get_table_columns', { table_name: 'orders' });
        if (colError) {
            console.error('Error getting columns via RPC:', colError);
        } else {
            console.log('Orders columns (RPC):', cols);
        }
    } else if (data && data.length > 0) {
        console.log('Orders row sample:', data[0]);
        console.log('Keys:', Object.keys(data[0]));
    } else {
        console.log('Orders table is empty. Trying to guess columns...');
        // Try information_schema via RPC
        const { data: schema, error: schemaError } = await supabase.rpc('inspect_schema' as any, { table_name: 'orders' });
        console.log('Schema info:', schema || schemaError);
    }
}

inspectOrders();
