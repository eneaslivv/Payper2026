
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRealColumnsToFile() {
    const { data: p } = await supabase.from('products').select('*').limit(1);
    if (p && p[0]) {
        fs.writeFileSync('product_columns.txt', Object.keys(p[0]).join('\n'));
    }
}

checkRealColumnsToFile();
