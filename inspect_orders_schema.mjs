
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function inspectOrders() {
    // Use a column that might not exist to trigger an error message that lists columns if possible, 
    // or just try to get one row.
    const { data, error } = await supabase.from('orders').select('*').limit(1);
    if (error) {
        console.error('Error fetching order:', error);
        // Fallback: try to select a known column and see if it works
        const { error: err2 } = await supabase.from('orders').select('id, store_id, status').limit(1);
        console.log('Test select result:', err2 ? err2.message : 'Success');
        return;
    }
    if (data && data.length > 0) {
        console.log('ORDER KEYS:', Object.keys(data[0]));
        console.log('ORDER SAMPLE:', data[0]);
    } else {
        console.log('No rows in orders table.');
        // Try to trigger a "column not found" error to see what columns ARE there
        const { error: err3 } = await supabase.from('orders').select('dummy_column');
        console.log('Column list from error:', err3?.message);
    }
}

inspectOrders();
