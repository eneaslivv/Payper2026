/**
 * Script to fix owner role for a specific user
 * Run with: node fix_owner_role.cjs
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bmnkmhvticdlwagcrovl.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Set SUPABASE_SERVICE_ROLE_KEY environment variable');
    console.log('   Run: $env:SUPABASE_SERVICE_ROLE_KEY="your-key-here"');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function fixOwnerRole() {
    const EMAIL = 'ciroaldabe1@gmail.com';

    console.log(`\n🔧 Fixing role for: ${EMAIL}\n`);

    // 1. Get user from auth
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
        console.error('❌ Error listing users:', listError.message);
        return;
    }

    const user = users.find(u => u.email?.toLowerCase() === EMAIL.toLowerCase());
    if (!user) {
        console.error('❌ User not found in auth.users');
        return;
    }

    console.log('✅ Found user in auth:', user.id);
    console.log('   Current metadata:', JSON.stringify(user.user_metadata, null, 2));

    // 2. Get their store_id from metadata
    const storeId = user.user_metadata?.store_id;
    if (!storeId) {
        console.error('❌ No store_id in user metadata. Need to find their store...');

        // Try to find their store from the stores table
        const { data: stores } = await supabase
            .from('stores')
            .select('id, name')
            .order('created_at', { ascending: false })
            .limit(5);

        console.log('\n📦 Recent stores:');
        stores?.forEach(s => console.log(`   - ${s.name}: ${s.id}`));
        console.log('\n   Please manually set the store_id and re-run.');
        return;
    }

    console.log('✅ Store ID:', storeId);

    // 3. Verify store exists
    const { data: store, error: storeError } = await supabase
        .from('stores')
        .select('id, name')
        .eq('id', storeId)
        .single();

    if (storeError || !store) {
        console.error('❌ Store not found:', storeId);
        return;
    }

    console.log('✅ Store verified:', store.name);

    // 4. Update profile to store_owner
    const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
            id: user.id,
            email: EMAIL,
            full_name: user.user_metadata?.full_name || 'Propietario',
            role: 'store_owner',
            store_id: storeId,
            is_active: true
        }, { onConflict: 'id' });

    if (profileError) {
        console.error('❌ Profile update error:', profileError.message);
        return;
    }

    console.log('✅ Profile updated to store_owner');

    // 5. Update auth metadata too (for consistency)
    const { error: metaError } = await supabase.auth.admin.updateUserById(user.id, {
        user_metadata: {
            ...user.user_metadata,
            role: 'store_owner'
        }
    });

    if (metaError) {
        console.error('⚠️ Metadata update warning:', metaError.message);
    } else {
        console.log('✅ Auth metadata updated');
    }

    // 6. Verify the fix
    const { data: verifyProfile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    console.log('\n📋 Final profile state:');
    console.log(JSON.stringify(verifyProfile, null, 2));

    console.log('\n🎉 Done! User should now be able to access their store.');
}

fixOwnerRole().catch(console.error);
