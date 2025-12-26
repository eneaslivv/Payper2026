import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
    try {
        const url = new URL(req.url);
        const store_id = url.searchParams.get('store_id');
        const topic = url.searchParams.get('topic') || url.searchParams.get('type');

        // MP sends body with id: { action: ..., data: { id: ... } }
        const body = await req.json().catch(() => ({}));
        const id = body.data?.id || body.id || url.searchParams.get('id');

        console.log(`Webhook received: Store=${store_id}, Topic=${topic}, ID=${id}`);

        if (topic === 'payment' && id && store_id) {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            const supabase = createClient(supabaseUrl, supabaseServiceKey);

            // 1. Get Store Token
            const { data: store } = await supabase
                .from('stores')
                .select('mp_access_token')
                .eq('id', store_id)
                .single();

            if (store?.mp_access_token) {
                // 2. Fetch Payment from MP
                const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, {
                    headers: { 'Authorization': `Bearer ${store.mp_access_token}` }
                });

                if (mpRes.ok) {
                    const paymentData = await mpRes.json();
                    const externalRef = paymentData.external_reference; // This handles the Order ID
                    const status = paymentData.status;
                    const statusDetail = paymentData.status_detail;

                    // Map MP status to App status
                    let appStatus = 'pending';
                    if (status === 'approved') appStatus = 'paid';
                    else if (status === 'rejected' || status === 'cancelled') appStatus = 'cancelled';

                    console.log(`Updating Order ${externalRef} to ${appStatus}`);

                    // 3. Update Order
                    if (externalRef) {
                        await supabase
                            .from('orders')
                            .update({
                                status: appStatus,
                                payment_id: id.toString(),
                                paid_at: status === 'approved' ? new Date().toISOString() : null
                            })
                            .eq('id', externalRef);
                    }
                }
            }
        }

        return new Response(JSON.stringify({ received: true }), { status: 200 });
    } catch (error) {
        console.error("Webhook Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
});
