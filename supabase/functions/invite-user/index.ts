import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Email Template: User Invitation
function generateInviteHtml(vars: { store_name: string; inviter_name: string; role: string; accept_url: string }): string {
    const roleMap: Record<string, string> = {
        'admin': 'Administrador', 'manager': 'Gerente', 'staff': 'Staff',
        'cashier': 'Cajero', 'kitchen': 'Cocina', 'waiter': 'Mesero'
    };
    const roleName = roleMap[vars.role] || vars.role;

    return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0 0 8px 0; color: white; font-size: 24px; font-weight: 700;">${vars.store_name}</h1>
              <div style="display: inline-block; background: rgba(255,255,255,0.2); border-radius: 50px; padding: 8px 20px;">
                <span style="color: white; font-size: 14px; font-weight: 600;">📨 Invitación al Equipo</span>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 8px 0; color: #111; font-size: 22px;">¡Te han invitado a unirte!</h2>
              <p style="margin: 0 0 24px 0; color: #666; font-size: 15px; line-height: 1.5;">
                <strong>${vars.inviter_name}</strong> te invitó a formar parte del equipo de <strong>${vars.store_name}</strong> como <strong>${roleName}</strong>.
              </p>
              <a href="${vars.accept_url}" style="display: block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-align: center; padding: 18px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 16px; margin-bottom: 24px;">
                Aceptar Invitación
              </a>
              <p style="color: #888; font-size: 12px; text-align: center;">Esta invitación expira en 7 días.</p>
            </td>
          </tr>
          <tr>
            <td style="background: #f9fafb; padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #888; font-size: 12px;">Si no esperabas esta invitación, puedes ignorar este email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
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

        // 3. Get store name
        const { data: store } = await supabaseClient
            .from('stores')
            .select('name')
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

        // 6. Send Email via send-email function
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
            const emailPayload = {
                to: email,
                subject: `📨 ${profile.full_name || 'Alguien'} te invitó a ${store?.name || 'un equipo'}`,
                html: generateInviteHtml({
                    store_name: store?.name || 'Tienda',
                    inviter_name: profile.full_name || 'Equipo',
                    role: role,
                    accept_url: link
                }),
                text: `Has sido invitado a unirte a ${store?.name || 'un equipo'} como ${role}. Acepta aquí: ${link}`
            };

            const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
                body: JSON.stringify(emailPayload)
            });
            const emailResult = await emailRes.json();

            await supabaseAdmin.rpc('update_email_log_status', {
                p_log_id: logRow.log_id,
                p_status: emailRes.ok ? 'sent' : 'failed',
                p_resend_id: emailResult?.id || null,
                p_resend_response: emailResult
            });

            emailSent = emailRes.ok;
            console.log(`Invitation email ${emailRes.ok ? 'sent' : 'failed'} to ${email}`);
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
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
