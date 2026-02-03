
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const result = {
        products: [],
        inventory_items: []
    };

    const { data: products } = await supabase
        .from('products')
        .select('id, name, image, image_url')
        .limit(20);

    result.products = products || [];

    const { data: invItems } = await supabase
        .from('inventory_items')
        .select('id, name, image_url, image')
        .limit(20);

    result.inventory_items = invItems || [];

    fs.writeFileSync('debug_output.json', JSON.stringify(result, null, 2));
    console.log('Results written to debug_output.json');
}

inspectData();
