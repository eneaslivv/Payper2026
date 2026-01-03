
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
    console.log("--- PAYPER PAYMENT DEBUGGER (Node.js) ---");
    console.log("This tool bypasses CORS to check your order status directly.\n");

    const supabaseUrl = await ask("1. Enter Supabase URL (e.g. https://xyz.supabase.co): ");
    const supabaseKey = await ask("2. Enter Supabase ANON Key: ");
    const orderId = await ask("3. Enter Order ID (59 or UUID): ");

    if (!supabaseUrl || !supabaseKey || !orderId) {
        console.error("Missing inputs!");
        process.exit(1);
    }

    console.log(`\nInvoking verify-payment-status for order: ${orderId}...`);

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
                console.log("\n✅ SUCCESS! The function logic is working.");
            } else {
                console.log("\n❌ LOGIC FAILURE: The function ran but returned failure.");
            }
        } catch (e) {
            console.log("\n⚠️ RESPONSE ERROR: Could not parse JSON.");
        }

    } catch (e) {
        console.error("\n❌ NETWORK ERROR:", e.message);
    }

    rl.close();
}

main();
