
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectOrders() {
    console.log('Inspecting orders table...');
    // Use select to see what columns we get back
    const { data, error } = await supabase.from('orders').select('*').limit(1);

    if (error) {
        console.error('Error fetching orders:', JSON.stringify(error, null, 2));
    } else if (data && data.length > 0) {
        console.log('Orders row sample:', data[0]);
        console.log('Keys:', Object.keys(data[0]));
    } else {
        console.log('Orders table is empty. Trying to guess columns via insertion attempt...');
        // Try a dummy insert with minimal fields to see the error message (it often lists missing columns)
        const { error: insError } = await supabase.from('orders').insert({
            id: '00000000-0000-0000-0000-000000000000',
            store_id: '00000000-0000-0000-0000-000000000000',
            status: 'draft'
        });
        console.log('Insertion error (expected):', JSON.stringify(insError, null, 2));
    }
}

inspectOrders();
