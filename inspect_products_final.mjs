
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectRaw() {
    // Try to query information_schema if enabled, or just select 1 row and log keys again with full clarity
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .limit(1);

    if (error) {
        console.error('ERROR:', error.message);
    } else if (data && data.length > 0) {
        console.log('--- PRODUCTS COLUMNS ---');
        Object.keys(data[0]).sort().forEach(k => console.log(`- ${k}`));
    } else {
        console.log('Products table is empty, creating a test select to see columns via error...');
        const { error: err2 } = await supabase.from('products').select('bogus_column');
        console.log('Error output:', err2?.message);
    }
}

inspectRaw();
