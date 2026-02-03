
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: store, error } = await supabase.from('stores').select('id, name, slug').eq('id', 'f1097064-0706-4b30-b2b5-4851-a532-2dc4f44e536e').single();
    if (error) {
        console.error('Store f1097064 not found');
    } else {
        console.log('Store f1097064 info:', JSON.stringify(store, null, 2));
    }
}

inspectData();
