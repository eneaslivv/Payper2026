import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { initMonitoring, captureException } from "../_shared/monitoring.ts";
import { generateInviteUserHtml, getInviteUserSubject } from "../_shared/email-templates.ts";

const FUNCTION_NAME = 'invite-user';
initMonitoring(FUNCTION_NAME);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    try {
        const supabaseClient = createClient(
            supabaseUrl,
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
        if (authError || !user) throw new Error('Not authenticated')

        const { email, role, siteUrl } = await req.json()

        if (!email || !role) {
            throw new Error('Email and Role are required')
        }

        // 1. Get current user's profile
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('store_id, role, full_name')
            .eq('id', user.id)
            .single()

        if (profileError || !profile || !profile.store_id) {
            throw new Error('User profile or store not found')
        }

        // 2. Validate Permissions
        const allowedRoles = ['owner', 'manager', 'admin', 'super_admin'];
        if (!allowedRoles.includes(profile.role)) {
            throw new Error('Authorized personnel only')
        }

        // 3. Get store name + logo
        const { data: store } = await supabaseClient
            .from('stores')
            .select('name, logo_url')
            .eq('id', profile.store_id)
            .single()

        // 4. Create Invitation
        const { data: invitation, error: inviteError } = await supabaseClient
            .from('team_invitations')
            .insert({
                store_id: profile.store_id,
                email,
                role,
                status: 'pending'
            })
            .select()
            .single()

        if (inviteError) throw inviteError

        // 5. Generate Link
        const origin = siteUrl || req.headers.get('origin') || 'https://payper.vercel.app';
        const link = `${origin}/join?token=${invitation.token}`;

        // 6. Send Email directly via Resend (avoids 401 inter-function auth issue)
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        const idempotencyKey = `invite_${invitation.id}`;
        const { data: emailLogResult } = await supabaseAdmin.rpc('create_email_log', {
            p_store_id: profile.store_id,
            p_recipient_email: email,
            p_recipient_name: null,
            p_recipient_type: 'staff',
            p_event_type: 'invite.sent',
            p_event_id: invitation.id,
            p_event_entity: 'invitation',
            p_template_key: 'invite_user',
            p_payload_core: {
                store_name: store?.name || 'Tienda',
                inviter_name: profile.full_name || 'Equipo',
                role: role,
                accept_url: link
            },
            p_idempotency_key: idempotencyKey,
            p_triggered_by: 'api',
            p_trigger_source: 'invite-user'
        });

        const logRow = emailLogResult?.[0];
        let emailSent = false;

        if (logRow && !logRow.already_exists) {
            const resendKey = Deno.env.get('RESEND_API_KEY') || '';
            if (resendKey) {
                const storeName = store?.name || 'Tienda';
                const emailVars = {
                    store_name: storeName,
                    store_logo_url: store?.logo_url || null,
                    inviter_name: profile.full_name || 'Equipo',
                    invited_role: role,
                    accept_url: link,
                    expires_in_days: 7
                };

                const resendRes = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: `${storeName} <no-reply@payperapp.io>`,
                        to: email,
                        subject: getInviteUserSubject(emailVars),
                        html: generateInviteUserHtml(emailVars),
                        text: `Has sido invitado a unirte a ${storeName} como ${role}. Acepta aquí: ${link}`
                    })
                });
                const resendResult = await resendRes.json();

                await supabaseAdmin.rpc('update_email_log_status', {
                    p_log_id: logRow.log_id,
                    p_status: resendRes.ok ? 'sent' : 'failed',
                    p_resend_id: resendResult?.id || null,
                    p_resend_response: resendResult
                });

                emailSent = resendRes.ok;
                console.log(`Invitation email ${resendRes.ok ? 'sent' : 'failed'} to ${email}`);
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                message: emailSent ? 'Invitation sent via email' : 'Invitation created (email skipped)',
                link: link,
                invitation
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error: any) {
        await captureException(error, req, FUNCTION_NAME);
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
