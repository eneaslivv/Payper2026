
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectBothMenus() {
    const s1 = "aaaaaaaa-0000-0000-0000-000000000000";
    const s2 = "f1097064-3024-434e-a532-2dc4f44e573e";

    console.log('--- MENUS FOR S1 ---');
    const { data: m1 } = await supabase.from('menus').select('*').eq('store_id', s1);
    console.log(JSON.stringify(m1, null, 2));

    console.log('\n--- MENUS FOR S2 ---');
    const { data: m2 } = await supabase.from('menus').select('*').eq('store_id', s2);
    console.log(JSON.stringify(m2, null, 2));
}

inspectBothMenus();
