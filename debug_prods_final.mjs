
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testProductsFinal() {
    const menuId = "20f818b9-a4f2-43c2-9026-df3f8bf9bbd0";
    const { data, error } = await supabase.rpc('get_menu_products', { p_menu_id: menuId });

    console.log('--- PRODUCTS for MENU ---');
    if (data) {
        data.forEach(p => {
            console.log(`- ${p.name} | Price: ${p.effective_price} | Image: ${p.image_url}`);
        });
    } else {
        console.log('No products found or error:', error);
    }
}

testProductsFinal();
