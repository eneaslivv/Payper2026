
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: store } = await supabase.from('stores').select('id').eq('slug', 'coffe').single();
    if (!store) {
        console.error('Store "coffe" not found');
        return;
    }

    const { data: menus } = await supabase.from('menus').select('id, name').eq('store_id', store.id);
    if (!menus || menus.length === 0) {
        console.error('No menus found for store');
        return;
    }

    console.log(`Checking menus for coffe (${store.id}):`);
    for (const menu of menus) {
        console.log(`- Menu: ${menu.name} (${menu.id})`);
        const { data: products, error } = await supabase.rpc('get_menu_products', { p_menu_id: menu.id });
        if (error) {
            console.error(`  RPC Error: ${error.message}`);
            continue;
        }
        const withImages = products?.filter(p => p.image_url && p.image_url !== '') || [];
        console.log(`  Products: ${products?.length || 0} | With Images: ${withImages.length}`);
        if (withImages.length > 0) {
            console.table(withImages.slice(0, 3));
        }
    }
}

inspectData();
