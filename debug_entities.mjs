
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkPanceta() {
    console.log('--- Searching products for Panceta ---');
    const { data: products, error: prodError } = await supabase
        .from('products')
        .select('id, name')
        .ilike('name', '%PANCETA%');

    if (prodError) {
        console.error('Error fetching products:', prodError);
    } else {
        console.log('Products matching "Panceta":', products);
    }

    console.log('\n--- Searching inventory_items for Panceta ---');
    const { data: invItems, error: invError } = await supabase
        .from('inventory_items')
        .select('id, name')
        .ilike('name', '%PANCETA%');

    if (invError) {
        console.error('Error fetching inventory items:', invError);
    } else {
        console.log('Inventory Items matching "Panceta":', invItems);
    }
}

checkPanceta();
