
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: stores } = await supabase.from('stores').select('*');
    if (!stores) {
        console.log('No stores found');
        return;
    }
    console.log(`Found ${stores.length} stores:`);
    stores.forEach(s => {
        console.log(`- ID: ${s.id} | Slug: ${s.slug} | Name: ${s.name}`);
        console.log(`  Menu Theme Type: ${typeof s.menu_theme}`);
        if (s.menu_theme) {
            const theme = typeof s.menu_theme === 'string' ? JSON.parse(s.menu_theme) : s.menu_theme;
            console.log(`  showImages: ${theme.showImages}`);
        }
    });
}

inspectData();
