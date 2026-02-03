
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    console.log('--- STORES (menu_theme) ---');
    const { data: stores, error: sError } = await supabase
        .from('stores')
        .select('name, slug, menu_theme')
        .limit(5);

    if (sError) console.error(sError);
    else {
        stores.forEach(s => {
            const theme = typeof s.menu_theme === 'string' ? JSON.parse(s.menu_theme) : s.menu_theme;
            console.log(`Store: ${s.name} (${s.slug})`);
            console.log(`Theme:`, JSON.stringify(theme, null, 2));
        });
    }

    console.log('\n--- PRODUCTS (Non-empty images) ---');
    const { data: products, error: pError } = await supabase
        .from('products')
        .select('name, image, image_url, store_id')
        .or('image.neq.null,image_url.neq.null')
        .limit(5);

    if (pError) console.error(pError);
    else console.table(products);

    console.log('\n--- INVENTORY ITEMS (Non-empty images) ---');
    const { data: invItems, error: iError } = await supabase
        .from('inventory_items')
        .select('name, image, image_url, store_id')
        .or('image.neq.null,image_url.neq.null')
        .limit(5);

    if (iError) console.error(iError);
    else console.table(invItems);
}

inspectData();
