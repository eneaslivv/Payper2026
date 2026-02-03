
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    console.log('--- GLOBAL IMAGE CHECK ---');

    const { data: products, error: pErr } = await supabase
        .from('products')
        .select('name, image, image_url, store_id')
        .or('image.neq.null,image_url.neq.null')
        .limit(10);

    console.log(`Products with images: ${products?.length || 0}`);
    if (products && products.length > 0) {
        console.table(products);
    }

    const { data: invItems, error: iErr } = await supabase
        .from('inventory_items')
        .select('name, image, image_url, store_id')
        .or('image.neq.null,image_url.neq.null')
        .limit(10);

    console.log(`Inventory Items with images: ${invItems?.length || 0}`);
    if (invItems && invItems.length > 0) {
        console.table(invItems);
    }
}

inspectData();
