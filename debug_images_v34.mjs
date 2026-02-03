
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: bucket, error } = await supabase.storage.getBucket('products');
    if (error) {
        console.error('Error getting bucket info:', error.message);
    } else {
        console.log('Bucket info:', JSON.stringify(bucket, null, 2));
    }

    const { data: bucket2, error: error2 } = await supabase.storage.getBucket('product-images');
    if (error2) {
        console.error('Error getting bucket info (product-images):', error2.message);
    } else {
        console.log('Bucket info (product-images):', JSON.stringify(bucket2, null, 2));
    }
}

inspectData();
