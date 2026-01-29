
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function listColumns() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'products' });
    if (error) {
        console.log('RPC get_table_columns failed. Trying raw query via select...');
        // Try to trigger column list in error message
        const { error: err2 } = await supabase.from('products').select('non_existent');
        console.log('Error 1:', err2?.message);

        const { data: rows, error: err3 } = await supabase.from('products').select('*').limit(1);
        if (rows && rows.length > 0) {
            console.log('Columns from row:', Object.keys(rows[0]));
        } else {
            console.log('Table is empty.');
        }
    } else {
        console.log('Columns from RPC:', data);
    }
}

listColumns();
