import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initMonitoring, captureException } from "../_shared/monitoring.ts";
import { getMPAccessToken } from "../_shared/encrypted-secrets.ts";

const FUNCTION_NAME = 'verify-payment-status';
initMonitoring(FUNCTION_NAME);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { order_id } = await req.json();

        if (!order_id) {
            throw new Error('Missing order_id');
        }

        console.log(`[Verify] Checking status for Order ID: ${order_id}`);

        // 1. Get Order & Store Info
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('store_id, status, payment_status, total_amount')
            .eq('id', order_id)
            .single();

        if (orderError || !order) {
            throw new Error('Order not found');
        }

        // If already paid, return early (idempotency)
        if (order.status === 'paid' || order.payment_status === 'approved') {
            return new Response(JSON.stringify({
                success: true,
                status: 'approved',
                message: 'Order already paid locally'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            });
        }

        // 2. Get Store MP Token (encrypted)
        const accessToken = await getMPAccessToken(supabase, order.store_id);

        if (!accessToken) {
            throw new Error('Store MP Token not found');
        }

        // 3. Search Payment in Mercado Pago by External Reference (Order ID)
        const searchUrl = new URL('https://api.mercadopago.com/v1/payments/search');
        searchUrl.searchParams.append('external_reference', order_id);
        // Removed status filter to allow finding pending/in_process payments
        // searchUrl.searchParams.append('status', 'approved');

        console.log(`[Verify] Searching MP: ${searchUrl.toString()}`);

        const mpRes = await fetch(searchUrl.toString(), {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!mpRes.ok) {
            throw new Error(`MP API Error: ${mpRes.statusText}`);
        }

        const mpData = await mpRes.json();
        const payments = mpData.results || [];

        if (payments.length === 0) {
            // No approved payment found
            console.log(`[Verify] No approved payment found for ${order_id}`);
            return new Response(JSON.stringify({
                success: false,
                status: 'pending',
                message: 'Payment not found or not approved yet'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            });
        }

        // 4. Payment Found! Process it.
        // Use the most recent one if multiple exist
        const payment = payments[payments.length - 1]; // Results often sorted by date? Default is adequate.

        console.log(`[Verify] Found Payment ID: ${payment.id}, Status: ${payment.status}`);

        // CALL RPC TO UPDATE ORDER
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

        if (verifyError) {
            console.error('[RPC Error]', verifyError);
            throw verifyError;
        }

        return new Response(JSON.stringify({
            success: true,
            status: payment.status,
            data: verifyResult
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        });

    } catch (error: any) {
        console.error('[Verify] Error:', error.message);
        await captureException(error, req, FUNCTION_NAME);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400
        });
    }
});
