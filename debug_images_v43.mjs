
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    // Check inventory_items
    const { data: items } = await supabase.from('inventory_items').select('name, image_url').eq('store_id', storeId);
    console.log(`--- INVENTORY ITEMS ANALYSIS (${storeId}) ---`);
    if (items) {
        items.forEach(item => {
            if (item.image_url && item.image_url !== '') {
                const isCorrectStore = item.image_url.includes(storeId);
                const isCorrectBucket = item.image_url.includes('/public/products/');
                if (!isCorrectStore || !isCorrectBucket) {
                    console.log(`[BROKEN] ${item.name}: ${item.image_url}`);
                    console.log(`   - Wrong Store: ${!isCorrectStore}, Wrong Bucket: ${!isCorrectBucket}`);
                } else {
                    console.log(`[OK] ${item.name}`);
                }
            }
        });
    }

    // Check products
    const { data: products } = await supabase.from('products').select('name, image, image_url').eq('store_id', storeId);
    console.log(`--- PRODUCTS ANALYSIS (${storeId}) ---`);
    if (products) {
        products.forEach(p => {
            const img = p.image || p.image_url;
            if (img && img !== '') {
                const isCorrectStore = img.includes(storeId);
                const isCorrectBucket = img.includes('/public/products/');
                if (!isCorrectStore || !isCorrectBucket) {
                    console.log(`[BROKEN] ${p.name}: ${img}`);
                }
            }
        });
    }
}

inspectData();
