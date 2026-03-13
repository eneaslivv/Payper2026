import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initMonitoring, captureException } from "../_shared/monitoring.ts";
import { getMPAccessToken } from "../_shared/encrypted-secrets.ts";
import {
  generatePaymentRejectedHtml, getPaymentRejectedSubject,
  generatePaymentRefundedHtml, getPaymentRefundedSubject
} from "../_shared/email-templates.ts";

const FUNCTION_NAME = 'mp-webhook';
initMonitoring(FUNCTION_NAME);

interface MercadoPagoPayment {
  id: number | string;
  status: 'approved' | 'rejected' | 'refunded' | 'cancelled' | 'pending' | 'in_process';
  status_detail: string;
  external_reference: string;
  transaction_amount: number;
  currency_id: string;
  payment_method_id: string;
  payment_type_id: string;
  date_approved: string | null;
  payer?: { email: string };
  refunds?: Array<{ amount: number }>;
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const url = new URL(req.url);
    const store_id = url.searchParams.get('store_id');
    const topic = url.searchParams.get('topic') || url.searchParams.get('type');

    // Capturar body y headers
    const bodyText = await req.text();
    const body = bodyText ? JSON.parse(bodyText) : {};
    const headersObj: Record<string, string> = {};
    req.headers.forEach((v, k) => headersObj[k] = v);

    const id = body.data?.id || body.id || url.searchParams.get('id');
    const action = body.action || topic;
    const provider_event_id = body.id?.toString() || id?.toString();

    console.log(`Webhook: Store=${store_id}, Topic=${topic}, ID=${id}, Action=${action}`);

    // CRITICAL SECURITY: Validate MercadoPago HMAC signature
    const xSignature = req.headers.get('x-signature');
    const xRequestId = req.headers.get('x-request-id');

