
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // CORS Configuration
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        const { order_id } = req.body;
        if (!order_id) throw new Error('Missing order_id');

        // Initialize Supabase (Using ANON key - the RPC is SECURITY DEFINER)
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Server Misconfiguration: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Get Order & Store Info
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('store_id, status, payment_status, total_amount')
            .eq('id', order_id)
            .single();

        if (orderError || !order) throw new Error('Order not found');

        // 2. Already Paid Check
        if (order.status === 'paid' || order.payment_status === 'approved') {
            return res.status(200).json({ success: true, status: 'approved', message: 'Already paid' });
        }

        // 3. Get Store Token
        const { data: store, error: storeError } = await supabase
            .from('stores')
            .select('mp_access_token')
            .eq('id', order.store_id)
            .single();

        if (storeError || !store?.mp_access_token) throw new Error('Store MP Token not found');

        // 4. Verify with Mercado Pago
        const searchUrl = new URL('https://api.mercadopago.com/v1/payments/search');
        searchUrl.searchParams.append('external_reference', order_id);
        searchUrl.searchParams.append('status', 'approved');

        const mpRes = await fetch(searchUrl.toString(), {
            headers: { 'Authorization': `Bearer ${store.mp_access_token}` }
        });

        if (!mpRes.ok) throw new Error(`MP API Error: ${mpRes.statusText}`);

        const mpData = await mpRes.json();
        const payments = mpData.results || [];

        if (payments.length === 0) {
            return res.status(200).json({ success: false, status: 'pending', message: 'Payment not found' });
        }

        const payment = payments[payments.length - 1];

        // 5. Update Database via RPC
        const { data: verifyResult, error: verifyError } = await supabase.rpc('verify_payment', {
            p_mp_payment_id: payment.id.toString(),
            p_order_id: order_id,
            p_amount: payment.transaction_amount,
            p_status: payment.status,
            p_status_detail: payment.status_detail,
            p_payment_method: payment.payment_method_id,
            p_payment_type: payment.payment_type_id,
            p_payer_email: payment.payer?.email,
            p_date_approved: payment.date_approved
        });

        if (verifyError) throw verifyError;

        return res.status(200).json({ success: true, status: payment.status, data: verifyResult });

    } catch (error) {
        console.error('Verify Payment Error:', error.message);
        return res.status(400).json({ error: error.message });
    }
}
