
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testResolutionCorrect() {
    const storeId = "f1097064-302b-4851-a532-2dc4f44e5736";
    const { data, error } = await supabase.rpc('resolve_menu', {
        p_store_id: storeId,
        p_session_type: 'generic',
        p_table_id: null,
        p_bar_id: null
    });

    console.log('Resolve Result:', data, error);
}

testResolutionCorrect();
