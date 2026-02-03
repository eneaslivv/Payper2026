
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: stores } = await supabase.from('stores').select('id, name, slug');
    console.log('--- ALL STORES ---');
    console.log(JSON.stringify(stores, null, 2));

    const { data: items } = await supabase.from('inventory_items').select('name, image_url, store_id').neq('image_url', null).limit(10);
    console.log('--- ITEMS WITH IMAGES ---');
    console.log(JSON.stringify(items, null, 2));
}

inspectData();