    if (xSignature && xRequestId) {
      const mpWebhookSecret = Deno.env.get('MP_WEBHOOK_SECRET');
      if (mpWebhookSecret) {
        try {
          // Extract ts from x-signature header (format: "ts=123,v1=hash")
          const parts = xSignature.split(',');
          const tsPart = parts.find(p => p.startsWith('ts='));
          const v1Part = parts.find(p => p.startsWith('v1='));

          if (tsPart && v1Part) {
            const ts = tsPart.split('=')[1];
            const receivedHash = v1Part.split('=')[1];

            // Generate expected signature: id;request-id;ts
            const template = `id:${id};request-id:${xRequestId};ts:${ts}`;

            const encoder = new TextEncoder();
            const keyData = encoder.encode(mpWebhookSecret);
            const messageData = encoder.encode(template);

            const cryptoKey = await crypto.subtle.importKey(
              'raw',
              keyData,
              { name: 'HMAC', hash: 'SHA-256' },
              false,
              ['sign']
            );

            const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
            const expectedHash = Array.from(new Uint8Array(signature))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');

            if (expectedHash !== receivedHash) {
              console.error('[SECURITY] Invalid MP signature');
              return new Response(JSON.stringify({ error: 'Invalid signature' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
              });
            }

            console.log('[SECURITY] MP signature validated');
          }
        } catch (err) {
          console.error('[SECURITY] Signature validation error:', err);
          // Continue anyway for backwards compatibility
        }
      }
    }

    // 1. ATOMIC webhook deduplication with INSERT ON CONFLICT
    const { data: webhookLog, error: webhookError } = await supabase
      .from('payment_webhooks')
      .insert({
        provider: 'mercadopago',
        provider_event_id: provider_event_id,
        topic: topic,
        action: action,
        payload_json: body,
        headers_json: headersObj,
        store_id: store_id ? store_id : null,
        processed: false
      })
      .select()
      .single();

    // If unique constraint violation = already processed
    if (webhookError?.code === '23505') {
      console.log(`[WEBHOOK] Already processed: ${provider_event_id}`);
      return new Response(JSON.stringify({
        success: true,
        message: 'Webhook already processed'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (webhookError) {
      console.error("Webhook log error:", webhookError);
      return new Response(JSON.stringify({ error: 'Webhook logging failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Procesar solo eventos de pago
    if (topic === 'payment' || action === 'payment.created' || action === 'payment.updated') {
      // Get encrypted MP access token
      const accessToken = await getMPAccessToken(supabase, store_id);

      if (accessToken) {
        // Fetch payment details from MP
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (mpRes.ok) {
          const p: MercadoPagoPayment = await mpRes.json();
          const externalRef = p.external_reference;

          console.log(`Payment ${id}: status=${p.status}, external_ref=${externalRef}`);

          // Fase 2 Plan L: Detectar si es recarga de saldo
          if (externalRef?.startsWith('topup_')) {
            // Es una recarga de saldo
            const txnId = externalRef.replace('topup_', '');
            console.log(`Processing wallet topup: txn=${txnId}, status=${p.status}`);

            const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet', {
              p_transaction_id: txnId,
              p_mp_payment_id: id.toString(),
              p_status: p.status
            });

            console.log('credit_wallet result:', creditResult, 'error:', creditError);

            // Marcar webhook como procesado
            if (webhookLog?.id) {
              await supabase
                .from('payment_webhooks')
                .update({
                  processed: true,
                  processed_at: new Date().toISOString(),
                  processing_result: creditError ? `Error: ${creditError.message}` : JSON.stringify(creditResult)
                })
                .eq('id', webhookLog.id);
            }
          } else if (externalRef) {
            // Es un pago de orden normal
            const orderId = externalRef;

            const { data: verifyResult, error: verifyError } = await supabase.rpc('verify_payment', {
              p_mp_payment_id: id.toString(),
              p_order_id: orderId,
              p_amount: p.transaction_amount,
              p_status: p.status,
              p_status_detail: p.status_detail,
              p_payment_method: p.payment_method_id,
              p_payment_type: p.payment_type_id,
              p_payer_email: p.payer?.email,
              p_date_approved: p.date_approved ? String(p.date_approved) : new Date().toISOString()
            });

            console.log('verify_payment result:', verifyResult, 'error:', verifyError);

            // ========================================
            // PHASE 1: EMAIL PAYMENT APPROVED
            // ========================================
            // MODIFICACIÓN SEGURIDAD: Ya no enviamos email directamente desde aquí.
            // Al llamar a verify_payment() arriba, la DB actualiza is_paid = true.
            // Un trigger en la tabla 'orders' (trg_after_payment_success) encola 
            // automáticamente el email en la tabla email_queue para un envío garantizado y seguro.
            // ========================================
            // ========================================

            // ========================================
            // EMAIL: PAYMENT REJECTED
            // ========================================
            if (p.status === 'rejected') {
              try {
                const { data: orderData } = await supabase
                  .from('orders')
                  .select(`id, order_number, total_amount, client:clients(id, email, full_name), store:stores(id, name, logo_url)`)
                  .eq('id', orderId)
                  .single();

                if (orderData?.client?.email) {
                  const storeName = orderData.store?.name || 'Tienda';
                  const storeLogoUrl = (orderData.store as any)?.logo_url || null;
                  const idempotencyKey = `payment_rejected_${id}_${orderId}`;
                  const { data: emailLogResult } = await supabase.rpc('create_email_log', {
                    p_store_id: store_id,
                    p_recipient_email: orderData.client.email,
                    p_recipient_name: orderData.client.full_name || null,
                    p_recipient_type: 'client',
                    p_event_type: 'payment.rejected',
                    p_event_id: id.toString(),
                    p_event_entity: 'payment',
                    p_template_key: 'payment_rejected',
                    p_payload_core: {
                      store_name: storeName,
                      customer_name: orderData.client.full_name || '',
                      order_number: orderData.order_number,
                      amount: p.transaction_amount,
                      currency: p.currency_id || 'ARS',
                      rejection_reason: p.status_detail || 'Pago rechazado'
                    },
                    p_idempotency_key: idempotencyKey,
                    p_triggered_by: 'webhook',
                    p_trigger_source: 'mp-webhook'
                  });

                  const logRow = emailLogResult?.[0];
                  if (logRow && !logRow.already_exists) {
                    const emailVars = {
                      store_name: storeName,
                      store_logo_url: storeLogoUrl,
                      customer_name: orderData.client.full_name || '',
                      order_number: orderData.order_number,
                      amount: p.transaction_amount,
                      currency: p.currency_id || 'ARS',
                      rejection_reason: p.status_detail || 'El pago fue rechazado'
                    };

                    const resendKey = Deno.env.get('RESEND_API_KEY') || '';
                    if (resendKey) {
                      const emailRes = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          from: `${storeName} <no-reply@payperapp.io>`,
                          to: orderData.client.email,
                          subject: getPaymentRejectedSubject(emailVars),
                          html: generatePaymentRejectedHtml(emailVars),
                          text: `Tu pago para el pedido #${orderData.order_number} no pudo ser procesado.`
                        })
                      });
                      const emailResult = await emailRes.json();
                      await supabase.rpc('update_email_log_status', {
                        p_log_id: logRow.log_id,
                        p_status: emailRes.ok ? 'sent' : 'failed',
                        p_resend_id: emailResult?.id || null,
                        p_resend_response: emailResult
                      });
                      console.log(`Rejected email ${emailRes.ok ? 'sent' : 'failed'} for payment ${id}`);
                    }
                  }
                }
              } catch (e) { console.error('Rejected email error:', (e as Error).message); }
            }

            // ========================================
            // EMAIL: PAYMENT REFUNDED
            // ========================================
            if (p.status === 'refunded' || p.status === 'cancelled') {
              try {
                const { data: orderData } = await supabase
                  .from('orders')
                  .select(`id, order_number, total_amount, client:clients(id, email, full_name), store:stores(id, name, logo_url)`)
                  .eq('id', orderId)
                  .single();

                if (orderData?.client?.email) {
                  const storeName = orderData.store?.name || 'Tienda';
                  const storeLogoUrl = (orderData.store as any)?.logo_url || null;
                  const idempotencyKey = `payment_refunded_${id}_${orderId}`;
                  const refundAmount = p.refunds?.[0]?.amount || p.transaction_amount;
                  const isPartial = refundAmount < p.transaction_amount;

                  const { data: emailLogResult } = await supabase.rpc('create_email_log', {
                    p_store_id: store_id,
                    p_recipient_email: orderData.client.email,
                    p_recipient_name: orderData.client.full_name || null,
                    p_recipient_type: 'client',
                    p_event_type: 'payment.refunded',
                    p_event_id: id.toString(),
                    p_event_entity: 'payment',
                    p_template_key: 'payment_refunded',
                    p_payload_core: {
                      store_name: storeName,
                      customer_name: orderData.client.full_name || '',
                      order_number: orderData.order_number,
                      refund_amount: refundAmount,
                      original_amount: p.transaction_amount,
                      is_partial: isPartial
                    },
                    p_idempotency_key: idempotencyKey,
                    p_triggered_by: 'webhook',
                    p_trigger_source: 'mp-webhook'
                  });

                  const logRow = emailLogResult?.[0];
                  if (logRow && !logRow.already_exists) {
                    const emailVars = {
                      store_name: storeName,
                      store_logo_url: storeLogoUrl,
                      customer_name: orderData.client.full_name || '',
                      order_number: orderData.order_number,
                      refund_amount: refundAmount,
                      original_amount: p.transaction_amount,
                      currency: p.currency_id || 'ARS',
                      is_partial: isPartial
                    };

                    const resendKey = Deno.env.get('RESEND_API_KEY') || '';
                    if (resendKey) {
                      const emailRes = await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          from: `${storeName} <no-reply@payperapp.io>`,
                          to: orderData.client.email,
                          subject: getPaymentRefundedSubject(emailVars),
                          html: generatePaymentRefundedHtml(emailVars),
                          text: `Se ha procesado un reembolso de $${refundAmount} para tu pedido #${orderData.order_number}.`
                        })
                      });
                      const emailResult = await emailRes.json();
                      await supabase.rpc('update_email_log_status', {
                        p_log_id: logRow.log_id,
                        p_status: emailRes.ok ? 'sent' : 'failed',
                        p_resend_id: emailResult?.id || null,
                        p_resend_response: emailResult
                      });
                      console.log(`Refund email ${emailRes.ok ? 'sent' : 'failed'} for payment ${id}`);
                    }
                  }
                }
              } catch (e) { console.error('Refund email error:', (e as Error).message); }
            }
            // ========================================

            // Marcar webhook como procesado
            if (webhookLog?.id) {
              await supabase
                .from('payment_webhooks')
                .update({
                  processed: true,
                  processed_at: new Date().toISOString(),
                  processing_result: verifyError ? `Error: ${verifyError.message}` : 'OK'
                })
                .eq('id', webhookLog.id);
            }
          }
        }
      }
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 });
  } catch (error) {
    console.error("Webhook Error:", (error as Error).message);
    await captureException(error, req, FUNCTION_NAME);
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500 });
  }
});
