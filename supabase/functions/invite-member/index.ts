import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { initMonitoring, captureException } from "../_shared/monitoring.ts";
import { generateInviteUserHtml, getInviteUserSubject } from "../_shared/email-templates.ts";

const FUNCTION_NAME = 'invite-member';
initMonitoring(FUNCTION_NAME);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (!supabaseUrl || !supabaseServiceKey) {
            return new Response(JSON.stringify({ error: 'Server configuration missing' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        // ACCEPT roleId in addition to role
        const { email: rawEmail, fullName, role, roleId, storeId } = await req.json();

        const email = rawEmail?.trim().toLowerCase();
        if (!email) throw new Error('Email es obligatorio');
        if (!storeId) throw new Error('storeId es obligatorio');
        // Relaxed check: need either role or roleId
        if (!role && !roleId) throw new Error('Rol es obligatorio');

        // RESOLVE ROLE NAME
        let roleNameForEmail = role || 'Staff'; // Default fallback
        let targetRoleId = roleId || null;

        if (roleId) {
            // Fetch the custom role name
            const { data: roleData, error: roleError } = await supabaseAdmin
                .from('store_roles')
                .select('name')
                .eq('id', roleId)
                .single();

            if (roleData) {
                roleNameForEmail = roleData.name;
            } else {
                console.warn(`[INVITE-MEMBER] Role ID ${roleId} not found, using fallback.`);
            }
        }

        console.log(`[INVITE-MEMBER] Processing: ${email}, role: ${roleNameForEmail}, store: ${storeId}`);

        // 1. AUTHORIZATION: Check if caller can manage this store
        const authHeader = req.headers.get('Authorization');
        if (authHeader && !authHeader.includes(supabaseServiceKey)) {
            const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
                global: { headers: { Authorization: authHeader } }
            });
            const { data: canManage } = await supabaseUser.rpc('can_manage_store', { p_store_id: storeId });
            if (!canManage) {
                console.log(`[INVITE-MEMBER] Unauthorized for store ${storeId}`);
                return new Response(JSON.stringify({ error: 'No tienes permisos para este local' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }
        }

        // 2. FETCH STORE BRANDING FROM DB (secure)
        const { data: store, error: storeError } = await supabaseAdmin
            .from('stores')
            .select('name, logo_url, slug')
            .eq('id', storeId)
            .single();

        if (storeError || !store) {
            throw new Error(`Store not found: ${storeId}`);
        }
        const storeName = store.name;

        // 3. IDEMPOTENT INVITATION: Check for existing pending invite
        const { data: existingInvite } = await supabaseAdmin
            .from('team_invitations')
            .select('id, token, status')
            .eq('store_id', storeId)
            .eq('email', email)
            .eq('status', 'pending')
            .single();

        let invitationId: string;
        let inviteToken: string;
        let wasExisting = false;

        if (existingInvite) {
            console.log(`[INVITE-MEMBER] Reusing existing invite: ${existingInvite.id}`);
            invitationId = existingInvite.id;
            inviteToken = existingInvite.token;
            wasExisting = true;
        } else {
            // Create new invitation
            // Store roleId in 'role' column? Or keep it text name? 
            // team_invitations 'role' column is text. We can store the name or ID.
            // Storing name is better for display if ID relation is lost/not fetched.
            // Or store ID if we want strict link.
            // For now, let's store the NAME if available, or 'staff'.
            // Actually, if we use ID, we might break existing assumption.
            // Let's store roleNameForEmail.
            const { data: newInvite, error: inviteError } = await supabaseAdmin
                .from('team_invitations')
                .insert({
                    store_id: storeId,
                    email,
                    role: targetRoleId || roleNameForEmail, // Store UUID when available, name as fallback
                    status: 'pending'
                })
                .select('id, token')
                .single();

            if (inviteError) throw inviteError;
            invitationId = newInvite.id;
            inviteToken = newInvite.token;
            console.log(`[INVITE-MEMBER] Created new invite: ${invitationId}`);
        }

        // 4. Create or update Auth user
        const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
        const existingUser = users?.find(u => u.email?.toLowerCase() === email);
        let targetUserId: string;

        if (!existingUser) {
            console.log(`[INVITE-MEMBER] Creating new user...`);
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                email_confirm: true,
                user_metadata: {
                    full_name: fullName || '',
                    role: 'staff', // System role 
                    role_id: targetRoleId, // Custom Role ID
                    store_id: storeId
                }
            });
            if (createError) throw createError;
            targetUserId = newUser.user.id;
        } else {
            targetUserId = existingUser.id;
        }

        // 5. Upsert profile — is_active: true because user was explicitly invited by an admin
        const { error: upsertError } = await supabaseAdmin.from('profiles').upsert({
            id: targetUserId,
            email: email,
            full_name: fullName || email.split('@')[0],
            role: 'staff', // Always 'staff' for permissions system baseline
            role_id: targetRoleId, // Link to custom role
            store_id: storeId,
            is_active: true
        });
        if (upsertError) {
            console.error('[INVITE-MEMBER] Profile upsert FAILED:', upsertError);
            // Fallback: try activate_invited_user RPC which is SECURITY DEFINER
            const { error: rpcError } = await supabaseAdmin.rpc('activate_invited_user', {
                p_user_id: targetUserId,
                p_store_id: storeId,
                p_role_id: targetRoleId,
                p_invitation_token: null
            });
            if (rpcError) {
                console.error('[INVITE-MEMBER] activate_invited_user fallback also failed:', rpcError);
            } else {
                console.log('[INVITE-MEMBER] Profile activated via RPC fallback');
            }
        } else {
            console.log('[INVITE-MEMBER] Profile upserted successfully');
        }

        // 6. Generate recovery link
        const origin = req.headers.get('origin') || 'https://payper.vercel.app';
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: `${origin}/join?token=${inviteToken}` }
        });
        if (linkError) throw linkError;
        const inviteLink = linkData.properties.action_link;

        // 7. IDEMPOTENT EMAIL via email_logs
        const idempotencyKey = `member_invite_${invitationId}_v1`;
        const { data: emailLogResult } = await supabaseAdmin.rpc('create_email_log', {
            p_store_id: storeId,
            p_recipient_email: email,
            p_recipient_name: fullName || null,
            p_recipient_type: 'staff',
            p_event_type: 'member.invited',
            p_event_id: invitationId,
            p_event_entity: 'invitation',
            p_template_key: 'member_invite',
            p_payload_core: { store_name: storeName, member_name: fullName, role: roleNameForEmail, accept_url: inviteLink },
            p_idempotency_key: idempotencyKey,
            p_triggered_by: 'api',
            p_trigger_source: 'invite-member'
        });

        const logRow = emailLogResult?.[0];
        let emailSent = false;

        if (logRow && !logRow.already_exists) {
            const resendKey = Deno.env.get('RESEND_API_KEY') || '';
            if (resendKey) {
                console.log(`[INVITE-MEMBER] Sending email to ${email}...`);

                const emailVars = { store_name: storeName, store_logo_url: store.logo_url, member_name: fullName, invited_role: roleNameForEmail, accept_url: inviteLink, expires_in_days: 7 };
                const resendRes = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: `${storeName} <no-reply@payperapp.io>`,
                        to: email,
                        subject: getInviteUserSubject(emailVars),
                        html: generateInviteUserHtml(emailVars)
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
            }
        } else {
            console.log(`[INVITE-MEMBER] Email already sent (idempotency), skipping.`);
        }

        console.log(`[INVITE-MEMBER] Completed for ${email}`);

        return new Response(JSON.stringify({
            success: true,
            invitationId,
            wasExisting,
            emailSent,
            message: emailSent ? 'Invitación enviada' : (wasExisting ? 'Invitación existente (email ya enviado)' : 'Invitación creada')
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('[INVITE-MEMBER ERROR]', error.message);
        await captureException(error, req, FUNCTION_NAME);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
