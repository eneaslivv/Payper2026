
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkPanceta() {
    try {
        console.log('--- Checking Recent Orders ---');
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('count')
            .limit(1);

        if (ordersError) {
            console.error('Error fetching orders count:', JSON.stringify(ordersError, null, 2));
        } else {
            console.log('Orders found (partial read check):', orders);
        }

        const { data: recentOrders, error: recentError } = await supabase
            .from('orders')
            .select('id, status, created_at, items')
            .order('created_at', { ascending: false })
            .limit(5);

        if (recentError) {
            console.error('Error fetching recent orders:', JSON.stringify(recentError, null, 2));
        } else {
            console.log(`Found ${recentOrders?.length || 0} recent orders.`);
            recentOrders?.forEach(o => {
                console.log(`[Order] ID: ${o.id}, Status: ${o.status}, Created: ${o.created_at}`);
                console.log(`  Items Content: ${JSON.stringify(o.items)}`);
            });
        }

        console.log('\n--- Checking Stock Movements ---');
        const { data: movements, error: moveError } = await supabase
            .from('stock_movements')
            .select('id, inventory_item_id, qty_delta, reason, created_at')
            .order('created_at', { ascending: false })
            .limit(10);

        if (moveError) {
            console.error('Error fetching movements:', JSON.stringify(moveError, null, 2));
        } else {
            console.log(`Found ${movements?.length || 0} recent movements.`);
            movements?.forEach(m => {
                console.log(`[Movement] Item: ${m.inventory_item_id}, Delta: ${m.qty_delta}, Reason: ${m.reason}, Created: ${m.created_at}`);
            });
        }
    } catch (e) {
        console.error('Unexpected error:', e);
    }
}

checkPanceta();
