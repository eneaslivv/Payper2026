import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
                payload: body,
                headers: headersObj,
                store_id: store_id,
                processed: false
            })
            .select()
            .single();

        if (webhookError) {
            console.error("Webhook log error:", webhookError);
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
                    const p = await mpRes.json();
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
                            p_date_approved: p.date_approved
                        });

                        console.log('verify_payment result:', verifyResult, 'error:', verifyError);

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
    } catch (error: any) {
        console.error("Webhook Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});
