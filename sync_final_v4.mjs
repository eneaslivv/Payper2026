
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function finalSync() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    const { data: ps } = await supabase.from('products').select('*').eq('store_id', storeId);
    const { data: iis } = await supabase.from('inventory_items').select('*').eq('store_id', storeId);

    console.log(`Syncing ${ps.length} products...`);

    const fixUrl = (url) => {
        if (!url) return url;
        // Ensure products bucket and no double public
        return url.replace(/\/product-images\//g, '/products/').replace(/\/public\/public\//g, '/public/');
    };

    for (const p of ps) {
        const ii = iis.find(i => i.name.toLowerCase().trim() === p.name.toLowerCase().trim());
        const imageUrl = fixUrl(p.image || p.image_url || ii?.image_url);

        if (ii) {
            console.log(`- Syncing matched: ${p.name}`);
            await supabase.from('inventory_items').update({
                name: p.name,
                image_url: imageUrl,
                price: p.base_price,
                description: p.description,
                is_menu_visible: true, // Force visible if listed in products
                updated_at: new Date().toISOString()
            }).eq('id', ii.id);
        }

        // Always update product to ensure correct standardized URL
        await supabase.from('products').update({
            image: imageUrl,
            image_url: imageUrl,
            is_visible: true,
            updated_at: new Date().toISOString()
        }).eq('id', p.id);
    }

    console.log('Final Sync Done.');
}

finalSync();
