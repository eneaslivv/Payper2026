
async function checkUrl() {
    // This is the path I saw in v33
    const url = "https://yjxjyxhksedwfeueduwl.supabase.co/storage/v1/object/public/products/f5e3bfcf-3ccc-4464-9eb5-431fa6e26533/Fernet-1769653212171.jpeg";
    try {
        const res = await fetch(url, { method: 'HEAD' });
        console.log(`URL: ${url}`);
        console.log(`Status: ${res.status} ${res.statusText}`);
        if (res.status === 200) {
            console.log('✅ Image is ACCESSIBLE in "products" bucket.');
        } else {
            console.log('❌ Image is NOT accessible in "products" bucket.');
        }
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

checkUrl();
