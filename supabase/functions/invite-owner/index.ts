import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"
import { initMonitoring, captureException } from "../_shared/monitoring.ts";
import { generateInviteOwnerHtml, getInviteOwnerSubject } from "../_shared/email-templates.ts";

const FUNCTION_NAME = 'invite-owner';
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
        const { email: rawEmail, ownerName, storeId } = await req.json();

        const email = rawEmail?.trim().toLowerCase();
        if (!email) throw new Error('Email es obligatorio');
        if (!storeId) throw new Error('storeId es obligatorio');

        console.log(`[INVITE-OWNER] Processing for: ${email}, storeId: ${storeId}`);

        // 1. AUTHORIZATION: Check if caller can manage this store
        // For owner invites, we allow service-level calls (no user context) OR superadmin
        // If there's an Authorization header, validate it
        const authHeader = req.headers.get('Authorization');
        if (authHeader && !authHeader.includes(supabaseServiceKey)) {
            // User-initiated call - validate they can manage this store
            const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '', {
                global: { headers: { Authorization: authHeader } }
            });
            const { data: canManage } = await supabaseUser.rpc('can_manage_store', { p_store_id: storeId });
            if (!canManage) {
                console.log(`[INVITE-OWNER] Unauthorized attempt for store ${storeId}`);
                return new Response(JSON.stringify({ error: 'No tienes permisos para este local' }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 403,
                });
            }
        }

        // 2. FETCH STORE BRANDING FROM DB (secure - don't trust client input)
        const { data: store, error: storeError } = await supabaseAdmin
            .from('stores')
            .select('name, logo_url, slug')
            .eq('id', storeId)
            .single();

        if (storeError || !store) {
            throw new Error(`Store not found: ${storeId}`);
        }
        const storeName = store.name;

        // 3. Create or update Auth user
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;

        const existingUser = users.find(u => u.email?.toLowerCase() === email);
        let targetUser = existingUser;

        if (!existingUser) {
            console.log(`[INVITE-OWNER] Creating new user...`);
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                email_confirm: true,
                user_metadata: { full_name: ownerName || '', role: 'store_owner', store_id: storeId }
            });
            if (createError) throw createError;
            targetUser = newUser.user;
        } else {
            console.log(`[INVITE-OWNER] Updating existing user...`);
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
                user_metadata: { full_name: ownerName || '', role: 'store_owner', store_id: storeId }
            });
            if (updateError) throw updateError;
        }

        // 4. CRITICAL: Create/Update profile in profiles table with correct role
        // This prevents any trigger from defaulting to 'customer'
        if (targetUser) {
            console.log(`[INVITE-OWNER] Upserting profile for user ${targetUser.id}...`);
            const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .upsert({
                    id: targetUser.id,
                    email: email,
                    full_name: ownerName || 'Propietario',
                    role: 'store_owner',
                    store_id: storeId,
                    is_active: true
                }, { onConflict: 'id' });

            if (profileError) {
                console.error(`[INVITE-OWNER] Profile upsert error:`, profileError);
                // Don't throw - profile might be created by trigger, we'll update it
            } else {
                console.log(`[INVITE-OWNER] Profile upserted successfully`);
            }
        }

        // 5. Generate recovery link (for setting password)
        const origin = req.headers.get('origin') || 'https://www.payperapp.io';
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: `${origin}/setup-owner` }
        });
        if (linkError) throw linkError;
        const inviteLink = linkData.properties.action_link;

        // 5. IDEMPOTENT EMAIL: Log and send via Resend
        const idempotencyKey = `owner_invite_${storeId}_${email}`;
        const { data: emailLogResult } = await supabaseAdmin.rpc('create_email_log', {
            p_store_id: storeId,
            p_recipient_email: email,
            p_recipient_name: ownerName || null,
            p_recipient_type: 'staff',
            p_event_type: 'owner.invited',
            p_event_id: storeId,
            p_event_entity: 'store',
            p_template_key: 'owner_invite',
            p_payload_core: { store_name: storeName, owner_name: ownerName, accept_url: inviteLink },
            p_idempotency_key: idempotencyKey,
            p_triggered_by: 'api',
            p_trigger_source: 'invite-owner'
        });

        const logRow = emailLogResult?.[0];
        let emailSent = false;

        if (logRow && !logRow.already_exists) {
            const resendKey = Deno.env.get('RESEND_API_KEY') || '';
            if (resendKey) {
                console.log(`[INVITE-OWNER] Sending email to ${email}...`);
                const emailVars = { store_name: storeName, store_logo_url: store.logo_url, owner_name: ownerName, accept_url: inviteLink };
                const resendRes = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: `${storeName} <no-reply@payperapp.io>`,
                        to: email,
                        subject: getInviteOwnerSubject(emailVars),
                        html: generateInviteOwnerHtml(emailVars)
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
            console.log(`[INVITE-OWNER] Email already sent (idempotency), skipping.`);
        }

        console.log(`[INVITE-OWNER] Completed for ${email}`);

        return new Response(JSON.stringify({
            success: true,
            link: inviteLink,
            emailSent,
            message: emailSent ? 'Invitación enviada por email' : 'Invitación creada (email omitido)'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('[INVITE-OWNER ERROR]', error.message);
        await captureException(error, req, FUNCTION_NAME);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
})
