
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectSchema() {
    const { data: cols, error } = await supabase.rpc('get_table_columns', { table_name: 'inventory_items' });
    if (error) {
        // Fallback: use select * limit 1
        const { data } = await supabase.from('inventory_items').select('*').limit(1);
        if (data && data.length > 0) {
            console.log('Columns:', Object.keys(data[0]).join(', '));
        }
    } else {
        console.log('Columns:', cols.map(c => c.column_name).join(', '));
    }
}

inspectSchema();
