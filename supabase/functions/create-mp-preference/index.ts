import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { amount, description, client_id, store_id, type } = await req.json();

        if (!amount || !store_id) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: amount, store_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Get store's MP access token
        const { data: store, error: storeError } = await supabase
            .from('stores')
            .select('mp_access_token, name, slug')
            .eq('id', store_id)
            .single();

        if (storeError || !store?.mp_access_token) {
            return new Response(
                JSON.stringify({ error: 'Store not found or MercadoPago not connected' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // Generate unique transaction ID for wallet topup
        let externalReference = '';
        let backUrl = `https://www.payperapp.io/m/${store.slug}/profile`;

        if (type === 'balance_topup') {
            // Create a pending wallet transaction
            const { data: txn, error: txnError } = await supabase
                .from('wallet_transactions')
                .insert({
                    client_id: client_id,
                    store_id: store_id,
                    amount: amount,
                    type: 'topup',
                    status: 'pending',
                    payment_method: 'mercadopago',
                    description: description || 'Recarga de saldo'
                })
                .select('id')
                .single();

            if (txnError) {
                console.error('Failed to create wallet transaction:', txnError);
                return new Response(
                    JSON.stringify({ error: 'Failed to create transaction' }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
            }

            externalReference = `topup_${txn.id}`;
        }

        // Create MercadoPago preference
        const preferenceData = {
            items: [
                {
                    title: description || 'Recarga de saldo',
                    quantity: 1,
                    unit_price: amount,
                    currency_id: 'ARS'
                }
            ],
            external_reference: externalReference,
            back_urls: {
                success: backUrl,
                failure: backUrl,
                pending: backUrl
            },
            auto_return: 'approved',
            notification_url: `${supabaseUrl}/functions/v1/mp-webhook?store_id=${store_id}`,
            statement_descriptor: store.name?.substring(0, 22) || 'PAYPER'
        };

        const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${store.mp_access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(preferenceData)
        });

        if (!mpResponse.ok) {
            const mpError = await mpResponse.json();
            console.error('MercadoPago error:', mpError);
            return new Response(
                JSON.stringify({ error: 'MercadoPago error', details: mpError }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const preference = await mpResponse.json();

        return new Response(
            JSON.stringify({
                id: preference.id,
                init_point: preference.init_point,
                sandbox_init_point: preference.sandbox_init_point
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error('Error creating preference:', error);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
