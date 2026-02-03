
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSession() {
    console.log('--- Stores check ---');
    const { data: stores } = await supabase.from('stores').select('*').eq('slug', 'test-ciro-enero');
    console.log(JSON.stringify(stores, null, 2));

    if (stores.length > 0) {
        const s = stores[0];
        console.log('--- Menus check ---');
        const { data: menus } = await supabase.from('menus').select('*').eq('store_id', s.id);
        console.log(JSON.stringify(menus, null, 2));
    }
}

inspectSession();
