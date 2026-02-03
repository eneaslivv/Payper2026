
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncAllFields() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    const { data: ps } = await supabase.from('products').select('*').eq('store_id', storeId);
    const { data: iis } = await supabase.from('inventory_items').select('*').eq('store_id', storeId);

    console.log(`Syncing ${ps.length} products with ${iis.length} inventory items...`);

    for (const p of ps) {
        // Try to find matching inventory item by name (using a more robust check)
        // Note: We already synced names in the previous step where possible, 
        // but let's be exhaustive.
        const ii = iis.find(i => i.name.toLowerCase().trim() === p.name.toLowerCase().trim());

        if (ii) {
            console.log(`- Matching: ${p.name}`);
            const imageUrl = p.image || p.image_url || ii.image_url;

            // Update Inventory Item to match Product perfectly
            await supabase.from('inventory_items').update({
                name: p.name,
                image_url: imageUrl,
                price: p.base_price,
                description: p.description,
                is_menu_visible: p.is_visible,
                updated_at: new Date().toISOString()
            }).eq('id', ii.id);

            // Ensure Product also has the correct standardized URL
            await supabase.from('products').update({
                image: imageUrl,
                image_url: imageUrl,
                updated_at: new Date().toISOString()
            }).eq('id', p.id);
        } else {
            console.warn(`- NO MATCH for product: ${p.name}`);
        }
    }
}

syncAllFields();
