
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspect() {
    let output = '';

    output += '--- ORDERS ---\n';
    const { error: err1 } = await supabase.from('orders').select('no_col');
    output += (err1?.message || 'No error?') + '\n\n';

    output += '--- ORDER_ITEMS ---\n';
    const { error: err2 } = await supabase.from('order_items').select('no_col');
    output += (err2?.message || 'No error?') + '\n\n';

    fs.writeFileSync('schema_dump.txt', output);
    console.log('Done');
}
inspect();
