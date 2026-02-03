
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectRPCDetails() {
    const menuId = "5d100913-1a12-4099-974d-1579be406606";

    // Attempt to invoke with a deliberate error to see the error message/schema
    // (e.g. passing a string instead of UUID if it expects UUID)
    const { error: err1 } = await supabase.rpc('get_menu_products', { p_menu_id: 'not-a-uuid' });
    console.log('Error for invalid type:', err1);

    // Try a direct query via a common helper if it exists
    const { data: test, error: err2 } = await supabase.from('inventory_items').select('*, categories(*)').eq('is_menu_visible', true).limit(1);
    console.log('Join test error:', err2);
}

inspectRPCDetails();
