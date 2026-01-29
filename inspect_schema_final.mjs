
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
    let output = '';

    output += '--- ORDERS COLUMNS ---\n';
    const { data: cols1, error: err1 } = await supabase.rpc('get_table_columns', { table_name: 'orders' });
    if (cols1) output += JSON.stringify(cols1, null, 2) + '\n';
    else output += 'RPC failed: ' + err1?.message + '\n';

    output += '\n--- ORDER_ITEMS COLUMNS ---\n';
    const { data: cols2, error: err2 } = await supabase.rpc('get_table_columns', { table_name: 'order_items' });
    if (cols2) output += JSON.stringify(cols2, null, 2) + '\n';
    else output += 'RPC failed: ' + err2?.message + '\n';

    // If RPC failed, try a hacky select that might return columns in some environments or just try to get one row and log keys
    if (!cols1) {
        const { data: sample1 } = await supabase.from('orders').select('*').limit(1);
        if (sample1 && sample1.length > 0) output += 'Orders Keys: ' + Object.keys(sample1[0]).join(', ') + '\n';
    }
    if (!cols2) {
        const { data: sample2 } = await supabase.from('order_items').select('*').limit(1);
        if (sample2 && sample2.length > 0) output += 'OrderItems Keys: ' + Object.keys(sample2[0]).join(', ') + '\n';
    }

    fs.writeFileSync('schema_info.txt', output);
    console.log('Done');
}
inspect();
