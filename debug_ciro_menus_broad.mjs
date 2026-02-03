
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function findCiroMenusBroad() {
    const { data: menus } = await supabase.from('menus').select('*').ilike('slug', '%ciro%');
    console.log('--- MENUS MATCHING %ciro% ---');
    console.log(JSON.stringify(menus, null, 2));

    const { data: allMenus } = await supabase.from('menus').select('id, name, slug').limit(20);
    console.log('\n--- FIRST 20 MENUS ---');
    allMenus?.forEach(m => console.log(`- ${m.name} | Slug: ${m.slug}`));
}

findCiroMenusBroad();
