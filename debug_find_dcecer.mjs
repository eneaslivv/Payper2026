
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function findDCECER() {
    console.log('--- Searching in products ---');
    const { data: ps } = await supabase.from('products').select('store_id, name').eq('name', 'DCECER');
    console.log(JSON.stringify(ps, null, 2));

    console.log('--- Searching in inventory_items ---');
    const { data: iis } = await supabase.from('inventory_items').select('store_id, name').eq('name', 'DCECER');
    console.log(JSON.stringify(iis, null, 2));
}

findDCECER();
