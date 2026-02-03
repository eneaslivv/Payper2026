
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixData() {
    const correctStoreId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    const wrongStoreId = "f1097064-0706-4b30-b2b5-4851-a532-2dc4f44e536e";

    console.log(`--- DATA FIX STARTED for ${correctStoreId} ---`);

    // 1. Fix inventory_items
    const { data: items, error: fetchError } = await supabase
        .from('inventory_items')
        .select('id, name, image_url')
        .eq('store_id', correctStoreId);

    if (fetchError) {
        console.error('Error fetching items:', fetchError);
        return;
    }

    let itemFixCount = 0;
    for (const item of items) {
        if (item.image_url && (item.image_url.includes('product-images') || item.image_url.includes(wrongStoreId))) {
            const fixedUrl = item.image_url
                .replace('product-images', 'products')
                .replace(wrongStoreId, correctStoreId);

            console.log(`Fixing item ${item.name}: ${item.image_url} -> ${fixedUrl}`);

            const { error: updateError } = await supabase
                .from('inventory_items')
                .update({ image_url: fixedUrl })
                .eq('id', item.id);

            if (updateError) {
                console.error(`Error updating item ${item.name}:`, updateError);
            } else {
                itemFixCount++;
            }
        }
    }
    console.log(`Updated ${itemFixCount} inventory items.`);

    // 2. Fix products
    const { data: products, error: prodFetchError } = await supabase
        .from('products')
        .select('id, name, image, image_url')
        .eq('store_id', correctStoreId);

    if (prodFetchError) {
        console.error('Error fetching products:', prodFetchError);
        return;
    }

    let prodFixCount = 0;
    for (const p of products) {
        const updates = {};
        let needsUpdate = false;

        const checkAndFix = (val) => {
            if (val && (val.includes('product-images') || val.includes(wrongStoreId))) {
                needsUpdate = true;
                return val.replace('product-images', 'products').replace(wrongStoreId, correctStoreId);
            }
            return val;
        };

        const fixedImage = checkAndFix(p.image);
        const fixedImageUrl = checkAndFix(p.image_url);

        if (needsUpdate) {
            console.log(`Fixing product ${p.name}`);
            const { error: updateError } = await supabase
                .from('products')
                .update({ image: fixedImage, image_url: fixedImageUrl })
                .eq('id', p.id);

            if (updateError) {
                console.error(`Error updating product ${p.name}:`, updateError);
            } else {
                prodFixCount++;
            }
        }
    }
    console.log(`Updated ${prodFixCount} products.`);

    console.log('--- DATA FIX COMPLETED ---');
}

fixData();
