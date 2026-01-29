import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to read .env file
function loadEnv() {
    try {
        const envPath = resolve(__dirname, '.env');
        const envContent = readFileSync(envPath, 'utf-8');
        const envVars = {};
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim().replace(/^["'](.*)["']$/, '$1'); // Remove quotes
                envVars[key] = value;
            }
        });
        return envVars;
    } catch (e) {
        console.warn('⚠️  Could not read .env file', e.message);
        return process.env;
    }
}

const env = loadEnv();
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

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

async function applyFixes() {
    try {
        const sqlPath = join(__dirname, 'fix_audit_complete.sql');
        console.log('📄 Reading SQL file:', sqlPath);

        const sqlContent = readFileSync(sqlPath, 'utf-8');

        console.log('🚀 Executing Fix SQL...');
        console.log('---');

        // Execute the SQL
        const { data, error } = await supabase.rpc('exec_sql', {
            sql_query: sqlContent
        });

        if (error) {
            console.error('❌ Execution failed:', error);
            
            // Try REST fallback
             console.log('⚠️  Trying alternative method (REST)...');
             const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
                 method: 'POST',
                 headers: {
                     'Content-Type': 'application/json',
                     'apikey': supabaseAnonKey,
                     'Authorization': `Bearer ${supabaseAnonKey}`
                 },
                 body: JSON.stringify({ sql_query: sqlContent })
             });

             if (!response.ok) {
                 const errorText = await response.text();
                 console.error('❌ Alternative method also failed:', errorText);
                 process.exit(1);
             }
             
             console.log('✅ Fixes applied successfully via REST!');

        } else {
            console.log('✅ Fixes applied successfully via RPC!');
            console.log('---');
        }

        console.log('\n🎯 Fixes Complete.');
        
    } catch (err) {
        console.error('❌ Unexpected error:', err);
        process.exit(1);
    }
}

applyFixes();
