
async function checkUrl() {
    const url = "https://yjxjyxhksedwfeueduwl.supabase.co/storage/v1/object/public/product-images/temp/93cd9acf-93f5-4961-b31f-2a468850058b-1766548859466.jpeg?t=1766548860736";
    try {
        const res = await fetch(url, { method: 'HEAD' });
        console.log(`URL: ${url}`);
        console.log(`Status: ${res.status} ${res.statusText}`);
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

checkUrl();
