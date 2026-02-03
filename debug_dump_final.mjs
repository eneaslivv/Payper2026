
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function dumpAllMenus() {
    const { data: menus, error } = await supabase.from('menus').select('*');
    if (error) {
        console.error('Fetch Error:', error);
        return;
    }

    console.log('--- ALL MENUS RAW ---');
    if (menus) {
        console.log(`Successfully fetched ${menus.length} menus.`);
        for (const m of menus) {
            console.log(`- ${m.name} | StoreID: ${m.store_id} | Slug: ${m.slug}`);
        }
    } else {
        console.log('Data is null.');
    }
}

dumpAllMenus();
