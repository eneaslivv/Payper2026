import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initMonitoring, captureException } from "../_shared/monitoring.ts";

const FUNCTION_NAME = 'process-email-queue';
initMonitoring(FUNCTION_NAME);

const BACKOFF_MINUTES = [1, 5, 30, 120]; // 1m, 5m, 30m, 2h

serve(async (req) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        // 1. Fetch pending emails that are ready for retry
        const { data: queueItems, error: fetchError } = await supabase
            .from('email_queue')
            .select('*')
            .eq('status', 'pending')
            .lte('next_retry_at', new Date().toISOString())
            .limit(10); // Process in small batches

        if (fetchError) throw fetchError;
        if (!queueItems || queueItems.length === 0) {
            return new Response(JSON.stringify({ message: "No pending emails" }), { status: 200 });
        }

        const results = [];

        for (const item of queueItems) {
            try {
                // 2. DOUBLE CHECK: Verify the order is still paid before sending
                const { data: order, error: orderError } = await supabase
                    .from('orders')
                    .select('is_paid, order_number, total_amount, items, store:stores(name, logo_url), client:clients(full_name)')
                    .eq('id', item.order_id)
                    .single();

                if (orderError || !order || !order.is_paid) {
                    console.warn(`Skipping email for order ${item.order_id}: Not paid or not found`);
                    await supabase.from('email_queue').update({ status: 'cancelled', last_error: 'Order not paid' }).eq('id', item.id);
                    continue;
                }

                // 3. Generate HTML payload (Simplified version or call template generator)
                // For now, we reuse the payload stored in the queue
                const emailBody = {
                    to: item.recipient,
                    subject: item.subject,
                    html: `<h1>Pedido #${order.order_number} Confirmado</h1><p>Gracias por tu compra en ${order.store?.name}. Total: $${order.total_amount}</p>`, // Basic fallback, in real use we'd reuse the template
                    text: `Tu pedido #${order.order_number} ha sido confirmado.`
                };

                // 4. Send via existing send-email function
                const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
                    },
                    body: JSON.stringify(emailBody)
                });

                const emailResult = await emailRes.json();

                if (emailRes.ok) {
                    // Success
                    await supabase
                        .from('email_queue')
                        .update({
                            status: 'sent',
                            attempts: item.attempts + 1,
                            last_error: null
                        })
                        .eq('id', item.id);
                    results.push({ id: item.id, status: 'sent' });
                } else {
                    throw new Error(emailResult.error || 'Failed to send');
                }

            } catch (err) {
                // 5. Backoff logic
                const attempts = item.attempts + 1;
                if (attempts >= BACKOFF_MINUTES.length) {
                    await supabase.from('email_queue').update({
                        status: 'failed',
                        attempts: attempts,
                        last_error: err.message
                    }).eq('id', item.id);
                    results.push({ id: item.id, status: 'failed', error: err.message });
                } else {
                    const nextRetry = new Date();
                    nextRetry.setMinutes(nextRetry.getMinutes() + BACKOFF_MINUTES[attempts]);
                    await supabase.from('email_queue').update({
                        attempts: attempts,
                        next_retry_at: nextRetry.toISOString(),
                        last_error: err.message
                    }).eq('id', item.id);
                    results.push({ id: item.id, status: 'retrying', attempt: attempts });
                }
            }
        }

        return new Response(JSON.stringify(results), { status: 200 });

    } catch (error) {
        console.error("Queue Processor Error:", error);
        await captureException(error, req, FUNCTION_NAME);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});
