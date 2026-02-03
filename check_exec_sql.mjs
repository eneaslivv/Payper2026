
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

const envLocal = fs.readFileSync('.env.local', 'utf8');
const envConfig = dotenv.parse(envLocal);

const supabase = createClient(envConfig.VITE_SUPABASE_URL, envConfig.VITE_SUPABASE_ANON_KEY);

async function checkExecSql() {
    console.log('--- CHECKING EXEC_SQL RPC ---');
    // Try to execute a benign SQL
    const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: "SELECT 1 as test"
    });

    if (error) {
        console.log('❌ exec_sql RPC FAILED/MISSING:', error.message);
        if (error.code === 'PGRST202') console.log('   (Confirmed MISSING)');
    } else {
        console.log('✅ exec_sql RPC AVAILABLE!');
        console.log('   Result:', JSON.stringify(data));
    }
}

checkExecSql();
