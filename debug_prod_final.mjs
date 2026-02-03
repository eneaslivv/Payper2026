
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectProductFinal() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    const { data: ps } = await supabase.from('products').select('id, name, is_visible, image, image_url').eq('store_id', storeId);
    console.log('--- PRODUCTS AUDIT ---');
    ps.forEach(p => console.log(`- ${p.name} | is_visible: ${p.is_visible} | img: ${p.image}`));
}

inspectProductFinal();
