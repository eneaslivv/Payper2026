
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function listStoreFiles() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    console.log(`--- FILES IN product-images/${storeId} ---`);
    const { data: files, error } = await supabase.storage.from('product-images').list(storeId);
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Files:', JSON.stringify(files.map(f => f.name), null, 2));
    }

    console.log(`--- FILES IN products/${storeId} ---`);
    const { data: pFiles, error: pError } = await supabase.storage.from('products').list(storeId);
    if (pError) {
        console.error('Error:', pError);
    } else {
        console.log('Files:', JSON.stringify(pFiles.map(f => f.name), null, 2));
    }
}

listStoreFiles();
