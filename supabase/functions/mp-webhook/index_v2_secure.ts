import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initMonitoring, captureException } from "../_shared/monitoring.ts";
import { getMPAccessToken } from "../_shared/encrypted-secrets.ts";
import { rateLimitMiddleware, getClientIdentifier, RATE_LIMITS } from "../_shared/rate-limiter.ts";

const FUNCTION_NAME = 'mp-webhook-v2';
initMonitoring(FUNCTION_NAME);

serve(async (req) => {
  try {
    // PART 1: Rate Limiting (P1-2 FIX)
    // =============================================
    const clientId = getClientIdentifier(req);
    const rateLimitResponse = rateLimitMiddleware(clientId, RATE_LIMITS.webhook);

    if (rateLimitResponse) {
      console.warn(`[${FUNCTION_NAME}] Rate limit exceeded for ${clientId}`);
      return rateLimitResponse; // 429 Too Many Requests
    }

    // PART 2: CORS Headers
    // =============================================
    if (req.method === 'OPTIONS') {
      return new Response('ok', {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        }
      });
    }

    // PART 3: Validate Webhook Payload
    // =============================================
    const payload = await req.json();

    if (!payload || !payload.data || !payload.data.id) {
      console.error('[mp-webhook] Invalid payload structure:', payload);
      return new Response(
        JSON.stringify({ error: 'INVALID_PAYLOAD', message: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const paymentId = payload.data.id;
    console.log(`[mp-webhook] Processing payment ${paymentId}`);

    // PART 4: Initialize Supabase Client
    // =============================================
    const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // PART 5: Get Order from External Reference
    // =============================================
    const externalRef = payload.external_reference;

    if (!externalRef) {
      console.error('[mp-webhook] Missing external_reference');
      return new Response(
        JSON.stringify({ error: 'MISSING_EXTERNAL_REFERENCE' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Extract order_id from external_reference (format: "ORDER_{order_id}")
    const orderId = externalRef.replace('ORDER_', '');

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, store_id, is_paid, total_amount')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('[mp-webhook] Order not found:', orderId, orderError);
      return new Response(
        JSON.stringify({ error: 'ORDER_NOT_FOUND', orderId }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // PART 6: Verify Payment with MP API (Using Encrypted Token)
    // =============================================
    const accessToken = await getMPAccessToken(supabase, order.store_id);

    if (!accessToken) {
      console.error('[mp-webhook] No access token for store:', order.store_id);
      return new Response(
        JSON.stringify({ error: 'MP_NOT_CONFIGURED', message: 'MercadoPago not connected for this store' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Fetch payment details from MP
    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!mpResponse.ok) {
      console.error('[mp-webhook] MP API error:', await mpResponse.text());
      return new Response(
        JSON.stringify({ error: 'MP_API_ERROR' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const payment = await mpResponse.json();

    // PART 7: Update Order Status
    // =============================================
    if (payment.status === 'approved' && !order.is_paid) {
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          is_paid: true,
          payment_status: 'approved',
          payment_id: paymentId,
          payment_method: payment.payment_method_id,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      if (updateError) {
        console.error('[mp-webhook] Failed to update order:', updateError);
        return new Response(
          JSON.stringify({ error: 'UPDATE_FAILED' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[mp-webhook] ✅ Order ${orderId} marked as paid`);

      // PART 8: Send Confirmation Email (TODO)
      // await sendPaymentConfirmationEmail(order, payment);

      return new Response(
        JSON.stringify({
          success: true,
          orderId,
          paymentId,
          status: 'approved'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Payment not approved or already processed
    return new Response(
      JSON.stringify({
        success: false,
        message: 'Payment not approved or already processed',
        status: payment.status,
        alreadyPaid: order.is_paid
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[mp-webhook] Unexpected error:', error);
    captureException(error);

    return new Response(
      JSON.stringify({
        error: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
});
