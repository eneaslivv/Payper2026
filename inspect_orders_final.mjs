
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectOrders() {
    console.log('--- ORDERS COLUMNS ---');
    // Try to trigger a informative error on a table that likely has rows but might be empty in this view
    const { data, error } = await supabase.from('orders').select('*').limit(1);

    if (error) {
        console.log('Error fetching orders:', error.message);
        // Trigger column list via error
        const { error: err2 } = await supabase.from('orders').select('bogus_column');
        console.log('Column list from error:', err2?.message);
    } else if (data && data.length > 0) {
        Object.keys(data[0]).sort().forEach(k => console.log(`- ${k}`));
    } else {
        // Empty table, trigger error
        const { error: err2 } = await supabase.from('orders').select('bogus_column');
        console.log('Column list from error:', err2?.message);
    }
}

inspectOrders();
