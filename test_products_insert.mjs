
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runSQL() {
    const sql = fs.readFileSync('c:/Users/eneas/Downloads/livv/Payper/coffe payper/supabase/migrations/20260128_map_inventory_to_products.sql', 'utf8');

    // We can't run raw SQL directly with anon key usually, 
    // but maybe there's an RPC? 
    // If not, I'll try to insert a row to products and see if it fails.
    console.log('Testing INSERT into products...');
    const { data, error } = await supabase.from('products').insert({
        store_id: 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533',
        name: 'TEST_PROD_' + Date.now(),
        is_active: true,
        is_visible: true,
        base_price: 100
    });

    if (error) {
        console.error('Insert Error:', error.message);
    } else {
        console.log('Insert Success!');
    }
}

runSQL();
