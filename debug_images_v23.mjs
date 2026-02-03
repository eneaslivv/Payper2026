
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: store } = await supabase.from('stores').select('id').eq('slug', 'enero').single();
    if (!store) {
        console.log('Store "enero" not found');
        return;
    }
    const { data: items } = await supabase.from('inventory_items').select('name, image_url').eq('store_id', store.id).limit(10);
    console.log(`--- ITEMS for "enero" (${store.id}) ---`);
    console.table(items);
}

inspectData();
