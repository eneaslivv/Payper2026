
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkPanceta() {
    // 3. Check most recent orders
    console.log('\n--- Recent Orders ---');
    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, items, status, created_at, stock_deducted')
        .order('created_at', { ascending: false })
        .limit(3);

    if (ordersError) {
        console.error('Error fetching orders:', ordersError);
    } else {
        orders.forEach(o => {
            console.log(`Order ${o.id}: Status=${o.status}, StockDeducted=${o.stock_deducted}, Items=${JSON.stringify(o.items)}`);
        });
    }

    // 4. Check stock movements for the last 5 minutes
    console.log('\n--- Recent Stock Movements ---');
    const { data: movements, error: moveError } = await supabase
        .from('stock_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

    if (moveError) {
        console.error('Error fetching stock movements:', moveError);
    } else {
        movements.forEach(m => {
            console.log(`Movement: ItemId=${m.inventory_item_id}, QtyDelta=${m.qty_delta}, Reason=${m.reason}, CreatedAt=${m.created_at}`);
        });
    }
}

checkPanceta();
