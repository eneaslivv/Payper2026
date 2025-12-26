import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // 1. CORS Preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (!supabaseUrl || !supabaseServiceKey) {
            return new Response(JSON.stringify({ error: 'Server configuration missing (URL/KEY)' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500,
            });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        const { email: rawEmail, fullName, roleId, storeId, storeName } = await req.json();

        const email = rawEmail?.trim().toLowerCase();
        if (!email) throw new Error('Email is required');
        if (!roleId) throw new Error('Role ID is required');
        if (!storeId) throw new Error('Store ID is required');

        console.log(`[STAFF INVITE] Processing invite for: ${email} (Role: ${roleId}, Store: ${storeId})`);

        // 2. Check if user already exists in auth.users
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;

        const existingUser = users.find(u => u.email?.toLowerCase() === email);
        let targetUserId: string;

        if (!existingUser) {
            console.log(`[STAFF INVITE] Creating new user in Auth...`);
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                email_confirm: true,
                user_metadata: { full_name: fullName || '', role: 'staff', store_id: storeId, role_id: roleId }
            });
            if (createError) throw createError;
            targetUserId = newUser.user.id;
        } else {
            console.log(`[STAFF INVITE] Updating existing user metadata...`);
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
                user_metadata: { role: 'staff', store_id: storeId, role_id: roleId }
            });
            if (updateError) throw updateError;
            targetUserId = existingUser.id;
        }

        // 3. Upsert profile in public.profiles
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: targetUserId,
                email: email,
                full_name: fullName,
                role: 'staff',
                store_id: storeId,
                role_id: roleId,
                status: 'pending',
                invited_at: new Date().toISOString()
            });

        if (profileError) throw profileError;

        // 4. Generate Magic Link / Password Reset Link
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: `${req.headers.get('origin') || ''}/login` }
        });

        if (linkError) throw linkError;
        const inviteLink = linkData.properties.action_link;

        // 5. Send Invite Email (Resend)
        const resendKey = Deno.env.get('RESEND_API_KEY') || '';
        if (resendKey) {
            console.log(`[STAFF INVITE] Sending email to ${email}...`);
            await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'SQUAD <onboarding@resend.dev>',
                    to: email,
                    subject: `Invitación al Equipo - ${storeName}`,
                    html: `
                        <div style="font-family:sans-serif; background:#0F110F; color:#fff; padding:40px; border-radius:12px; border: 1px solid #4ADE80; max-width: 500px; margin: auto;">
                            <h1 style="color:#4ADE80; font-size: 24px; font-weight: 800; letter-spacing: -0.05em; margin-bottom: 24px;">COFFEE<span style="color:#fff">SQUAD</span></h1>
                            <p style="font-size: 16px; line-height: 1.5; margin-bottom: 16px;">Hola <b>${fullName}</b>,</p>
                            <p style="font-size: 14px; line-height: 1.5; color: #a1a1aa; margin-bottom: 24px;">Has sido invitado a formar parte del equipo operativo de <b style="color:#fff">${storeName}</b>.</p>
                            <div style="background: rgba(74, 222, 128, 0.1); padding: 16px; border-radius: 8px; margin-bottom: 24px;">
                                <p style="font-size: 12px; color: #4ADE80; margin: 0; text-transform: uppercase; font-weight: bold;">Tu acceso está listo</p>
                            </div>
                            <a href="${inviteLink}" style="display:inline-block; background:#4ADE80; color:#000; padding:14px 28px; text-decoration:none; border-radius:6px; font-weight:700; font-size: 14px; margin-bottom: 24px;">ACEPTAR INVITACIÓN</a>
                            <p style="font-size: 11px; color: #52525b;">Si no esperabas esta invitación, puedes ignorar este correo.</p>
                        </div>
                    `
                })
            });
        }

        return new Response(JSON.stringify({
            success: true,
            message: 'Invitation sent successfully'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[INVITE ERROR]', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
