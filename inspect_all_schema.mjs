
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectAll() {
    console.log('--- PRODUCTS SCHEMA ---');
    const { data: pRows, error: pErr } = await supabase.from('products').select('*').limit(1);
    if (pErr) console.error('Products Select Error:', pErr.message);
    else if (pRows && pRows.length > 0) console.log('Products Keys:', Object.keys(pRows[0]));
    else console.log('Products table empty');

    console.log('\n--- ORDERS SCHEMA ---');
    const { data: oRows, error: oErr } = await supabase.from('orders').select('*').limit(1);
    if (oErr) console.error('Orders Select Error:', oErr.message);
    else if (oRows && oRows.length > 0) console.log('Orders Keys:', Object.keys(oRows[0]));
    else console.log('Orders table empty');
}

inspectAll();
