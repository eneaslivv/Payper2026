
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugRPCCorrect() {
    const storeId = "f1097064-3024-434e-a532-2dc4f44e573e";

    // 1. Resolve menu first
    const { data: menuData } = await supabase.rpc('resolve_menu', { p_slug: 'test-ciro-enero' });
    console.log('Resolved Menu:', menuData);

    const menuId = menuData?.id;
    if (menuId) {
        console.log('--- Calling RPC for menu:', menuId, '---');
        const { data, error } = await supabase.rpc('get_menu_products', { p_menu_id: menuId });
        if (error) console.error(error);
        else {
            console.log(`RPC Result Count: ${data.length}`);
            data.forEach(p => console.log(`- ${p.name} | Price: ${p.effective_price} | Img: ${p.image_url}`));
        }
    } else {
        console.warn('Could not resolve menu for test-ciro-enero');
    }
}

debugRPCCorrect();
