
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkPanceta() {
    const { data: item, error } = await supabase
        .from('inventory_items')
        .select('*')
        .ilike('name', '%PANCETA%')
        .single();

    if (error) {
        console.error('Error fetching panceta detail:', error);
    } else {
        console.log('Panceta Detailed Info:', item);
    }
}

checkPanceta();
