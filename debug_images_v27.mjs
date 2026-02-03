
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: store } = await supabase.from('stores').select('id').eq('slug', 'test-ciro-enero').single();
    if (!store) return;

    // Check all products for this store
    const { data: products } = await supabase.from('products').select('name, image, image_url, id').eq('store_id', store.id);
    console.log(`--- PRODUCTS for "test-ciro-enero" ---`);
    if (products) {
        products.forEach(p => {
            if (p.image_url?.includes('unsplash') || p.image?.includes('unsplash')) {
                console.log(`[PLACEHOLDER] ${p.name}`);
            } else if (p.image_url || p.image) {
                console.log(`[CUSTOM IMAGE] ${p.name}: ${p.image_url || p.image}`);
            }
        });
    }
}

inspectData();
