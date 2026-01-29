
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
    // We already know products column names. 
    // Now just for ORDERS.
    const { data, error } = await supabase.from('orders').select('*').limit(1);
    if (error) {
        console.error('ERROR:', error.message);
        // Force error to see columns 
        const { error: err2 } = await supabase.from('orders').select('no_col');
        console.log('COLUMNS_LIST:', err2?.message);
    } else if (data && data.length > 0) {
        console.log('KEYS:');
        Object.keys(data[0]).sort().forEach(k => console.log(k));
    } else {
        const { error: err2 } = await supabase.from('orders').select('no_col');
        console.log('COLUMNS_LIST:', err2?.message);
    }
}
inspect();
