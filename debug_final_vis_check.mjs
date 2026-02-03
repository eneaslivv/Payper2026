
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkProductVisibility() {
    const storeId = "f1097064-302b-4851-a532-2dc4f44e5736"; // TEST JET

    console.log('--- PRODUCTS for TEST JET ---');
    const { data: ps } = await supabase.from('products').select('*').eq('store_id', storeId);
    if (ps) {
        ps.forEach(p => {
            console.log(`- ${p.name} | Visible: ${p.is_visible} | Active: ${p.active} | Available: ${p.is_available} | Image: ${p.image}`);
        });
    }

    console.log('\n--- INVENTORY for TEST JET ---');
    const { data: iis } = await supabase.from('inventory_items').select('*').eq('store_id', storeId);
    if (iis) {
        iis.forEach(ii => {
            console.log(`- ${ii.name} | MenuVisible: ${ii.is_menu_visible} | Price: ${ii.price} | Image: ${ii.image_url}`);
        });
    }
}

checkProductVisibility();
