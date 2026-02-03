
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function findMenuSimple() {
    const { data: menus } = await supabase.from('menus').select('id, store_id, name');
    console.log('--- MENUS ---');
    if (menus) {
        for (const m of menus) {
            console.log(`- ${m.name} | StoreID: ${m.store_id} | MenuID: ${m.id}`);
        }
    }
}

findMenuSimple();
