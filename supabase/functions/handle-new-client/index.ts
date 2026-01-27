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

        // 1. Get Store Details (Name)
        // We can use bare fetch to Rest API or assume store_name is passed?
        // Database triggers usually send row. Clients has store_id.
        // We need to fetch Store Name.

        const storeRes = await fetch(`${supabaseUrl}/rest/v1/stores?id=eq.${record.store_id}&select=name`, {
            headers: {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${supabaseAnonKey}`
            }
        });

        const stores = await storeRes.json();
        const storeName = stores?.[0]?.name || 'Tu Tienda';

        // 2. Generate HTML
        const emailHtml = generateWelcomeClientHtml({
            store_name: storeName,
            customer_name: record.name || 'Cliente',
            login_url: 'https://payper.io/' // Or store specific URL?
        });

        const subject = getWelcomeClientSubject({
            store_name: storeName,
            customer_name: record.name || 'Cliente',
            login_url: ''
        });

        // 3. Send Email via send-email function
        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseAnonKey}`
            },
            body: JSON.stringify({
                to: record.email,
                subject: subject,
                html: emailHtml
            })
        });

        const emailResult = await emailRes.json();

        if (!emailRes.ok) {
            throw new Error(emailResult.error || 'Failed to send email');
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
