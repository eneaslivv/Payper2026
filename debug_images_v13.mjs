
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    // List all tables
    const { data: tables, error } = await supabase.rpc('get_tables');
    if (error) {
        console.log('RPC get_tables failed, fetching from information_schema via query if possible (not possible with anon key usually)');
        console.log('Attempting to fetch a few rows from common tables to verify structure');
    } else {
        console.log('Tables:', tables);
    }

    // Check products table structure
    const { data: pSample } = await supabase.from('products').select('*').limit(1);
    if (pSample && pSample.length > 0) {
        console.log('Product keys:', Object.keys(pSample[0]));
    }

    // Check inventory_items table structure
    const { data: iSample } = await supabase.from('inventory_items').select('*').limit(1);
    if (iSample && iSample.length > 0) {
        console.log('Inventory item keys:', Object.keys(iSample[0]));
    }
}

inspectData();
