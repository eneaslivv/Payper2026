
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function correctStoreSync() {
    const storeId = "f1097064-3024-434e-a532-2dc4f44e573e";
    console.log(`Auditing CORRECT store: ${storeId}`);

    const { data: ps } = await supabase.from('products').select('*').eq('store_id', storeId);
    const { data: iis } = await supabase.from('inventory_items').select('*').eq('store_id', storeId);

    console.log(`Found ${ps.length} products and ${iis.length} inventory items.`);

    const fixUrl = (url) => {
        if (!url) return url;
        let fixed = url.replace(/\/product-images\//g, '/products/').replace(/\/public\/public\//g, '/public/');
        if (fixed.startsWith('/storage')) fixed = `${supabaseUrl}${fixed}`;
        return fixed;
    };

    for (const p of ps) {
        const ii = iis.find(i => i.name.toLowerCase().trim() === p.name.toLowerCase().trim());
        const imageUrl = fixUrl(p.image || p.image_url || ii?.image_url);

        console.log(`- syncing: ${p.name} | URL: ${imageUrl}`);

        // Update Product
        await supabase.from('products').update({
            image: imageUrl,
            image_url: imageUrl,
            is_visible: true,
            updated_at: new Date().toISOString()
        }).eq('id', p.id);

        // Update Inventory if match found
        if (ii) {
            await supabase.from('inventory_items').update({
                image_url: imageUrl,
                is_menu_visible: true,
                updated_at: new Date().toISOString()
            }).eq('id', ii.id);
        }
    }

    // Ensure there is a linked menu_product for each product
    const { data: menus } = await supabase.from('menus').select('id').eq('store_id', storeId);
    for (const menu of menus) {
        for (const p of ps) {
            const { data: existing } = await supabase.from('menu_products').select('id').eq('menu_id', menu.id).eq('product_id', p.id).single();
            if (!existing) {
                await supabase.from('menu_products').insert({ menu_id: menu.id, product_id: p.id, is_visible: true });
            } else {
                await supabase.from('menu_products').update({ is_visible: true }).eq('id', existing.id);
            }
        }
    }

    console.log('Correct Store Sync Done.');
}

correctStoreSync();
