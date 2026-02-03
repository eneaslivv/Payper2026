
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    console.log('--- TARGETED THEME CHECK ---');
    const { data: stores, error: sError } = await supabase
        .from('stores')
        .select('name, slug, menu_theme')
        .eq('slug', 'payper');

    if (sError) console.error(sError);
    else if (stores.length > 0) {
        const s = stores[0];
        const theme = typeof s.menu_theme === 'string' ? JSON.parse(s.menu_theme) : s.menu_theme;
        console.log(`Store: ${s.name} (${s.slug})`);
        console.log(`showImages: ${theme?.showImages}`);
        console.log(`cardStyle: ${theme?.cardStyle}`);
        console.log(`layoutMode: ${theme?.layoutMode}`);
    }

    console.log('\n--- PRODUCT IMAGE COUNTS ---');
    const { count: pCount, error: pcError } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .or('image.neq.null,image_url.neq.null');

    console.log(`Products with some image field: ${pCount}`);

    const { count: iCount, error: icError } = await supabase
        .from('inventory_items')
        .select('*', { count: 'exact', head: true })
        .or('image.neq.null,image_url.neq.null');

    console.log(`Inventory Items with some image field: ${iCount}`);

    // Sample URLs
    const { data: samples } = await supabase
        .from('inventory_items')
        .select('name, image, image_url')
        .or('image.neq.null,image_url.neq.null')
        .limit(3);

    console.log('\n--- SAMPLE IMAGE DATA ---');
    console.log(JSON.stringify(samples, null, 2));
}

inspectData();
