
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: stores } = await supabase.from('stores').select('id, name, menu_theme').eq('slug', 'payper');
    if (!stores || stores.length === 0) {
        console.error('Store payper not found');
        return;
    }
    const store = stores[0];
    console.log(`Store: ${store.name} | ID: ${store.id}`);

    const theme = typeof store.menu_theme === 'string' ? JSON.parse(store.menu_theme) : store.menu_theme;
    console.log('Theme showImages:', theme?.showImages);

    console.log('\n--- PRODUCTS FOR PAYPER ---');
    const { data: products } = await supabase
        .from('products')
        .select('id, name, image, image_url')
        .eq('store_id', store.id);

    console.log(`Found ${products?.length || 0} products`);
    if (products) console.table(products.filter(p => p.image || p.image_url).slice(0, 5));

    console.log('\n--- INVENTORY ITEMS FOR PAYPER ---');
    const { data: invItems } = await supabase
        .from('inventory_items')
        .select('id, name, image, image_url')
        .eq('store_id', store.id);

    console.log(`Found ${invItems?.length || 0} inventory items`);
    if (invItems) console.table(invItems.filter(p => p.image || p.image_url).slice(0, 10));

    console.log('\n--- TESTING RESOLVE_MENU ---');
    const { data: menuId, error: mErr } = await supabase.rpc('resolve_menu', {
        p_store_id: store.id,
        p_session_type: 'generic',
        p_table_id: null,
        p_bar_id: null
    });
    console.log('Resolved Menu ID:', menuId);
    if (mErr) console.error('Menu resolution error:', mErr);

    if (menuId) {
        console.log('\n--- TESTING GET_MENU_PRODUCTS ---');
        const { data: menuProducts, error: mpErr } = await supabase.rpc('get_menu_products', {
            p_menu_id: menuId
        });
        console.log('Menu Products Count:', menuProducts?.length || 0);
        if (mpErr) console.error('Menu products error:', mpErr);
        if (menuProducts) {
            console.log('Sample Menu Product Keys:', Object.keys(menuProducts[0] || {}));
            console.table(menuProducts.slice(0, 3).map(p => ({ name: p.name, image: p.image, image_url: p.image_url })));
        }
    }
}

inspectData();
