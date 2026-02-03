
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectMenuProducts() {
    const menuId = "5d100913-1a12-4099-974d-1579be406606";
    const { data: mps } = await supabase.from('menu_products').select('*, products(*)').eq('menu_id', menuId);

    console.log('Menu Products for Menu 5d100913:');
    mps.forEach(mp => {
        const prod = mp.products;
        console.log(`- ProductID: ${mp.product_id} | Name: ${prod?.name} | Image: ${prod?.image}`);
    });
}

inspectMenuProducts();
