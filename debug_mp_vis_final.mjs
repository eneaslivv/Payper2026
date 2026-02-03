
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectMPVisibilityFinal() {
    const menuId = "5d100913-1a12-4099-974d-1579be406606";
    const { data: mps } = await supabase.from('menu_products').select('*, products(name, is_visible, image)').eq('menu_id', menuId);

    console.log('--- menu_products Visibility Audit ---');
    mps.forEach(mp => {
        console.log(`- MP visible: ${mp.is_visible} | Prod: ${mp.products?.name} | Prod visible: ${mp.products?.is_visible} | Img: ${mp.products?.image}`);
    });
}

inspectMPVisibilityFinal();
