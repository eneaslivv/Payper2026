
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function bootstrapMenuAndProducts() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    console.log('Bootstrapping menu for store:', storeId);

    // 1. Check if store exists
    const { data: store } = await supabase.from('stores').select('id').eq('id', storeId).single();
    if (!store) {
        console.error('Store not found!');
        return;
    }

    // 2. Create Menú General if missing
    let menuId;
    const { data: existingMenu } = await supabase.from('menus').select('id').eq('store_id', storeId).eq('name', 'Menú General').single();

    if (!existingMenu) {
        console.log('Creating Menú General...');
        const { data: newMenu, error: mErr } = await supabase.from('menus').insert({
            store_id: storeId,
            name: 'Menú General',
            slug: 'test-ciro-enero', // Link it to the store slug
            is_active: true,
            is_fallback: true
        }).select().single();
        if (mErr) {
            console.error('Error creating menu:', mErr);
            return;
        }
        menuId = newMenu.id;
    } else {
        menuId = existingMenu.id;
        console.log('Menu General already exists:', menuId);
    }

    // 3. Sync Products and link them
    const { data: ps } = await supabase.from('products').select('*').eq('store_id', storeId);
    console.log(`Linking ${ps.length} products...`);

    const fixUrl = (url) => {
        if (!url) return url;
        let fixed = url.replace(/\/product-images\//g, '/products/').replace(/\/public\/public\//g, '/public/');
        if (fixed.startsWith('/storage')) fixed = `${supabaseUrl}${fixed}`;
        return fixed;
    };

    for (const p of ps) {
        const imageUrl = fixUrl(p.image || p.image_url);

        // Update product URL and visibility
        await supabase.from('products').update({
            image: imageUrl,
            image_url: imageUrl,
            is_visible: true,
            updated_at: new Date().toISOString()
        }).eq('id', p.id);

        // Link to menu_products
        const { data: existingLink } = await supabase.from('menu_products').select('id').eq('menu_id', menuId).eq('product_id', p.id).single();
        if (!existingLink) {
            await supabase.from('menu_products').insert({
                menu_id: menuId,
                product_id: p.id,
                is_visible: true,
                sort_order: 0
            });
        } else {
            await supabase.from('menu_products').update({ is_visible: true }).eq('id', existingLink.id);
        }
    }

    console.log('Bootstrap and Linking Complete.');
}

bootstrapMenuAndProducts();
