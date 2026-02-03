
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectMenus() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    const { data: menus } = await supabase.from('menus').select('*').eq('store_id', storeId);
    console.log('Menus for store:');
    console.log(JSON.stringify(menus, null, 2));

    if (menus.length > 0) {
        const { data: mps } = await supabase.from('menu_products').select('*, products(name)').eq('menu_id', menus[0].id);
        console.log('Products in first menu:');
        console.log(JSON.stringify(mps, null, 2));
    }
}

inspectMenus();
