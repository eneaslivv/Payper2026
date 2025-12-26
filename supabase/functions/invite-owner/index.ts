import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // 1. Manejo de CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

        if (!supabaseUrl || !supabaseServiceKey) {
            return new Response(JSON.stringify({ error: 'Falta configuración en el servidor (URL/KEY)' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200, // Devolvemos 200 para evitar el bloqueo del cliente y mostrar el error real
            });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
        const { email: rawEmail, storeName, ownerName, storeId, action } = await req.json();

        const email = rawEmail?.trim().toLowerCase();
        if (!email) throw new Error('Email es obligatorio');

        console.log(`[HQ] Procesando ${action || 'invite'} para: ${email}`);

        // 2. Asegurar que el usuario existe en Auth
        const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers();
        if (listError) throw listError;

        const existingUser = users.find(u => u.email?.toLowerCase() === email);
        let targetUser = existingUser;

        if (!existingUser) {
            console.log(`[HQ] Creando nuevo usuario...`);
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                email_confirm: true,
                user_metadata: { full_name: ownerName || '', role: 'store_owner', store_id: storeId }
            });
            if (createError) throw createError;
            targetUser = newUser.user;
        } else {
            console.log(`[HQ] Actualizando usuario...`);
            const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
                user_metadata: { full_name: ownerName || '', role: 'store_owner', store_id: storeId }
            });
            if (updateError) throw updateError;
        }

        // 3. Generar el Link de "Recuperación" (que sirve para poner clave por primera vez)
        // Usamos 'recovery' porque permite establecer password sin haber confirmado el mail anterior
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email: email,
            options: { redirectTo: `${req.headers.get('origin') || ''}/#/setup-owner` }
        });

        if (linkError) throw linkError;

        const inviteLink = linkData.properties.action_link;

        // 4. Enviar mail vía Resend si tenemos la API KEY
        const resendKey = Deno.env.get('RESEND_API_KEY') || '';
        if (resendKey) {
            console.log(`[HQ] Enviando invitación por email a ${email}...`);
            await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resendKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'SQUAD <onboarding@resend.dev>',
                    to: email,
                    subject: `Activación de Cuenta - ${storeName}`,
                    html: `
                        <div style="font-family:sans-serif; background:#000; color:#fff; padding:50px; border-radius:30px; border: 1px solid #4ADE80; max-width: 600px; margin: auto;">
                            <h1 style="color:#4ADE80; font-style:italic; font-weight: 900; text-transform: uppercase; margin-bottom: 20px;">SQUAD ACCESS</h1>
                            <p style="font-size: 16px; margin-bottom: 20px;">Te damos la bienvenida a la red SQUAD, <b>${ownerName}</b>.</p>
                            <p style="margin-bottom: 20px;">Se ha configurado tu instancia operativa para el local: <b style="color:#4ADE80;">${storeName}</b>.</p>
                            <p style="margin-bottom: 30px;">Para comenzar a operar y acceder a tu dashboard, definí tu contraseña maestra en el siguiente link:</p>
                            <a href="${inviteLink}" style="display:inline-block; background:#4ADE80; color:#000; padding:20px 40px; text-decoration:none; border-radius:15px; font-weight:900; letter-spacing:1px; text-transform:uppercase; margin-bottom: 30px;">ACTIVAR CUENTA MAESTRA</a>
                            <div style="border-top: 1px solid #222; padding-top: 20px; font-size: 10px; color: #444; text-transform: uppercase; letter-spacing: 2px;">
                                PROTOCOLO DE CONEXIÓN SEGURO • SQUAD HQ
                            </div>
                        </div>
                    `
                })
            });
        }

        console.log(`[HQ] Proceso completado con éxito para ${email}`);

        return new Response(JSON.stringify({
            success: true,
            link: inviteLink,
            message: 'Usuario creado y mail enviado correctamente'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error) {
        console.error('[EDGE ERROR]', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }
})
