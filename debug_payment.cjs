const readline = require('readline');

// CONFIG (Try to auto-detect or hardcode if known)
const DEFAULT_URL = "https://vjqjyxhksedwfvueduel.supabase.co";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
    console.log("--- PAYPER PAYMENT DEBUGGER V2 (Node.js) ---");
    console.log("Improved version: auto-fetches UUID from Order Number.\n");

    let supabaseUrl = await ask(`1. Enter Supabase URL [Default: ${DEFAULT_URL}]: `);
    if (!supabaseUrl) supabaseUrl = DEFAULT_URL;

    const supabaseKey = await ask("2. Enter Supabase ANON Key: ");
    const orderInput = await ask("3. Enter Order Number (e.g. 59) or UUID: ");

    if (!supabaseKey || !orderInput) {
        console.error("Missing inputs!");
        process.exit(1);
    }

    // 1. Resolve UUID if input is short
    let orderId = orderInput;
    if (orderInput.length < 10) {
        console.log(`\n🔍 Looking up UUID for Order #${orderInput}...`);
        try {
            const queryUrl = `${supabaseUrl}/rest/v1/orders?order_number=eq.${orderInput}&select=id,status,payment_status`;
            const searchRes = await fetch(queryUrl, {
                headers: {
                    'Authorization': `Bearer ${supabaseKey}`,
                    'apikey': supabaseKey
                }
            });

            if (!searchRes.ok) throw new Error(`DB Error: ${searchRes.statusText}`);
            const results = await searchRes.json();

            if (results.length === 0) {
                console.error("❌ Order not found in database!");
                process.exit(1);
            }

            orderId = results[0].id;
            console.log(`✅ Found UUID: ${orderId}`);
            console.log(`   Current DB Status: ${results[0].status} | Payment: ${results[0].payment_status}`);
        } catch (e) {
            console.error("❌ Error resolving order:", e.message);
            process.exit(1);
        }
    }

    // 2. Call Function
    console.log(`\n🚀 Invoking verify-payment-status for UUID: ${orderId}...`);

    try {
        const res = await fetch(`${supabaseUrl}/functions/v1/verify-payment-status`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ order_id: orderId })
        });

        console.log(`\nStatus Code: ${res.status}`);
        const text = await res.text();
        console.log("Response Body:", text);

        try {
            const json = JSON.parse(text);
            if (json.success) {
                console.log("\n✅ SUCCESS! The function verified the payment.");
            } else {
                console.log("\n❌ FUNCTION FAILED: The function ran but returned success:false.");
            }
        } catch (e) {
            console.log("\n⚠️ RESPONSE ERROR: Could not parse JSON response.");
        }

    } catch (e) {
        console.error("\n❌ NETWORK ERROR:", e.message);
    }

    rl.close();
}

main();
