
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://yjxjyxhksedwfeueduwl.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectData() {
    const { data: stores } = await supabase.from('stores').select('name, slug, menu_theme');
    if (!stores) {
        console.error('No stores found');
        return;
    }

    stores.forEach(s => {
        let showImages = 'N/A';
        try {
            const theme = typeof s.menu_theme === 'string' ? JSON.parse(s.menu_theme) : s.menu_theme;
            showImages = theme?.showImages;
        } catch (e) { }
        console.log(`Store: ${s.name} | Slug: ${s.slug} | showImages: ${showImages}`);
    });
}

inspectData();
