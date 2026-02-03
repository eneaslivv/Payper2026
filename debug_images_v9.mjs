
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: stores } = await supabase.from('stores').select('*');
    if (!stores) {
        console.error('No stores found');
        return;
    }

    const store = stores.find(s => s.slug === 'payper' || s.name === 'Payper' || s.slug.includes('payper'));
    if (!store) {
        console.log('Store not found with payper in name or slug. Available slugs:');
        stores.forEach(s => console.log(`'${s.slug}'`));
        return;
    }

    console.log(`Matched Store: ${store.name} | ID: ${store.id} | Slug: ${store.slug}`);

    const theme = typeof store.menu_theme === 'string' ? JSON.parse(store.menu_theme) : store.menu_theme;
    console.log('Theme showImages:', theme?.showImages);

    const { count: pCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('store_id', store.id);
    const { count: iCount } = await supabase.from('inventory_items').select('*', { count: 'exact', head: true }).eq('store_id', store.id);

    console.log(`Products: ${pCount}, Inventory Items: ${iCount}`);

    const { data: productsWithImages } = await supabase.from('inventory_items')
        .select('name, image, image_url')
        .eq('store_id', store.id)
        .or('image.neq.null,image_url.neq.null')
        .limit(5);

    console.log('\n--- SAMPLE DATA ---');
    console.log(JSON.stringify(productsWithImages, null, 2));
}

inspectData();
