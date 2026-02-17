
import { createClient } from '@supabase/supabase-js';
import { rateLimit, RATE_LIMITS } from '../lib/rateLimit.js';
import { validateMPWebhook } from '../lib/mercadoPagoSecurity.js';

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

    // Rate limiting - critical payment endpoint
    const clientIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.connection.remoteAddress || 'unknown';
    const rateLimitResult = await rateLimit(
        clientIP, 
        RATE_LIMITS.PAYMENT_VERIFICATION.limit, 
        RATE_LIMITS.PAYMENT_VERIFICATION.window, 
        'payment_verify'
    );

    res.set({
        'X-RateLimit-Limit': RATE_LIMITS.PAYMENT_VERIFICATION.limit,
        'X-RateLimit-Remaining': rateLimitResult.remaining,
        'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString()
    });

    if (!rateLimitResult.success) {
        console.warn(`[verify-payment] Rate limit exceeded for IP: ${clientIP}`);
        return res.status(429).json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)} seconds`,
            retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
        });
    }

    console.log('[verify-payment] ===== START =====');
    console.log('[verify-payment] Method:', req.method);
    console.log('[verify-payment] Body:', JSON.stringify(req.body));
    console.log('[verify-payment] Query:', JSON.stringify(req.query));
    console.log('[verify-payment] Headers:', JSON.stringify({
        'x-signature': req.headers['x-signature'],
        'x-signature-v1': req.headers['x-signature-v1'],
        'user-agent': req.headers['user-agent'],
        'x-forwarded-for': req.headers['x-forwarded-for']
    }));

    try {
        // Accept order_id from body OR external_reference from query (MP redirect)
        // Also accept payment_id for direct payment verification
        const order_id = req.body?.order_id || req.query?.external_reference;
        const payment_id = req.body?.payment_id || req.query?.payment_id;

        console.log('[verify-payment] Parsed - order_id:', order_id, 'payment_id:', payment_id);

        if (!order_id && !payment_id) {
            throw new Error('Missing order_id or payment_id');
        }

        // Initialize Supabase with SERVICE ROLE KEY (bypasses RLS for backend operations)
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        console.log('[verify-payment] Supabase URL:', supabaseUrl ? 'SET' : 'MISSING');
        console.log('[verify-payment] Service Key:', supabaseKey ? 'SET' : 'MISSING (will fallback to ANON)');

        // Fallback to anon key but log warning
        const finalKey = supabaseKey || process.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !finalKey) {
            console.error('[verify-payment] CRITICAL: Missing env vars');
            throw new Error('Server Misconfiguration: Missing Supabase credentials');
        }

        const supabase = createClient(supabaseUrl, finalKey);

        // 1. Get Order & Store Info
        console.log('[verify-payment] Step 1: Fetching order...');
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, store_id, status, payment_status, total_amount')
            .eq('id', order_id)
            .single();

        if (orderError) {
            console.error('[verify-payment] Order fetch error:', JSON.stringify(orderError));
            throw new Error('Order not found: ' + (orderError.message || orderError.code));
        }

        if (!order) {
            console.error('[verify-payment] Order is null for id:', order_id);
            throw new Error('Order not found (null result)');
        }

        console.log('[verify-payment] Order found:', JSON.stringify(order));

        // 2. Already Paid Check
        if (order.payment_status === 'approved' || order.payment_status === 'paid') {
            console.log('[verify-payment] Already paid, returning early');
            return res.status(200).json({ success: true, status: 'approved', message: 'Already paid' });
        }

        // 3. Get Store Token
        console.log('[verify-payment] Step 2: Fetching store MP token for store:', order.store_id);
        const { data: store, error: storeError } = await supabase
            .from('stores')
            .select('id, name, mp_access_token')
            .eq('id', order.store_id)
            .single();

        if (storeError) {
            console.error('[verify-payment] Store fetch error:', JSON.stringify(storeError));
            throw new Error('Store not found: ' + (storeError.message || storeError.code));
        }

        if (!store) {
            console.error('[verify-payment] Store is null for id:', order.store_id);
            throw new Error('Store not found (null result)');
        }

        console.log('[verify-payment] Store found:', store.name);

        if (!store.mp_access_token) {
            console.error('[verify-payment] Store has no MP token configured');
            throw new Error('Store MP Token not configured');
        }

        console.log('[verify-payment] MP Token found (length:', store.mp_access_token.length, ')');

        // 3.5. Webhook Signature Validation (if this request came from MP)
        const hasSignature = req.headers['x-signature'] || req.headers['x-signature-v1'];
        if (hasSignature) {
            console.log('[verify-payment] Webhook signature detected - validating...');
            
            // Use MP access token as webhook secret (MP default behavior)
            const webhookValidation = validateMPWebhook(req, store.mp_access_token);
            
            if (!webhookValidation.isValid) {
                console.error('[verify-payment] Webhook validation failed:', webhookValidation.errors);
                throw new Error('Invalid webhook signature: ' + webhookValidation.errors.join(', '));
            }

            if (webhookValidation.warnings.length > 0) {
                console.warn('[verify-payment] Webhook warnings:', webhookValidation.warnings);
            }

            console.log('[verify-payment] Webhook signature validated successfully');
            
            // Use validated payment ID from webhook
            if (webhookValidation.paymentId && !payment_id) {
                payment_id = webhookValidation.paymentId;
                console.log('[verify-payment] Using payment_id from validated webhook:', payment_id);
            }
        }

        // 4. Verify with Mercado Pago
        // Option A: If we have payment_id, fetch that specific payment
        // Option B: Search by external_reference (order_id)
        let payment = null;

        if (payment_id) {
            console.log('[verify-payment] Step 3A: Fetching specific payment:', payment_id);
            const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
                headers: { 'Authorization': `Bearer ${store.mp_access_token}` }
            });

            if (mpRes.ok) {
                payment = await mpRes.json();
                console.log('[verify-payment] Payment fetched:', payment.id, 'status:', payment.status);
            } else {
                const errorText = await mpRes.text();
                console.error('[verify-payment] MP fetch error:', mpRes.status, errorText);
            }
        }

        // Fallback: Search by external_reference
        if (!payment || payment.status !== 'approved') {
            console.log('[verify-payment] Step 3B: Searching MP by external_reference:', order_id);
            const searchUrl = new URL('https://api.mercadopago.com/v1/payments/search');
            searchUrl.searchParams.append('external_reference', order_id);
            searchUrl.searchParams.append('status', 'approved');

            const mpRes = await fetch(searchUrl.toString(), {
                headers: { 'Authorization': `Bearer ${store.mp_access_token}` }
            });

            if (!mpRes.ok) {
                const mpError = await mpRes.text();
                console.error('[verify-payment] MP Search Error:', mpRes.status, mpError);
                throw new Error(`MP API Error: ${mpRes.status}`);
            }

            const mpData = await mpRes.json();
            const payments = mpData.results || [];
            console.log('[verify-payment] MP search returned', payments.length, 'approved payments');

            if (payments.length > 0) {
                payment = payments[payments.length - 1];
            }
        }

        if (!payment || payment.status !== 'approved') {
            console.log('[verify-payment] No approved payment found');
            return res.status(200).json({ success: false, status: 'pending', message: 'Payment not approved yet' });
        }

        console.log('[verify-payment] Using payment:', payment.id, 'amount:', payment.transaction_amount);

        // 5. Update Database via RPC
        console.log('[verify-payment] Step 4: Calling verify_payment RPC...');
        const { data: verifyResult, error: verifyError } = await supabase.rpc('verify_payment', {
            p_mp_payment_id: payment.id.toString(),
            p_order_id: order_id,
            p_amount: payment.transaction_amount,
            p_status: payment.status,
            p_status_detail: payment.status_detail || 'accredited',
            p_payment_method: payment.payment_method_id || 'unknown',
            p_payment_type: payment.payment_type_id || 'unknown',
            p_payer_email: payment.payer?.email || '',
            p_date_approved: payment.date_approved || new Date().toISOString()
        });

        if (verifyError) {
            console.error('[verify-payment] RPC error:', JSON.stringify(verifyError));
            throw new Error('RPC failed: ' + (verifyError.message || verifyError.code));
        }

        console.log('[verify-payment] RPC result:', JSON.stringify(verifyResult));
        console.log('[verify-payment] ===== SUCCESS =====');

        return res.status(200).json({ success: true, status: 'approved', data: verifyResult });

    } catch (error) {
        console.error('[verify-payment] ===== ERROR =====');
        console.error('[verify-payment] Error:', error.message);
        console.error('[verify-payment] Stack:', error.stack);
        return res.status(400).json({ error: error.message });
    }
}
