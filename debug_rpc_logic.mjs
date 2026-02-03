
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectRPCLogic() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    const menuId = "5d100913-1a12-4099-974d-1579be406606";

    console.log('--- Testing RPC Step-by-Step ---');

    // Step 1: Does the menu exist with this ID?
    const { data: menu } = await supabase.from('menus').select('id, store_id').eq('id', menuId).single();
    console.log('1. Menu exists:', !!menu, menu?.store_id === storeId ? '(Store matches)' : '(Store MISMATCH!)');

    // Step 2: Are there ANY inventory items with is_menu_visible = true?
    const { data: iis } = await supabase.from('inventory_items').select('id').eq('store_id', storeId).eq('is_menu_visible', true);
    console.log('2. Visible inventory items count:', iis?.length);

    // Step 3: Are there links in categories? (Optional in my RPC but maybe not in Deployed)
    const { data: cats } = await supabase.from('categories').select('id, name').eq('store_id', storeId);
    console.log('3. Categories count:', cats?.length);

    // Step 4: Try calling it as a simple select if it was a view (it's not, but just in case)
}

inspectRPCLogic();
