
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectMPSchemaVertical() {
    const { data: row } = await supabase.from('menu_products').select('*').limit(1).single();
    if (row) {
        console.log('--- menu_products columns ---');
        Object.keys(row).sort().forEach(k => console.log(k));
    } else {
        console.log('No rows in menu_products');
    }
}

inspectMPSchemaVertical();
