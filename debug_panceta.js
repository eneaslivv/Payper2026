
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://yjxjyxhksedwfeueduwl.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkPanceta() {
    console.log('--- Checking Panceta Mapping ---');

    // 1. Find the inventory item for Panceta
    const { data: invItems, error: invError } = await supabase
        .from('inventory_items')
        .select('id, name, current_stock')
        .ilike('name', '%PANCETA%');

    if (invError) {
        console.error('Error fetching inventory items:', invError);
    } else {
        console.log('Inventory Items matching "Panceta":', invItems);
    }

    if (invItems && invItems.length > 0) {
        const pancetaId = invItems[0].id;

        // 2. Check mapping
        const { data: mapping, error: mapError } = await supabase
            .from('inventory_product_mapping')
            .select('*')
            .eq('inventory_item_id', pancetaId);

        if (mapError) {
            console.error('Error fetching mapping:', mapError);
        } else {
            console.log('Mapping for Panceta:', mapping);
        }
    }

    // 3. Check most recent orders
    console.log('\n--- Recent Orders ---');
    const { data: orders, error: ordersError } = await supabase
        .from('orders')
        .select('id, items, status, created_at, stock_deducted')
        .order('created_at', { ascending: false })
        .limit(5);

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
        .limit(10);

    if (moveError) {
        console.error('Error fetching stock movements:', moveError);
    } else {
        movements.forEach(m => {
            console.log(`Movement: ItemId=${m.inventory_item_id}, QtyDelta=${m.qty_delta}, Reason=${m.reason}, CreatedAt=${m.created_at}`);
        });
    }
}

checkPanceta();
