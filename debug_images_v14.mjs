
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    console.log('--- GLOBAL IMAGE CHECK (including empty strings) ---');

    const { data: products } = await supabase
        .from('products')
        .select('name, image, image_url, store_id')
        .limit(100);

    const pWithImages = products?.filter(p => (p.image && p.image !== '') || (p.image_url && p.image_url !== '')) || [];
    console.log(`Products with some image data: ${pWithImages.length}`);
    if (pWithImages.length > 0) console.table(pWithImages.slice(0, 5));

    const { data: invItems } = await supabase
        .from('inventory_items')
        .select('name, image, image_url, store_id')
        .limit(100);

    const iWithImages = invItems?.filter(p => (p.image && p.image !== '') || (p.image_url && p.image_url !== '')) || [];
    console.log(`Inventory Items with some image data: ${iWithImages.length}`);
    if (iWithImages.length > 0) console.table(iWithImages.slice(0, 5));
}

inspectData();
