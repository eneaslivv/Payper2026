
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function syncAndFix() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    console.log(`Starting sync for store: ${storeId}`);

    // 1. Fetch current state
    const { data: products } = await supabase.from('products').select('*').eq('store_id', storeId);
    const { data: inventory } = await supabase.from('inventory_items').select('*').eq('store_id', storeId);

    console.log(`Found ${products.length} products and ${inventory.length} inventory items.`);

    // 2. Fix bucket names in URLs for everything
    const fixBucket = (url) => {
        if (!url) return url;
        return url.replace(/\/product-images\//g, '/products/');
    };

    // 3. Match and Sync
    // Strategy: 
    // - If names match (case-insensitive), sync image and ensure inventory has correct name.
    // - If names don't match, we look at items like "holis" vs "DCECER"
    //   In the user's data: 
    //   "holis" in products is 4b42df12...
    //   "holis" in inventory is 93cd9acf...
    //   Wait, I saw DCECER in Products audit but not in Inventory audit.
    //   Let's check if DCECER in products should have been holis in inventory.

    for (const p of products) {
        const pNameLower = p.name.toLowerCase();
        const pImageFixed = fixBucket(p.image || p.image_url);

        // Exact match
        const exactMatch = inventory.find(i => i.name.toLowerCase() === pNameLower);

        if (exactMatch) {
            console.log(`Syncing exact match: ${p.name}`);
            // Update inventory image and name (normalization)
            await supabase.from('inventory_items').update({
                image_url: pImageFixed,
                name: p.name, // Ensure exact casing match
                updated_at: new Date().toISOString()
            }).eq('id', exactMatch.id);

            // Update product image and name
            await supabase.from('products').update({
                image: pImageFixed,
                image_url: pImageFixed,
                updated_at: new Date().toISOString()
            }).eq('id', p.id);
        } else {
            // No exact match. Let's look for items that match the OLD name if we can guess it.
            // For example, if DCECER (product) has no inventory match, maybe it was "holis"?
            // According to my debug_sync.mjs output:
            // PRODUCTS has: dcecer, holis, TEST, etc.
            // INVENTORY has: holis, test, etc.

            // If the user renamed holis to dcecer in the UI, they probably still have "holis" in inventory.
            // But I saw BOTH "dcecer" and "holis" in products?
            // Actually, let's look at the filenames in storage.
            // The file was 93cd9acf-93f5-4961-b31f-2a468850058b-... (which matches inventory item 93cd9acf)

            // If a product exists but no inventory item matches it, it's a "broken product-sellable bridge".
            console.warn(`No exact inventory match for product: ${p.name}`);
        }
    }

    // 4. Update all inventory items to use products bucket even if not matched
    for (const i of inventory) {
        const iImageFixed = fixBucket(i.image_url);
        if (iImageFixed !== i.image_url) {
            console.log(`Fixing bucket for inventory item: ${i.name}`);
            await supabase.from('inventory_items').update({
                image_url: iImageFixed,
                updated_at: new Date().toISOString()
            }).eq('id', i.id);
        }
    }

    console.log('Sync and bucket fix completed.');
}

syncAndFix();
