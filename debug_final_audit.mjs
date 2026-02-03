
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectAllMenusFinal() {
    console.log('--- ALL MENUS ---');
    const { data: menus } = await supabase.from('menus').select('id, store_id, name, slug, priority, is_fallback');
    if (menus) {
        for (const m of menus) {
            console.log(`- ID: ${m.id} | Store: ${m.store_id} | Name: ${m.name} | Slug: ${m.slug} | Priority: ${m.priority} | FB: ${m.is_fallback}`);
        }
    }

    console.log('\n--- ALL STORES FOR test-ciro-enero ---');
    const { data: stores } = await supabase.from('stores').select('id, name, slug').ilike('slug', '%test-ciro-enero%');
    if (stores) {
        for (const s of stores) {
            console.log(`- ID: ${s.id} | Name: ${s.name} | Slug: ${s.slug}`);
        }
    }
}

inspectAllMenusFinal();
