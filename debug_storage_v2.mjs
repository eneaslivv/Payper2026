
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function listFiles() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    console.log('--- FILES IN products BUCKET ---');
    const { data: pFiles, error: pError } = await supabase.storage.from('products').list(storeId);
    if (pError) console.error('Error listing products:', pError);
    else console.log('Products files:', pFiles.map(f => f.name));

    console.log('--- FILES IN products/temp BUCKET ---');
    const { data: tFiles, error: tError } = await supabase.storage.from('products').list('temp');
    if (tError) console.error('Error listing temp:', tError);
    else console.log('Temp files:', tFiles.map(f => f.name));

    console.log('--- FILES IN product-images BUCKET ---');
    const { data: piFiles, error: piError } = await supabase.storage.from('product-images').list(storeId);
    if (piError) console.error('Error listing product-images:', piError);
    else console.log('Product-images files:', piFiles.map(f => f.name));

    console.log('--- FILES IN product-images/temp BUCKET ---');
    const { data: pitFiles, error: pitError } = await supabase.storage.from('product-images').list('temp');
    if (pitError) console.error('Error listing product-images/temp:', pitError);
    else console.log('Product-images temp files:', pitFiles.map(f => f.name));
}

listFiles();
