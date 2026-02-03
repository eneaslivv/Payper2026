
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugRPCLive() {
    const menuId = "5d100913-1a12-4099-974d-1579be406606";
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    console.log('--- Checking Input Parameters ---');
    const { data: menu } = await supabase.from('menus').select('store_id, is_active').eq('id', menuId).single();
    console.log('Menu:', menu);

    console.log('--- Checking Inventory Visible Items ---');
    const { data: iis } = await supabase.from('inventory_items').select('id, name, is_menu_visible').eq('store_id', storeId).eq('is_menu_visible', true);
    console.log('II Visible:', iis.map(i => i.name));

    console.log('--- Calling RPC ---');
    const { data, error } = await supabase.rpc('get_menu_products', { p_menu_id: menuId });
    if (error) console.error('RPC Error:', error);
    else console.log('RPC Result Count:', data.length);
}

debugRPCLive();
