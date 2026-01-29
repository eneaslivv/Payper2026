
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkPanceta() {
    console.log('--- Checking Last Order ---');
    const { data: order, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        console.error('Error fetching last order:', error);
    } else {
        console.log('Last Order ID:', order.id);
        console.log('Status:', order.status);
        console.log('Items Raw:', JSON.stringify(order.items, null, 2));
        console.log('Stock Deducted:', order.stock_deducted);
    }
}

checkPanceta();
