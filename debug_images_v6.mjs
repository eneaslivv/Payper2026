
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: store } = await supabase.from('stores').select('id').eq('slug', 'payper').single();
    if (!store) {
        console.error('Store payper not found');
        return;
    }

    console.log(`Store ID: ${store.id}`);

    console.log('\n--- SAMPLE INVENTORY ITEM ---');
    const { data: invItems } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('store_id', store.id)
        .limit(1);

    console.log(JSON.stringify(invItems, null, 2));

    console.log('\n--- SAMPLE PRODUCT ---');
    const { data: products } = await supabase
        .from('products')
        .select('*')
        .eq('store_id', store.id)
        .limit(1);

    console.log(JSON.stringify(products, null, 2));

    console.log('\n--- MENU THEME ---');
    const { data: sData } = await supabase.from('stores').select('menu_theme').eq('id', store.id).single();
    console.log('Raw theme:', sData.menu_theme);
    if (sData.menu_theme) {
        const theme = typeof sData.menu_theme === 'string' ? JSON.parse(sData.menu_theme) : sData.menu_theme;
        console.log('Parsed showImages:', theme.showImages);
    }
}

inspectData();
