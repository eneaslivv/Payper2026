
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectProductFields() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    const { data: ps } = await supabase.from('products').select('*').eq('store_id', storeId).limit(10);
    console.log('--- PRODUCTS DATA ---');
    if (ps) {
        ps.forEach(p => {
            console.log(`- ID: ${p.id} | Name: ${p.name} | Visible: ${p.is_visible} | Image: ${p.image} | URL: ${p.image_url}`);
        });
    }
}

inspectProductFields();
