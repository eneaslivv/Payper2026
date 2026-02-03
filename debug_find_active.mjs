
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function findActiveStore() {
    // Let's search for ANY store that resolves to a menu with products.
    const { data: stores } = await supabase.from('stores').select('id, name, slug');
    console.log('--- Stores checking ---');

    for (const s of stores) {
        const { data: menuData } = await supabase.rpc('resolve_menu', { p_slug: s.slug });
        if (menuData) {
            const { data: prods } = await supabase.rpc('get_menu_products', { p_menu_id: menuData.id });
            console.log(`- Store: ${s.slug} | MenuID: ${menuData.id} | ProductCount: ${prods?.length || 0}`);
            if (prods?.length > 0) {
                console.log('  -> This store is WORKING.');
            }
        }
    }
}

findActiveStore();
