
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function findCiroCategories() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    const { data: cats } = await supabase.from('categories').select('*').eq('store_id', storeId);
    console.log('--- Categories for f5e3bfcf ---');
    if (cats) {
        for (const c of cats) {
            // Check if is_menu_visible exists and its value
            console.log(`- ${c.name} | ID: ${c.id} | Visible: ${c.is_menu_visible}`);
        }
    }
}

findCiroCategories();
