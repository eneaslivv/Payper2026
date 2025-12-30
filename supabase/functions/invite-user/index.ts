import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Create a Supabase client with the Auth context of the logged in user
        const supabaseClient = createClient(
            // Retrieve the keys from the defined environment variables
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Get the User from the authorization header
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
        if (authError || !user) throw new Error('Not authenticated')

        const { email, role, siteUrl } = await req.json()

        if (!email || !role) {
            throw new Error('Email and Role are required')
        }

        // 1. Get current user's profile to check store_id and permissions
        const { data: profile, error: profileError } = await supabaseClient
            .from('profiles')
            .select('store_id, role')
            .eq('id', user.id)
            .single()

        if (profileError || !profile || !profile.store_id) {
            throw new Error('User profile or store not found')
        }

        // 2. Validate Permissions (Only Owner/Manager/Admin)
        const allowedRoles = ['owner', 'manager', 'admin', 'super_admin'];
        if (!allowedRoles.includes(profile.role)) {
            throw new Error('Authorized personnel only')
        }

        // 3. Create Invitation
        // Uses the user's RLS context, so valid if policy exists
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

        // 4. Generate Link (Simulation)
        // In production, you would send an email here using Resend, SendGrid, etc.
        // For now, return the link to the client for testing.
        // Use provided siteUrl or fallback to origin/localhost
        const origin = siteUrl || req.headers.get('origin') || 'http://localhost:5173';
        const link = `${origin}/join?token=${invitation.token}`;

        return new Response(
            JSON.stringify({
                success: true,
                message: 'Invitation created successfully',
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
