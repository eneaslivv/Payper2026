
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function linkMenuProducts() {
    const storeId = "f5e3bfcf-3ccc-4464-9eb5-431fa6e26533";
    const menuId = "5d100913-1a12-4099-974d-1579be406606";

    // 1. Get all products for store
    const { data: ps } = await supabase.from('products').select('*').eq('store_id', storeId);
    console.log(`Linking ${ps.length} products to menu ${menuId}...`);

    for (const p of ps) {
        // Check if already linked
        const { data: existing } = await supabase.from('menu_products')
            .select('id')
            .eq('menu_id', menuId)
            .eq('product_id', p.id)
            .single();

        if (!existing) {
            console.log(`- Inserting link for ${p.name}`);
            await supabase.from('menu_products').insert({
                menu_id: menuId,
                product_id: p.id,
                is_visible: true,
                sort_order: 0
            });
        } else {
            console.log(`- Already linked: ${p.name}, ensuring visible.`);
            await supabase.from('menu_products').update({ is_visible: true }).eq('id', existing.id);
        }
    }

    console.log('Menu Linking Complete.');
}

linkMenuProducts();
