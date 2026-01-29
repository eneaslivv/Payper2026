
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectRow() {
    const { data: rows, error } = await supabase
        .from('orders')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error:', error);
        // Try to trigger a informative error
        const { error: err2 } = await supabase.from('orders').select('non_existent');
        console.log('Detailed error:', err2?.message);
    } else if (rows && rows.length > 0) {
        console.log('ALL KEYS:', Object.keys(rows[0]));
        console.log('ROW VALUES:', rows[0]);
    } else {
        console.log('Empty table. Trying to trigger column list error...');
        const { error: err2 } = await supabase.from('orders').select('non_existent');
        console.log('Detailed error:', err2?.message);
    }
}

inspectRow();
