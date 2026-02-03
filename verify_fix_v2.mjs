
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyFix() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";

    console.log(`--- VERIFYING FIX for ${storeId} ---`);

    const { data: products } = await supabase.from('products').select('name, image').eq('store_id', storeId);

    if (products) {
        for (const p of products) {
            if (p.image && p.image.includes(storeId)) {
                try {
                    const res = await fetch(p.image, { method: 'HEAD' });
                    console.log(`[VERIFIED] ${p.name}: ${res.status} ${res.statusText}`);
                } catch (e) {
                    console.log(`[FAILED] ${p.name}: ${e.message}`);
                }
            } else if (p.image) {
                console.log(`[SKIPPED] ${p.name}: External or non-store URL: ${p.image}`);
            }
        }
    }
}

verifyFix();
