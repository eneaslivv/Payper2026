
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function findTheMissingMenuRobust() {
    const { data: stores } = await supabase.from('stores').select('id, name, slug');
    const { data: menus } = await supabase.from('menus').select('id, store_id, name, slug');

    console.log('--- ALL STORES ---');
    if (stores) {
        for (const s of stores) {
            console.log(`Store: ${s.id} | Slug: ${s.slug} | Name: ${s.name}`);
        }
    }

    console.log('\n--- ALL MENUS ---');
    if (menus) {
        for (const m of menus) {
            const store = stores ? stores.find(s => s.id === m.store_id) : null;
            console.log(`Menu: ${m.id} | Store: ${store ? store.slug : m.store_id} | Name: ${m.name}`);
        }
    }
}

findTheMissingMenuRobust();
