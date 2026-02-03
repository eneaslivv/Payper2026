
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function findDiscrepancies() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    const { data: ps } = await supabase.from('products').select('id, name, sku, image').eq('store_id', storeId);
    const { data: iis } = await supabase.from('inventory_items').select('id, name, sku, image_url').eq('store_id', storeId);

    console.log('--- PRODUCTS (' + ps.length + ') ---');
    ps.forEach(p => console.log(`- ${p.name} (SKU: ${p.sku})`));

    console.log('--- INVENTORY_ITEMS (' + iis.length + ') ---');
    iis.forEach(i => console.log(`- ${i.name} (SKU: ${i.sku})`));

    console.log('--- POTENTIAL MATCHES BY ID (if same) ---');
    // In some systems, they might share IDs, but usually not here.
}

findDiscrepancies();
