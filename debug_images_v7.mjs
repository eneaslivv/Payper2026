
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    console.log('--- ALL STORES (slugs) ---');
    const { data: stores, error: sError } = await supabase
        .from('stores')
        .select('id, name, slug');

    if (sError) console.error(sError);
    else {
        stores.forEach(s => console.log(`ID: ${s.id} | Slug: '${s.slug}' | Name: ${s.name}`));
    }
}

inspectData();
