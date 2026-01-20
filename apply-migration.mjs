import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Missing environment variables: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
    process.exit(1);
}

console.log('🔗 Connecting to Supabase...', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: false
    }
});

async function applyMigration() {
    try {
        // Read the migration file
        const migrationPath = join(__dirname, 'supabase', 'migrations', 'integrate_open_packages_deduction.sql');
        console.log('📄 Reading migration:', migrationPath);

        const migrationSQL = readFileSync(migrationPath, 'utf-8');

        console.log('🚀 Applying migration to database...');
        console.log('---');

        // Execute the SQL
        const { data, error } = await supabase.rpc('exec_sql', {
            sql_query: migrationSQL
        });

        if (error) {
            console.error('❌ Migration failed:', error);

            // Fallback: Try using the REST API directly
            console.log('⚠️  Trying alternative method...');

            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': supabaseAnonKey,
                    'Authorization': `Bearer ${supabaseAnonKey}`
                },
                body: JSON.stringify({ sql_query: migrationSQL })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Alternative method also failed:', errorText);
                console.log('\n📌 Please apply the migration manually via Supabase Dashboard SQL Editor.');
                console.log('📁 Migration file: supabase/migrations/integrate_open_packages_deduction.sql');
                process.exit(1);
            }

            console.log('✅ Migration applied successfully via alternative method!');
        } else {
            console.log('✅ Migration applied successfully!');
            console.log('---');
            console.log('📊 Result:', data);
        }

        console.log('\n🎯 Next steps:');
        console.log('1. Test by marking an order as "Entregado"');
        console.log('2. Verify stock deduction in inventory');
        console.log('3. Check open_packages table for consumption records');

    } catch (err) {
        console.error('❌ Unexpected error:', err);
        console.log('\n📌 Manual application required.');
        console.log('📁 Copy contents of: supabase/migrations/integrate_open_packages_deduction.sql');
        console.log('🌐 Paste into: Supabase Dashboard → SQL Editor → Execute');
        process.exit(1);
    }
}

applyMigration();
