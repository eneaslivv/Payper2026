import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initMonitoring, captureException } from "../_shared/monitoring.ts";

const FUNCTION_NAME = 'create-topup';
initMonitoring(FUNCTION_NAME);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    try {
        const { store_id, user_id, amount, back_urls } = await req.json();

        // 1. Validaciones
        if (!store_id || !user_id || !amount || amount <= 0) {
            throw new Error("Parámetros inválidos: store_id, user_id y amount requeridos");
        }

        // 2. Get Store MP Token (with potential refresh logic)
        const { data: store, error: storeError } = await supabase
            .from('stores')
            .select('mp_access_token, mp_refresh_token, mp_expires_at, name')
            .eq('id', store_id)
            .single();

        if (storeError || !store?.mp_access_token) {
            throw new Error("Store not connected to Mercado Pago");
        }

        // 2.1 Check token expiration and refresh if needed
        let accessToken = store.mp_access_token;

        if (store.mp_expires_at && new Date(store.mp_expires_at) < new Date()) {
            if (!store.mp_refresh_token) {
                throw new Error("MP token expired. Store needs to reconnect.");
            }

            const mpClientId = Deno.env.get('MP_CLIENT_ID');
            const mpClientSecret = Deno.env.get('MP_CLIENT_SECRET');

            if (mpClientId && mpClientSecret) {
                const refreshRes = await fetch("https://api.mercadopago.com/oauth/token", {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        grant_type: "refresh_token",
                        client_id: mpClientId,
                        client_secret: mpClientSecret,
                        refresh_token: store.mp_refresh_token
                    })
                });

                if (refreshRes.ok) {
                    const refreshData = await refreshRes.json();
                    accessToken = refreshData.access_token;

                    // Update tokens in DB
                    await supabase.from('stores').update({
                        mp_access_token: refreshData.access_token,
                        mp_refresh_token: refreshData.refresh_token,
                        mp_expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
                    }).eq('id', store_id);
                }
            }
        }

        // 3. Create pending transaction for tracking
        const { data: txn, error: txnError } = await supabase
            .from('wallet_transactions')
            .insert({
                store_id,
                user_id,
                wallet_id: null, // Will be set after wallet is created/found
                amount,
                type: 'topup_pending',
                description: `Recarga MP - $${amount}`
            })
            .select()
            .single();

        if (txnError) {
            console.error('Transaction Error:', txnError);
            throw new Error("Error al crear transacción pendiente");
        }

        // 4. Build back URLs with transaction reference
        const origin = back_urls?.success?.split('/m/')[0] || supabaseUrl;
        const defaultBackUrls = {
            success: `${origin}/m/default/wallet?status=success&txn=${txn.id}`,
            failure: `${origin}/m/default/wallet?status=failure&txn=${txn.id}`,
            pending: `${origin}/m/default/wallet?status=pending&txn=${txn.id}`
        };
        const finalBackUrls = back_urls || defaultBackUrls;

        // 5. Create MP Preference
        const preferenceData = {
            items: [{
                title: `Recarga de Saldo - ${store.name || 'Local'}`,
                unit_price: Number(amount),
                quantity: 1,
                currency_id: "ARS"
            }],
            external_reference: `topup_${txn.id}`,
            back_urls: finalBackUrls,
            auto_return: "approved",
            notification_url: `${supabaseUrl}/functions/v1/mp-webhook?store_id=${store_id}`
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
            console.error('MP Error:', mpData);
            throw new Error(`MP Preference Error: ${mpData.message || 'Unknown error'}`);
        }

        console.log(`Topup preference created: ${mpData.id} for user ${user_id}`);

        return new Response(
            JSON.stringify({
                preference_id: mpData.id,
                checkout_url: mpData.init_point,
                sandbox_url: mpData.sandbox_init_point,
                transaction_id: txn.id
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error: any) {
        console.error("Create Topup Error:", error);
        await captureException(error, req, FUNCTION_NAME);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
