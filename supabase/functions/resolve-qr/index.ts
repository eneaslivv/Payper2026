import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Ratelimit } from 'https://cdn.skypack.dev/@upstash/ratelimit';
import { Redis } from 'https://cdn.skypack.dev/@upstash/redis';
import { initMonitoring, captureException } from '../_shared/monitoring.ts';

const FUNCTION_NAME = 'resolve-qr';
initMonitoring(FUNCTION_NAME);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Redis for Rate Limiting
const redis = new Redis({
    url: Deno.env.get('UPSTASH_REDIS_REST_URL')!,
    token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
});

const ratelimit = new Ratelimit({
    redis: redis,
    limiter: Ratelimit.slidingWindow(10, '60 s'), // 10 requests per 60s
    analytics: true,
});

Deno.serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { hash, source, userAgent } = await req.json();
        const clientIP = req.headers.get('x-forwarded-for') || 'anonymous';

        // 1. Check Rate Limit
        const { success, limit, reset, remaining } = await ratelimit.limit(clientIP);

        if (!success) {
            return new Response(
                JSON.stringify({ error: 'Too many requests', retryAfter: reset }),
                {
                    status: 429,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                }
            );
        }

        // 2. Initialize Supabase Client (Service Role for internal ops)
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // 3. Resolve QR
        const { data: qr, error: qrError } = await supabaseClient
            .from('qr_codes')
            .select('id, store_id, is_active, qr_type, table_id, bar_id, location_id, label')
            .eq('code_hash', hash)
            .maybeSingle();

        if (qrError || !qr) {
            return new Response(
                JSON.stringify({ error: 'QR not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        if (!qr.is_active) {
            return new Response(
                JSON.stringify({ error: 'QR inactive' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // 4. Get Store Data
        const { data: store } = await supabaseClient
            .from('stores')
            .select('id, slug, name')
            .eq('id', qr.store_id)
            .single();

        // 5. Log Scan & Create Session via RPC
        const { data: scanResult, error: scanError } = await supabaseClient.rpc('log_qr_scan', {
            p_qr_id: qr.id,
            p_source: source || 'camera',
            p_user_agent: userAgent || 'unknown',
            p_create_session: true
        });

        if (scanError) {
            console.error('Scan log error:', scanError);
        }

        return new Response(
            JSON.stringify({
                success: true,
                qr: qr,
                store: store,
                session: scanResult,
                ratelimit: { limit, remaining, reset }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        await captureException(error, req, FUNCTION_NAME);
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
});
