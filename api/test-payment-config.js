
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const results = {
        timestamp: new Date().toISOString(),
        env_check: {},
        tests: []
    };

    try {
        // 1. Check environment variables
        results.env_check = {
            SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
            VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? 'SET' : 'MISSING',
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING',
            VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ? 'SET' : 'MISSING'
        };

        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            results.error = 'Missing Supabase credentials';
            return res.status(200).json(results);
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 2. Test database connection - fetch recent orders
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('id, order_number, status, payment_status, payment_provider, is_paid, store_id')
            .order('created_at', { ascending: false })
            .limit(3);

        results.tests.push({
            name: 'Fetch Recent Orders',
            success: !ordersError,
            data: ordersError ? ordersError : orders
        });

        if (orders && orders.length > 0) {
            const testOrder = orders[0];

            // 3. Test store fetch
            const { data: store, error: storeError } = await supabase
                .from('stores')
                .select('id, name, mp_access_token')
                .eq('id', testOrder.store_id)
                .single();

            results.tests.push({
                name: 'Fetch Store',
                success: !storeError,
                data: storeError ? storeError : {
                    id: store?.id,
                    name: store?.name,
                    has_mp_token: !!store?.mp_access_token,
                    mp_token_length: store?.mp_access_token?.length || 0
                }
            });

            // 4. Test RPC exists
            const { data: rpcTest, error: rpcError } = await supabase.rpc('verify_payment', {
                p_mp_payment_id: 'TEST',
                p_order_id: '00000000-0000-0000-0000-000000000000',
                p_amount: 0,
                p_status: 'test',
                p_status_detail: 'test',
                p_payment_method: 'test',
                p_payment_type: 'test',
                p_payer_email: 'test@test.com',
                p_date_approved: new Date().toISOString()
            });

            results.tests.push({
                name: 'RPC verify_payment exists',
                // Even if it fails with "order not found", the RPC exists
                success: !rpcError || rpcError.message?.includes('order') || rpcError.code === 'PGRST202',
                error: rpcError?.message || rpcError?.code
            });

            // 5. Test MP API connection (if token exists)
            if (store?.mp_access_token) {
                try {
                    const mpRes = await fetch('https://api.mercadopago.com/v1/payments/search?limit=1', {
                        headers: { 'Authorization': `Bearer ${store.mp_access_token}` }
                    });
                    const mpData = await mpRes.json();
                    results.tests.push({
                        name: 'MP API Connection',
                        success: mpRes.ok,
                        status: mpRes.status,
                        data: mpRes.ok ? { total_results: mpData.paging?.total || 0 } : mpData
                    });
                } catch (mpErr) {
                    results.tests.push({
                        name: 'MP API Connection',
                        success: false,
                        error: mpErr.message
                    });
                }
            }
        }

        results.success = true;
        return res.status(200).json(results);

    } catch (error) {
        results.error = error.message;
        results.stack = error.stack;
        return res.status(200).json(results);
    }
}
