
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectMenusAndProducts() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    // 1. Get the menu
    const { data: menus } = await supabase.from('menus').select('id, name, is_active').eq('store_id', storeId);
    console.log('--- MENUS ---');
    console.log(JSON.stringify(menus, null, 2));

    for (const menu of menus) {
        console.log(`\n--- Products in menu: ${menu.name} (${menu.id}) ---`);
        const { data: mps } = await supabase.from('menu_products').select('*, products(*)').eq('menu_id', menu.id);
        if (mps) {
            mps.forEach(mp => {
                const prod = mp.products;
                console.log(`- [${mp.product_id}] ${prod?.name} | Img: ${prod?.image}`);
            });
        }
    }
}

inspectMenusAndProducts();
