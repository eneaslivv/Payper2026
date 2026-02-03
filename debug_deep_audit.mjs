
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function deepAudit() {
    console.log('--- DEEP AUDIT START ---');

    const { data: stores, error: sErr } = await supabase.from('stores').select('*');
    const { data: menus, error: mErr } = await supabase.from('menus').select('*');

    if (sErr) console.error('Stores Error:', sErr);
    if (mErr) console.error('Menus Error:', mErr);

    console.log('\n--- ALL STORES ---');
    (stores || []).forEach(s => {
        console.log(JSON.stringify(s));
    });

    console.log('\n--- ALL MENUS ---');
    (menus || []).forEach(m => {
        console.log(JSON.stringify(m));
    });

    console.log('\n--- DEEP AUDIT COMPLETE ---');
}

deepAudit();
