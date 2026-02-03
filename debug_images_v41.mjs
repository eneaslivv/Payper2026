
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    for (const bucket of ['products', 'product-images']) {
        const { data, error } = await supabase.storage.from(bucket).list(storeId);
        console.log(`--- BUCKET: ${bucket} ---`);
        if (error) {
            console.error(`Error: ${error.message}`);
        } else {
            console.log(`Files count: ${data.length}`);
            if (data.length > 0) {
                console.log(JSON.stringify(data, null, 2));
            }
        }
    }
}

inspectData();
