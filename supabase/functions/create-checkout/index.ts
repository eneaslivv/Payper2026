import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { items, back_urls, external_reference, store_id } = await req.json();

        if (!items || !store_id) {
            throw new Error("Missing items or store_id");
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Get Store's Access Token
        const { data: store, error: storeError } = await supabase
            .from('stores')
            .select('mp_access_token')
            .eq('id', store_id)
            .single();

        if (storeError || !store?.mp_access_token) {
            throw new Error("Store not connected to Mercado Pago");
        }

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
            external_reference: external_reference,
            notification_url: `${supabaseUrl}/functions/v1/mp-webhook?store_id=${store_id}`,
            statement_descriptor: "PAYPER",
        };

        const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${store.mp_access_token}`
            },
            body: JSON.stringify(preferenceData)
        });

        const mpData = await mpResponse.json();

        if (!mpResponse.ok) {
            throw new Error(`MP Preference Error: ${mpData.message || 'Unknown error'}`);
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
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
