
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: store } = await supabase.from('stores').select('id').eq('slug', 'test-ciro-enero').single();
    if (!store) return;

    console.log('--- FERNET DATA ---');
    const { data: items } = await supabase.from('inventory_items').select('name, image_url, id').eq('store_id', store.id).eq('name', 'Fernet');
    console.log('Inventory Item:', JSON.stringify(items, null, 2));

    const { data: products } = await supabase.from('products').select('name, image, image_url, id').eq('store_id', store.id).eq('name', 'Fernet');
    console.log('Product:', JSON.stringify(products, null, 2));

    // Call get_menu_products for a menu of this store
    const { data: menu } = await supabase.from('menus').select('id').eq('store_id', store.id).limit(1);
    if (menu && menu.length > 0) {
        const { data: rpcRes } = await supabase.rpc('get_menu_products', { p_menu_id: menu[0].id });
        const fernetRpc = rpcRes?.find(r => r.name === 'Fernet');
        console.log('RPC Result for Fernet:', JSON.stringify(fernetRpc, null, 2));
    }
}

inspectData();
