
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkProfileSchema() {
    console.log('--- PROFILES SCHEMA CHECK ---');
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'profiles' });

    if (error) {
        console.error('Error getting columns via RPC (trying fallback):', error);
        // Fallback: query for a single row to see columns
        const { data: row, error: rowErr } = await supabase.from('profiles').select('*').limit(1);
        if (rowErr) {
            console.error('Totally failed to see profiles:', rowErr);
        } else {
            console.log('Columns in profiles:', Object.keys(row[0] || {}));
        }
    } else {
        console.log('Columns:', data);
    }
}

checkProfileSchema();
