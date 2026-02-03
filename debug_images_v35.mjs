
import fetch from 'node-fetch';

async function checkUrl() {
    const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlqeGp5eGhrc2Vkd2ZldWVkdXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwOTEwNTcsImV4cCI6MjA4MTY2NzA1N30.dm-BEzfelYA_Jr73KSQUuNXkTcXMp9IrResMc2b38Go";

    // Original (Public)
    const urlPublic = "https://yjxjyxhksedwfeueduwl.supabase.co/storage/v1/object/public/products/f5e3bfcf-3ccc-4464-9eb5-431fa6e26533/Fernet-1769653212171.jpeg";

    // Authenticated
    const urlAuth = "https://yjxjyxhksedwfeueduwl.supabase.co/storage/v1/object/authenticated/products/f5e3bfcf-3ccc-4464-9eb5-431fa6e26533/Fernet-1769653212171.jpeg";

    try {
        console.log('--- CHECKING PUBLIC ---');
        const resP = await fetch(urlPublic, { method: 'HEAD' });
        console.log(`Public Status: ${resP.status}`);

        console.log('--- CHECKING AUTHENTICATED ---');
        const resA = await fetch(urlAuth, {
            method: 'HEAD',
            headers: {
                'Authorization': `Bearer ${supabaseKey}`
            }
        });
        console.log(`Authenticated Status: ${resA.status}`);

    } catch (e) {
        console.error('Fetch error:', e);
    }
}

checkUrl();
