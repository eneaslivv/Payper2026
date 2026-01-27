import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initMonitoring, captureException } from "../_shared/monitoring.ts";

const FUNCTION_NAME = 'mp-webhook';
initMonitoring(FUNCTION_NAME);

// ============================================
// EMAIL TEMPLATE: Payment Approved
// ============================================
interface PaymentApprovedVars {
  store_name: string;
  store_logo_url?: string;
  customer_name: string;
  order_number: number;
  order_id: string;
  payment_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  date_approved: string;
  items?: Array<{ name: string; qty: number; price: number }>;
}

function generatePaymentApprovedHtml(vars: PaymentApprovedVars): string {
  const formattedAmount = `$${vars.amount.toLocaleString('es-AR')}`;
  const formattedDate = new Date(vars.date_approved).toLocaleString('es-AR');

  const itemsHtml = vars.items?.map(item => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
        <span style="color: #333;">${item.name}</span>
        <span style="color: #888; font-size: 12px;"> x${item.qty}</span>
      </td>
      <td style="padding: 8px 0; border-bottom: 1px solid #f0f0f0; text-align: right; color: #333;">
        $${(item.price * item.qty).toLocaleString('es-AR')}
      </td>
    </tr>
  `).join('') || '';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pago Confirmado - ${vars.store_name}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0 0 8px 0; color: white; font-size: 24px; font-weight: 700;">${vars.store_name}</h1>
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 50px; padding: 8px 20px;">
                <span style="color: white; font-size: 14px; font-weight: 600;">✓ Pago Confirmado</span>
              </div>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px 0; color: #111; font-size: 22px; font-weight: 700;">
                ¡Gracias por tu compra${vars.customer_name ? `, ${vars.customer_name.split(' ')[0]}` : ''}!
              </h2>
              <p style="margin: 0 0 24px 0; color: #666; font-size: 15px; line-height: 1.5;">
                Tu pago ha sido procesado exitosamente.
              </p>
              
              <!-- Order Details Card -->
              <div style="background: #f9fafb; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                <table role="presentation" style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 0 0 12px 0;">
                      <span style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Pedido</span>
                      <div style="color: #111; font-size: 18px; font-weight: 700;">#${vars.order_number}</div>
                    </td>
                    <td style="padding: 0 0 12px 0; text-align: right;">
                      <span style="color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Total</span>
                      <div style="color: #10b981; font-size: 24px; font-weight: 800;">${formattedAmount}</div>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding: 12px 0 0 0; border-top: 1px solid #e5e7eb;">
                      <table role="presentation" style="width: 100%;">
                        <tr>
                          <td style="color: #666; font-size: 13px;"><strong>Método:</strong> ${vars.payment_method}</td>
                          <td style="color: #666; font-size: 13px; text-align: right;"><strong>Fecha:</strong> ${formattedDate}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </div>
              
              ${vars.items && vars.items.length > 0 ? `
              <div style="margin-bottom: 24px;">
                <h3 style="margin: 0 0 12px 0; color: #333; font-size: 14px; font-weight: 600; text-transform: uppercase;">Detalle</h3>
                <table role="presentation" style="width: 100%; border-collapse: collapse;">${itemsHtml}</table>
              </div>
              ` : ''}
              
              <!-- Reference -->
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; text-align: center;">
                <span style="color: #166534; font-size: 12px;">Referencia: <strong>${vars.payment_id}</strong></span>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #888; font-size: 13px;">Comprobante automático de <strong>${vars.store_name}</strong></p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ============================================
// EMAIL TEMPLATE: Payment Rejected
// ============================================
interface PaymentRejectedVars {
  store_name: string;
  customer_name: string;
  order_number: number;
  amount: number;
  currency: string;
  rejection_reason?: string;
}

function generatePaymentRejectedHtml(vars: PaymentRejectedVars): string {
  const formattedAmount = `$${vars.amount.toLocaleString('es-AR')}`;
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0 0 8px 0; color: white; font-size: 24px; font-weight: 700;">${vars.store_name}</h1>
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 50px; padding: 8px 20px;">
                <span style="color: white; font-size: 14px; font-weight: 600;">✗ Pago No Procesado</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px 0; color: #111; font-size: 22px;">Hubo un problema con tu pago${vars.customer_name ? `, ${vars.customer_name.split(' ')[0]}` : ''}</h2>
              <p style="margin: 0 0 24px 0; color: #666; font-size: 15px;">No pudimos procesar el pago para tu pedido #${vars.order_number}.</p>
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; color: #991b1b; font-size: 14px;"><strong>Razón:</strong> ${vars.rejection_reason || 'El pago fue rechazado'}</p>
              </div>
              <div style="background: #f9fafb; border-radius: 8px; padding: 24px;">
                <table style="width: 100%;"><tr>
                  <td><span style="color: #888; font-size: 11px; text-transform: uppercase;">Pedido</span><div style="color: #111; font-size: 18px; font-weight: 700;">#${vars.order_number}</div></td>
                  <td style="text-align: right;"><span style="color: #888; font-size: 11px; text-transform: uppercase;">Monto</span><div style="color: #ef4444; font-size: 24px; font-weight: 800;">${formattedAmount}</div></td>
                </tr></table>
              </div>
            </td>
          </tr>
          <tr><td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;"><p style="margin: 0; color: #888; font-size: 13px;">Notificación de <strong>${vars.store_name}</strong></p></td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

// ============================================
// EMAIL TEMPLATE: Payment Refunded
// ============================================
interface PaymentRefundedVars {
  store_name: string;
  customer_name: string;
  order_number: number;
  refund_amount: number;
  original_amount: number;
  currency: string;
  is_partial: boolean;
}

function generatePaymentRefundedHtml(vars: PaymentRefundedVars): string {
  const formattedRefund = `$${vars.refund_amount.toLocaleString('es-AR')}`;
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0 0 8px 0; color: white; font-size: 24px; font-weight: 700;">${vars.store_name}</h1>
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 50px; padding: 8px 20px;">
                <span style="color: white; font-size: 14px; font-weight: 600;">↩ Reembolso ${vars.is_partial ? 'Parcial' : 'Completo'}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px 0; color: #111; font-size: 22px;">Hemos procesado tu reembolso${vars.customer_name ? `, ${vars.customer_name.split(' ')[0]}` : ''}</h2>
              <p style="margin: 0 0 24px 0; color: #666; font-size: 15px;">${vars.is_partial ? 'Reembolso parcial' : 'Reembolso completo'} de tu pedido #${vars.order_number}.</p>
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                <span style="color: #1e40af; font-size: 12px; text-transform: uppercase;">Monto Reembolsado</span>
                <div style="color: #1d4ed8; font-size: 28px; font-weight: 800;">${formattedRefund}</div>
              </div>
              <p style="color: #666; font-size: 13px;">El reembolso puede demorar 5-10 días hábiles según tu banco.</p>
            </td>
          </tr>
          <tr><td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;"><p style="margin: 0; color: #888; font-size: 13px;">Notificación de <strong>${vars.store_name}</strong></p></td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

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

    // 1. SIEMPRE guardar webhook raw (para debugging y reproducibilidad)
    const { data: webhookLog, error: webhookError } = await supabase
      .from('payment_webhooks')
      .insert({
        provider: 'mercadopago',
        provider_event_id: provider_event_id,
        topic: topic,
        action: action,
        payload_json: body,     // Fixed column name
        headers_json: headersObj, // Fixed column name
        store_id: store_id ? store_id : null, // Added store_id (requires migration)
        processed: false
      })
      .select()
      .single();

    if (webhookError) {
      console.error("Webhook log error:", webhookError);
      // Don't throw here, try to process anyway
    }

    // 2. Procesar solo eventos de pago
    if (topic === 'payment' || action === 'payment.created' || action === 'payment.updated') {
      // Obtener token del store
      const { data: store } = await supabase
        .from('stores')
        .select('mp_access_token')
        .eq('id', store_id)
        .single();

      if (store?.mp_access_token) {
        // Fetch payment details from MP
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
          headers: { 'Authorization': `Bearer ${store.mp_access_token}` }
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
                  .select(`id, order_number, total_amount, client:clients(id, email, full_name), store:stores(id, name)`)
                  .eq('id', orderId)
                  .single();

                if (orderData?.client?.email) {
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
                      store_name: orderData.store?.name || 'Tienda',
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
                    const html = generatePaymentRejectedHtml({
                      store_name: orderData.store?.name || 'Tienda',
                      customer_name: orderData.client.full_name || '',
                      order_number: orderData.order_number,
                      amount: p.transaction_amount,
                      currency: p.currency_id || 'ARS',
                      rejection_reason: p.status_detail || 'El pago fue rechazado'
                    });

                    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
                      },
                      body: JSON.stringify({
                        to: orderData.client.email,
                        subject: `⚠️ Pago no procesado - Pedido #${orderData.order_number} | ${orderData.store?.name || 'Tienda'}`,
                        html: html,
                        text: `Tu pago para el pedido #${orderData.order_number} no pudo ser procesado.`
                      })
                    });
                    const emailResult = await emailRes.json();
                    await supabase.rpc('update_email_log_status', {
                      p_log_id: logRow.log_id,
                      p_status: emailRes.ok ? 'sent' : 'failed',
                      p_resend_id: emailResult?.id || null,
                      p_resend_response: emailResult,
                      p_error_message: emailRes.ok ? null : 'Send failed'
                    });
                    console.log(`Rejected email ${emailRes.ok ? 'sent' : 'failed'} for payment ${id}`);
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
                  .select(`id, order_number, total_amount, client:clients(id, email, full_name), store:stores(id, name)`)
                  .eq('id', orderId)
                  .single();

                if (orderData?.client?.email) {
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
                      store_name: orderData.store?.name || 'Tienda',
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
                    const html = generatePaymentRefundedHtml({
                      store_name: orderData.store?.name || 'Tienda',
                      customer_name: orderData.client.full_name || '',
                      order_number: orderData.order_number,
                      refund_amount: refundAmount,
                      original_amount: p.transaction_amount,
                      currency: p.currency_id || 'ARS',
                      is_partial: isPartial
                    });

                    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` },
                      body: JSON.stringify({
                        to: orderData.client.email,
                        subject: `↩ Reembolso procesado - Pedido #${orderData.order_number} | ${orderData.store?.name || 'Tienda'}`,
                        html: html,
                        text: `Se ha procesado un reembolso de $${refundAmount} para tu pedido #${orderData.order_number}.`
                      })
                    });
                    const emailResult = await emailRes.json();
                    await supabase.rpc('update_email_log_status', {
                      p_log_id: logRow.log_id,
                      p_status: emailRes.ok ? 'sent' : 'failed',
                      p_resend_id: emailResult?.id || null,
                      p_resend_response: emailResult,
                      p_error_message: emailRes.ok ? null : 'Send failed'
                    });
                    console.log(`Refund email ${emailRes.ok ? 'sent' : 'failed'} for payment ${id}`);
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
