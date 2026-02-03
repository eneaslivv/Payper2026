
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectEverythingFinal() {
    const { data: menus } = await supabase.from('menus').select('*');
    const { data: stores } = await supabase.from('stores').select('*');

    console.log('--- ALL MENUS RAW ---');
    if (menus) {
        menus.forEach(m => {
            console.log(`- MENU: ${m.name} | StoreID: ${m.store_id} | Slug: ${m.slug}`);
        });
    }

    console.log('\n--- ALL STORES RAW ---');
    if (stores) {
        stores.forEach(s => {
            console.log(`- STORE: ${s.name} | ID: ${s.id} | Slug: ${s.slug}`);
        });
    }
}

inspectEverythingFinal();
