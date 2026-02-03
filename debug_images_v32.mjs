
async function checkUrl() {
    const url = "https://yjxjyxhksedwfeueduwl.supabase.co/storage/v1/object/public/product-images/f5e3bfcf-3ccc-4464-9eb5-431fa6e26533/Fernet-1769653212171.jpeg?t=1769653212171";
    try {
        const res = await fetch(url, { method: 'HEAD' });
        console.log(`URL: ${url}`);
        console.log(`Status: ${res.status} ${res.statusText}`);
        if (res.status === 200) {
            console.log('✅ Image is ACCESSIBLE in "product-images" bucket.');
        } else {
            console.log('❌ Image is NOT accessible in "product-images" bucket.');
        }
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

checkUrl();
