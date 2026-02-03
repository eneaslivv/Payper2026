
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: stores } = await supabase.from('stores').select('*').eq('slug', 'coffe');
    if (!stores || stores.length === 0) {
        console.error('Store coffe not found');
        return;
    }
    const store = stores[0];
    console.log(`Matched Store: ${store.name} | ID: ${store.id} | Slug: ${store.slug}`);

    const theme = typeof store.menu_theme === 'string' ? JSON.parse(store.menu_theme) : store.menu_theme;
    console.log('Theme showImages:', theme?.showImages);
    console.log('Full Theme:', JSON.stringify(theme, null, 2));

    const { count: pCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('store_id', store.id);
    const { count: iCount } = await supabase.from('inventory_items').select('*', { count: 'exact', head: true }).eq('store_id', store.id);

    console.log(`Products: ${pCount}, Inventory Items: ${iCount}`);

    const { data: productsWithImages } = await supabase.from('inventory_items')
        .select('name, image, image_url')
        .eq('store_id', store.id)
        .or('image.neq.null,image_url.neq.null');

    console.log(`Inventory items with images: ${productsWithImages?.length || 0}`);
    if (productsWithImages) {
        console.log('\n--- SAMPLE DATA ---');
        console.log(JSON.stringify(productsWithImages.slice(0, 5), null, 2));
    }
}

inspectData();
