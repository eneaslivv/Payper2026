
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugJoin() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    const { data: results, error } = await supabase
        .from('inventory_items')
        .select(`
            id,
            name,
            sku,
            image_url,
            is_menu_visible,
            products (
                id,
                name,
                image,
                image_url,
                sku
            )
        `)
        .eq('store_id', storeId)
        .ilike('name', '%DCECER%');

    if (error) console.error(error);
    console.log(JSON.stringify(results, null, 2));
}

debugJoin();
