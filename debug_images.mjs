
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    console.log('--- PRODUCTS ---');
    const { data: products, error: pError } = await supabase
        .from('products')
        .select('name, image, image_url')
        .limit(10);

    if (pError) console.error(pError);
    else console.table(products);

    console.log('\n--- INVENTORY ITEMS ---');
    const { data: invItems, error: iError } = await supabase
        .from('inventory_items')
        .select('name, image, image_url')
        .limit(10);

    if (iError) console.error(iError);
    else console.table(invItems);
}

inspectData();
