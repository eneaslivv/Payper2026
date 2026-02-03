
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function absoluteFinalSync() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    const menuId = "5d100913-1a12-4099-974d-1579be406606";

    // 1. Fetch current state
    const { data: ps } = await supabase.from('products').select('*').eq('store_id', storeId);
    const { data: iis } = await supabase.from('inventory_items').select('*').eq('store_id', storeId);

    console.log(`Auditing ${ps.length} products for full sync...`);

    const fixUrl = (url) => {
        if (!url) return url;
        // Fix bucket and clean up public paths
        let fixed = url.replace(/\/product-images\//g, '/products/').replace(/\/public\/public\//g, '/public/');
        // If it starts with /storage, prepend supabaseUrl
        if (fixed.startsWith('/storage')) fixed = `${supabaseUrl}${fixed}`;
        return fixed;
    };

    for (const p of ps) {
        // Find matching inventory item by name
        const ii = iis.find(i => i.name.toLowerCase().trim() === p.name.toLowerCase().trim());
        const imageUrl = fixUrl(p.image || p.image_url || ii?.image_url);

        console.log(`- Item: ${p.name} | URL: ${imageUrl}`);

        // Update Product Table
        await supabase.from('products').update({
            image: imageUrl,
            image_url: imageUrl,
            is_visible: true,
            updated_at: new Date().toISOString()
        }).eq('id', p.id);

        // Update Inventory Table
        if (ii) {
            await supabase.from('inventory_items').update({
                image_url: imageUrl,
                is_menu_visible: true,
                updated_at: new Date().toISOString()
            }).eq('id', ii.id);
        }

        // Update Menu Products Table (Explicitly forcing visibility for this menu)
        await supabase.from('menu_products').update({
            is_visible: true
        }).eq('menu_id', menuId).eq('product_id', p.id);
    }

    console.log('Absolute Final Sync Complete.');
}

absoluteFinalSync();
