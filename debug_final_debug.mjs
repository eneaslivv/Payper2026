
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectEverything() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    const menuId = "5d100913-1a12-4099-974d-1579be406606";

    console.log('--- Categories ---');
    const { data: cats } = await supabase.from('categories').select('*').eq('store_id', storeId);
    console.log(JSON.stringify(cats, null, 2));

    console.log('--- Inventory with category_id ---');
    const { data: iis } = await supabase.from('inventory_items').select('name, category_id, is_menu_visible').eq('store_id', storeId).limit(5);
    console.log(JSON.stringify(iis, null, 2));

    console.log('--- RPC raw check ---');
    // If we can't see the RPC, let's try calling it with a valid category filter if it has one?
    // No, get_menu_products takes p_menu_id.
}

inspectEverything();
