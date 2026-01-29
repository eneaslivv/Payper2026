
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectSchema() {
    const { data: columns, error } = await supabase
        .from('products')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error);
    } else {
        const keys = Object.keys(columns[0] || {});
        console.log('PRODUCTS COLUMNS:', JSON.stringify(keys));
        console.log('Has image?', keys.includes('image'));
        console.log('Has image_url?', keys.includes('image_url'));
    }
}

inspectSchema();
