import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { initMonitoring, captureException } from "../_shared/monitoring.ts";
import { storeMPTokens } from "../_shared/encrypted-secrets.ts";

const FUNCTION_NAME = 'mp-connect';
initMonitoring(FUNCTION_NAME);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { code, redirect_uri, store_id } = await req.json();

        if (!code || !redirect_uri || !store_id) {
            throw new Error("Missing required parameters: code, redirect_uri, or store_id");
        }

        // Initialize Supabase Client
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Call Mercado Pago OAuth API
        const mpTokenUrl = "https://api.mercadopago.com/oauth/token";
        const mpClientId = Deno.env.get('MERCADOPAGO_CLIENT_ID');
        const mpClientSecret = Deno.env.get('MERCADOPAGO_CLIENT_SECRET');

        if (!mpClientId || !mpClientSecret) {
            throw new Error("Server misconfiguration: Missing MP credentials");
        }

        console.log("Exchanging code for token with Redirect URI:", redirect_uri);

        const mpResponse = await fetch(mpTokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                client_secret: mpClientSecret,
                client_id: mpClientId,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirect_uri,
            }),
        });

        const mpData = await mpResponse.json();

        if (!mpResponse.ok) {
            console.error("MP Error:", mpData);
            throw new Error(`Mercado Pago Error: ${mpData.message || mpData.error}`);
        }

        // Store tokens encrypted
        await storeMPTokens(
            supabase,
            store_id,
            mpData.access_token,
            mpData.refresh_token,
            mpData.expires_in
        );

        // Update Store metadata (non-sensitive data)
        const { error: updateError } = await supabase
            .from('stores')
            .update({
                mp_public_key: mpData.public_key,
                mp_user_id: mpData.user_id.toString(),
                mp_nickname: "Mercado Pago User",
                mp_email: "noreply@payper.io",
                mp_connected_at: new Date().toISOString()
            })
            .eq('id', store_id);

        if (updateError) {
            throw new Error("Database Error: " + updateError.message);
        }

        return new Response(
            JSON.stringify({ success: true, message: "Account connected successfully" }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200,
            }
        );

    } catch (error: any) {
        console.error("Function Error:", error);
        await captureException(error, req, FUNCTION_NAME);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            }
        );
    }
});
