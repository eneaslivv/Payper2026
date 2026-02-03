
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectRPCDef() {
    const { data, error } = await supabase.rpc('get_table_columns', { p_table_name: 'menus' }); // Just to test connection

    // We can't easily get function definitions via RPC unless we have a custom tool.
    // Let's try to query information_schema or similar if allowed, or just re-upload our version.

    // Actually, let's try a different approach: call it with a random UUID to see if it even exists or errors.
    const { error: error2 } = await supabase.rpc('get_menu_products', { p_menu_id: '00000000-0000-0000-0000-000000000000' });
    console.log('Call with dummy ID error:', error2);
}

inspectRPCDef();
