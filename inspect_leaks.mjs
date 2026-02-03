
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const envLocal = fs.readFileSync('.env.local', 'utf8');
const envConfig = dotenv.parse(envLocal);

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function checkLeaks() {
    console.log('--- CHECKING FOR LEAKS ---');

    // 1. Check order_items
    const { data: items, error: iError } = await supabase
        .from('order_items')
        .select('*')
        .limit(5);

    if (items && items.length > 0) {
        console.log('⚠️ ALERT: order_items are PUBLICLY VISIBLE!');
        console.log('First 5 items:', JSON.stringify(items, null, 2));
    } else {
        console.log('✅ order_items are secure (0 rows returned or error).');
    }

    // 2. Check RPC availability with constraints
    console.log('\n--- CHECKING RPC SIGNATURES ---');
    // confirm_order_delivery requires params: p_order_id, p_staff_id
    const { error: rpcError } = await supabase.rpc('confirm_order_delivery', {
        p_order_id: '00000000-0000-0000-0000-000000000000',
        p_staff_id: '00000000-0000-0000-0000-000000000000'
    });

    if (rpcError?.code === 'PGRST202') {
        console.log('❌ RPC confirm_order_delivery NOT FOUND (even with params)');
    } else if (rpcError) {
        console.log(`✅ RPC confirm_order_delivery EXISTS (Error was ${rpcError.code} - likely permission/logic, which is good)`);
        console.log('   Message:', rpcError.message);
    }

}

checkLeaks();
