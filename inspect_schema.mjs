
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectSchema() {
    console.log('--- Inspecting products table schema ---');
    const { data: columns, error } = await supabase
        .from('products')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching one product:', error);
    } else if (columns && columns.length > 0) {
        console.log('Available columns in products:', Object.keys(columns[0]));
    } else {
        console.log('Products table is empty, trying information_schema via RPC if possible or just schema introspection');
        // Let's try to query information_schema directly if permissions allow (unlikely for anon)
        // Instead, let's look at the generated types if available.
    }
}

inspectSchema();
