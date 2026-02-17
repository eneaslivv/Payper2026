import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initMonitoring, captureException } from "../_shared/monitoring.ts";
import { getMPAccessToken } from "../_shared/encrypted-secrets.ts";
import { rateLimitMiddleware, getClientIdentifier, RATE_LIMITS } from "../_shared/rate-limiter.ts";

const FUNCTION_NAME = 'create-checkout';
initMonitoring(FUNCTION_NAME);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Rate limit: 30 payment attempts per minute per IP
    const identifier = getClientIdentifier(req);
    const rateLimitResponse = rateLimitMiddleware(identifier, RATE_LIMITS.payment);
    if (rateLimitResponse) return rateLimitResponse;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { items, back_urls, external_reference, store_id, order_id } = await req.json();

        if (!items || !store_id) {
            throw new Error("Missing items or store_id");
        }

        // 1. Get Store's Access Token (encrypted)
        const accessToken = await getMPAccessToken(supabase, store_id);

        if (!accessToken) {
            throw new Error("Store not connected to Mercado Pago");
        }

        // Calculate total amount
        const totalAmount = items.reduce((sum: number, item: any) =>
            sum + (Number(item.unit_price) * Number(item.quantity)), 0);

        // 2. Create Preference
        const preferenceData = {
            items: items.map((item: any) => ({
                title: item.title,
                quantity: Number(item.quantity),
                currency_id: 'ARS',
                unit_price: Number(item.unit_price)
            })),
            back_urls: back_urls,
            auto_return: 'approved',
            external_reference: external_reference || order_id,
            notification_url: `${supabaseUrl}/functions/v1/mp-webhook?store_id=${store_id}`,
            statement_descriptor: "PAYPER",
        };

        const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`
            },
            body: JSON.stringify(preferenceData)
        });

        const mpData = await mpResponse.json();

        if (!mpResponse.ok) {
            throw new Error(`MP Preference Error: ${mpData.message || 'Unknown error'}`);
        }

        // 3. Guardar payment_intent para trazabilidad
        if (order_id) {
            await supabase
                .from('payment_intents')
                .insert({
                    store_id: store_id,
                    order_id: order_id,
                    mp_preference_id: mpData.id,
                    external_reference: external_reference || order_id,
                    amount: totalAmount,
                    currency: 'ARS',
                    status: 'pending',
                    init_point: mpData.init_point,
                    expires_at: mpData.expires_date_from,
                    metadata: { items: items }
                });

            // Actualizar orden con payment_status
            await supabase
                .from('orders')
                .update({ payment_status: 'pending', payment_provider: 'mercadopago' })
                .eq('id', order_id);
        }

        return new Response(
            JSON.stringify({
                preference_id: mpData.id,
                checkout_url: mpData.init_point,
                sandbox_url: mpData.sandbox_init_point
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error("Create Checkout Error:", error);
        await captureException(error, req, FUNCTION_NAME);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
