
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function testResolution() {
    const { data: d, error: e } = await supabase.rpc('resolve_menu', { p_slug: 'demo' });
    console.log('Resolve demo:', d, e);

    const { data: t, error: te } = await supabase.rpc('resolve_menu', { p_slug: 'test-ciro-enero' });
    console.log('Resolve test-ciro-enero:', t, te);
}

testResolution();
