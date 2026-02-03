
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function surgicalFix() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    const menuSlug = "test-ciro-enero";

    console.log('--- SURGICAL FIX START ---');

    // 1. Fix the Menu
    console.log('1. Fixing Menu Link...');
    const { data: menuData } = await supabase.from('menus')
        .update({ store_id: storeId, is_active: true, is_fallback: true })
        .eq('slug', menuSlug)
        .select();

    if (menuData && menuData.length > 0) {
        const menuId = menuData[0].id;
        console.log(`   Menu ${menuId} successfully linked to store.`);

        // 2. Fix Categories (ensure they exist and are visible)
        console.log('2. Auditing Categories...');
        const { data: cats } = await supabase.from('categories').select('id, name').eq('store_id', storeId);
        if (cats) {
            for (const c of cats) {
                // If column is_menu_visible exists (might be null if column missing, but let's try)
                await supabase.from('categories').update({ is_menu_visible: true }).eq('id', c.id);
            }
        }

        // 3. Fix Products & Inventory
        console.log('3. Syncing Products & Inventory...');
        const { data: ps } = await supabase.from('products').select('*').eq('store_id', storeId);
        const { data: iis } = await supabase.from('inventory_items').select('*').eq('store_id', storeId);

        const fixUrl = (url) => {
            if (!url) return url;
            let fixed = url.replace(/\/product-images\//g, '/products/').replace(/\/public\/public\//g, '/public/');
            if (fixed.startsWith('/storage')) fixed = `${supabaseUrl}${fixed}`;
            return fixed;
        };

        for (const p of ps) {
            const ii = iis.find(i => i.name.toLowerCase().trim() === p.name.toLowerCase().trim());
            const imageUrl = fixUrl(p.image || p.image_url || ii?.image_url);

            console.log(`   - Link: ${p.name}`);

            // Update Product
            await supabase.from('products').update({
                image: imageUrl,
                image_url: imageUrl,
                is_visible: true,
                is_available: true,
                updated_at: new Date().toISOString()
            }).eq('id', p.id);

            // Update Inventory
            if (ii) {
                await supabase.from('inventory_items').update({
                    image_url: imageUrl,
                    is_menu_visible: true,
                    updated_at: new Date().toISOString()
                }).eq('id', ii.id);
            }

            // Ensure linked in menu_products
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
    } else {
        console.error('Menu with slug test-ciro-enero NOT FOUND.');
    }

    console.log('--- SURGICAL FIX COMPLETE ---');
}

surgicalFix();
