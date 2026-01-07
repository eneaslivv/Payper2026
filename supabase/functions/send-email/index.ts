import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { to, subject, html, text } = await req.json();

        if (!to || !subject || !html) {
            throw new Error("Missing required fields: to, subject, html");
        }

        const { data, error } = await resend.emails.send({
            from: "Payper <no-reply@payperapp.io>",
            to: Array.isArray(to) ? to : [to],
            subject: subject,
            html: html,
            text: text || "Email content not available in plain text.",
        });

        if (error) {
            console.error("Resend Error:", error);
            return new Response(JSON.stringify({ error: error }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify(data), {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Server Error:", error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
