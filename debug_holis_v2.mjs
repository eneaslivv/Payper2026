
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectHolis() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    const { data: ps } = await supabase.from('products').select('*').eq('store_id', storeId).ilike('name', '%holis%');
    const { data: iis } = await supabase.from('inventory_items').select('*').eq('store_id', storeId).ilike('name', '%holis%');

    const result = {
        products: ps,
        inventory_items: iis
    };

    fs.writeFileSync('holis_debug.json', JSON.stringify(result, null, 2));
    console.log('Saved holis_debug.json');
}

inspectHolis();
