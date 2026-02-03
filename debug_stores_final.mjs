
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectStoresSlugFinal() {
    const { data: stores } = await supabase.from('stores').select('*').ilike('slug', '%test-ciro%');
    console.log('--- STORES ---');
    if (stores) {
        stores.forEach(s => {
            console.log(`- ID: ${s.id} | Name: ${s.name} | Slug: ${s.slug} | Active: ${s.is_active}`);
        });
    }

    const { data: allMenus } = await supabase.from('menus').select('count', { count: 'exact' });
    console.log('\nTotal menus in DB:', allMenus);
}

inspectStoresSlugFinal();
