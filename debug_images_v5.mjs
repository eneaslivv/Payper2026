
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    console.log('--- ALL STORES ---');
    const { data: stores, error: sError } = await supabase
        .from('stores')
        .select('name, slug');

    if (sError) console.error(sError);
    else console.table(stores);

    console.log('\n--- COLUMN CHECK ---');
    const { data: columns, error: cError } = await supabase.rpc('get_table_columns', { table_name: 'inventory_items' });
    if (cError) {
        // Fallback: try to select a single row to see keys
        const { data: row } = await supabase.from('inventory_items').select('*').limit(1);
        if (row && row.length > 0) {
            console.log('Columns in inventory_items:', Object.keys(row[0]));
        } else {
            console.log('Could not get columns, table might be empty');
        }
    } else {
        console.log('Columns:', columns);
    }
}

inspectData();
