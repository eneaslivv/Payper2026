
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkProfilesColumns() {
    console.log('--- PROFILES INFORMATION_SCHEMA CHECK ---');

    // Attempting to use RPC or a raw query if enabled. 
    // Usually anon key cannot query information_schema, but some projects expose a helper.
    // Since I don't know the helper, I'll try to insert a garbage ID and see the error message.
    // The error message often reveals missing columns or constraints.

    const { error } = await supabase.from('profiles').insert({ id: '00000000-0000-0000-0000-000000000000' });

    if (error) {
        console.log('Error (useful!):', error.message);
        console.log('Full Error:', JSON.stringify(error, null, 2));
    } else {
        console.log('Insert succeeded (garbage cleaned up).');
        await supabase.from('profiles').delete().eq('id', '00000000-0000-0000-0000-000000000000');
    }
}

checkProfilesColumns();
