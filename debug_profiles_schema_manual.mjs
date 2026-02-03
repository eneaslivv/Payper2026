
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkProfileSchema() {
    console.log('--- PROFILES SCHEMA CHECK (MANUAL) ---');

    // Check if profiles table exists and what columns it has
    const { data: row, error: rowErr } = await supabase.from('profiles').select('*').limit(1);

    if (rowErr) {
        console.error('Error querying profiles:', rowErr);
    } else {
        console.log('Columns in profiles:', Object.keys(row[0] || {}));
        if (row.length === 0) {
            console.log('Profiles table is empty.');
        } else {
            console.log('Sample row:', row[0]);
        }
    }
}

checkProfileSchema();
