import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateWelcomeClientHtml, getWelcomeClientSubject } from "../_shared/email-templates.ts";
import { initMonitoring, captureException } from "../_shared/monitoring.ts";

const FUNCTION_NAME = 'handle-new-client';
initMonitoring(FUNCTION_NAME);

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
    }

    try {
        const payload = await req.json();
        const record = payload.record; // from database webhook

        if (!record || !record.email || !record.store_id) {
            console.log('Missing record data:', record);
            return new Response(JSON.stringify({ error: 'Missing data' }), { status: 400 });
        }

        // 1. Get Store Details (Name + Logo)
        const storeRes = await fetch(`${supabaseUrl}/rest/v1/stores?id=eq.${record.store_id}&select=name,logo_url`, {
            headers: {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`
            }
        });

        const stores = await storeRes.json();
        const storeName = stores?.[0]?.name || 'Tu Tienda';
        const storeLogoUrl = stores?.[0]?.logo_url || null;

        // 2. Generate HTML with unified template
        const emailVars = {
            store_name: storeName,
            store_logo_url: storeLogoUrl,
            customer_name: record.name || 'Cliente',
            login_url: 'https://payperapp.io/'
        };

        const emailHtml = generateWelcomeClientHtml(emailVars);
        const subject = getWelcomeClientSubject(emailVars);

        // 3. Send Email directly via Resend (avoids 401 inter-function auth issue)
        const resendKey = Deno.env.get('RESEND_API_KEY') || '';
        if (!resendKey) {
            throw new Error('RESEND_API_KEY not configured');
        }

        const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: `${storeName} <no-reply@payperapp.io>`,
                to: record.email,
                subject: subject,
                html: emailHtml
            })
        });

        const emailResult = await emailRes.json();

        if (!emailRes.ok) {
            throw new Error(JSON.stringify(emailResult) || 'Failed to send email');
        }

        return new Response(JSON.stringify({ success: true, id: emailResult.id }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        await captureException(error, req, FUNCTION_NAME);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
