
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function listTempFiles() {
    console.log('--- FILES IN product-images/temp ---');
    const { data: piTemp, error: piError } = await supabase.storage.from('product-images').list('temp');
    if (piError) console.error(piError);
    else console.log(JSON.stringify(piTemp.map(f => f.name), null, 2));

    console.log('--- FILES IN products/temp ---');
    const { data: pTemp, error: pError } = await supabase.storage.from('products').list('temp');
    if (pError) console.error(pError);
    else console.log(JSON.stringify(pTemp.map(f => f.name), null, 2));
}

listTempFiles();
