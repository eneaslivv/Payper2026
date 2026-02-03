
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function finalFix() {
    const duplicateId = "aaaaaaaa-0000-0000-0000-000000000000";
    const activeStoreId = "f1097064-302b-4851-a532-2dc4f44e5736";
    const slug = "test-ciro-enero";

    console.log('--- FINAL FIX: SLUG CONFLICT & SYNC ---');

    // 1. Rename duplicate slug
    console.log('1. Renaming duplicate slug...');
    const { error: rErr } = await supabase.from('stores')
        .update({ slug: 'test-ciro-enero-deprecated' })
        .eq('id', duplicateId);

    if (rErr) {
        console.error('Error renaming duplicate:', rErr);
    } else {
        console.log('   Duplicate slug renamed.');
    }

    // 2. Ensure active store has the correct slug
    console.log('2. Ensuring active store slug is correct...');
    await supabase.from('stores').update({ slug }).eq('id', activeStoreId);

    // 3. Find/Fix Menu for active store
    console.log('3. Fixing Menu IDs and Links...');
    const { data: menus } = await supabase.from('menus').select('*').eq('store_id', activeStoreId);
    if (!menus || menus.length === 0) {
        console.log('   No menus found for active store. This is unexpected.');
    } else {
        // We found menus! Let's make the most relevant one fallback and active.
        const targetMenu = menus.find(m => m.is_active) || menus[0];
        console.log(`   Target Menu: ${targetMenu.name} (${targetMenu.id})`);

        await supabase.from('menus').update({ is_active: true, is_fallback: true }).eq('id', targetMenu.id);

        // 4. Link all products to this menu
        console.log('4. Linking Products to Menu...');
        const { data: ps } = await supabase.from('products').select('*').eq('store_id', activeStoreId);

        for (const p of ps) {
            // Standardize URL
            let imageUrl = p.image || p.image_url;
            if (imageUrl) {
                imageUrl = imageUrl.replace(/\/product-images\//g, '/products/').replace(/\/public\/public\//g, '/public/');
                if (imageUrl.startsWith('/storage')) imageUrl = `${supabaseUrl}${imageUrl}`;

                await supabase.from('products').update({
                    image: imageUrl,
                    image_url: imageUrl,
                    is_visible: true
                }).eq('id', p.id);
            }

            // Ensure link in menu_products
            const { data: link } = await supabase.from('menu_products').select('id').eq('menu_id', targetMenu.id).eq('product_id', p.id).single();
            if (!link) {
                await supabase.from('menu_products').insert({
                    menu_id: targetMenu.id,
                    product_id: p.id,
                    is_visible: true,
                    sort_order: 0
                });
            } else {
                await supabase.from('menu_products').update({ is_visible: true }).eq('id', link.id);
            }
        }
    }

    // 5. Verify resolution
    console.log('5. Verifying resolution...');
    const { data: resolved } = await supabase.rpc('resolve_menu', { p_slug: slug });
    console.log('   Resolve Menu Result:', resolved);

    if (resolved) {
        const { data: finalProds } = await supabase.rpc('get_menu_products', { p_menu_id: resolved.id });
        console.log(`   Final Product Count for Menu: ${finalProds?.length || 0}`);
    }

    console.log('--- FINAL FIX COMPLETE ---');
}

finalFix();
