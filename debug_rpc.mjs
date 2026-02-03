
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectRPC() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    const { data: menuId } = await supabase.rpc('resolve_menu', { p_store_id: storeId });
    console.log('Resolved Menu ID:', menuId);

    if (menuId) {
        const { data: products, error } = await supabase.rpc('get_menu_products', { p_menu_id: menuId });
        if (error) {
            console.error('RPC Error:', error);
            return;
        }
        const holis = products.find(p => p.name === 'holis');
        console.log('Product "holis" from RPC:', JSON.stringify(holis, null, 2));

        // Also log some other items from the screenshot
        const dcecer = products.find(p => p.name === 'DCECER');
        console.log('Product "DCECER" from RPC:', JSON.stringify(dcecer, null, 2));
    }
}

inspectRPC();
