
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function deepAuditToFile() {
    const { data: stores } = await supabase.from('stores').select('*');
    const { data: menus } = await supabase.from('menus').select('*');

    const auditData = {
        stores: stores || [],
        menus: menus || []
    };

    fs.writeFileSync('audit_results.json', JSON.stringify(auditData, null, 2));
    console.log('Audit results written to audit_results.json');
}

deepAuditToFile();
