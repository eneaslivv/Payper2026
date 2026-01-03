
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// MANUAL .ENV PARSER
function getEnv() {
    try {
        const envPath = path.join(__dirname, '.env');
        if (!fs.existsSync(envPath)) return {};
        const content = fs.readFileSync(envPath, 'utf8');
        const env = {};
        content.split('\n').forEach(line => {
            const [key, val] = line.split('=');
            if (key && val) env[key.trim()] = val.trim();
        });
        return env;
    } catch (e) {
        return {};
    }
}

const env = getEnv();
// Fallback URL based on previous knowledge
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL || "https://vjqjyxhksedwfvueduel.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
    console.log("--- PAYPER FORCE VERIFIER (Node.js) ---");
    console.log("This tool behaves like the server to FORCE UPDATE the order.\n");

    let key = SUPABASE_KEY;
    if (!key) {
        key = await ask("Enter Supabase ANON Key: ");
    } else {
        console.log("✅ Loaded API Key from .env");
    }

    const orderInput = await ask("Enter Order Number (e.g. 59): ");

    if (!key || !orderInput) {
        console.error("Missing inputs!");
        process.exit(1);
    }

    // CLEAN INPUT: remove "PEDIDO" or "#" or trailing spaces
    const cleanInput = orderInput.replace(/[^0-9a-fA-F-]/g, '');
    console.log(`\n🔍 1. Resolving Order '${cleanInput}' (Original: '${orderInput}')...`);

    // 1. GET ORDER UUID
    let orderId = cleanInput;
    let orderData = null;

    try {
        // Try exact Number match first
        let orders = [];
        // Only query order_number if input is numeric and short
        if (cleanInput.length < 10) {
            const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?order_number=eq.${cleanInput}&select=id,status,payment_status,store_id,total_amount,order_number`, {
                headers: { 'Authorization': `Bearer ${key}`, 'apikey': key }
            });
            orders = await orderRes.json();
        }

        if (!orders || orders.length === 0) {
            // Maybe it IS a UUID?
            if (cleanInput.length > 20) {
                console.log("   Input looks like UUID, checking ID directly...");
                const idRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${cleanInput}&select=id,status,payment_status,store_id,total_amount,order_number`, {
                    headers: { 'Authorization': `Bearer ${key}`, 'apikey': key }
                });
                orders = await idRes.json();
            }

            if (!orders || orders.length === 0) {
                console.log("\n❌ ORDER NOT FOUND.");
                console.log("   Listing LAST 5 ORDERS in Database to help you find it:");
                console.log("   -------------------------------------------------------");

                const listRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=order_number,id,status,payment_status,created_at&order=created_at.desc&limit=5`, {
                    headers: { 'Authorization': `Bearer ${key}`, 'apikey': key }
                });
                const list = await listRes.json();
                console.table(list);
                console.log("   -------------------------------------------------------");
                console.log("   Please re-run and enter the correct 'order_number' or 'id' from the table above.");
                process.exit(0);
            }
        }

        orderData = orders[0];
        orderId = orderData.id;
        console.log(`✅ Found Order #${orderData.order_number}`);
        console.log(`   UUID: ${orderId}`);
        console.log(`   Store ID: ${orderData.store_id}`);

    } catch (e) {
        console.error("❌ Error finding order:", e.message);
        process.exit(1);
    }

    // 2. GET STORE TOKEN
    console.log(`\n🔑 2. Getting Store Access Token...`);
    let accessToken = null;
    try {
        const storeRes = await fetch(`${SUPABASE_URL}/rest/v1/stores?id=eq.${orderData.store_id}&select=mp_access_token`, {
            headers: { 'Authorization': `Bearer ${key}`, 'apikey': key }
        });
        const stores = await storeRes.json();
        if (!stores || !stores[0].mp_access_token) throw new Error("Store has no MP Token");
        accessToken = stores[0].mp_access_token;
        console.log("   Token retrieved.");
    } catch (e) {
        console.error("❌ Error retrieving store token:", e.message);
        process.exit(1);
    }

    // 3. SEARCH MERCADO PAGO
    console.log(`\n💳 3. Check Mercado Pago for payment...`);
    let payment = null;
    try {
        const searchUrl = new URL('https://api.mercadopago.com/v1/payments/search');
        searchUrl.searchParams.append('external_reference', orderId);
        // searchUrl.searchParams.append('status', 'approved'); // Check ALL statuses to debug

        const mpRes = await fetch(searchUrl.toString(), {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        const mpData = await mpRes.json();
        const results = mpData.results || [];

        if (results.length > 0) {
            // Look for approved one first
            payment = results.find(p => p.status === 'approved');
            if (!payment) {
                payment = results[results.length - 1]; // Fallback to last attempt
                console.log(`   ⚠️ Found payment but status is '${payment.status}'.`);
                if (payment.status !== 'approved') {
                    const force = await ask("   Payment is NOT approved. Force mark as PAID anyway? (y/n): ");
                    if (force.toLowerCase() !== 'y') {
                        console.log("   Aborting.");
                        process.exit(0);
                    }
                    // Fake an approved payment object for the RPC
                    payment.status = 'approved';
                    payment.status_detail = 'accredited';
                }
            } else {
                console.log(`   ✅ Payment Found! ID: ${payment.id} | Status: ${payment.status}`);
            }
        } else {
            console.log("   ❌ No payment found in Mercado Pago.");
            const force = await ask("   Force mark as PAID anyway (Manually)? (y/n): ");
            if (force.toLowerCase() !== 'y') {
                console.log("   Aborting.");
                process.exit(0);
            }
            // Fake payment object
            payment = {
                id: 123456789,
                transaction_amount: orderData.total_amount || 0,
                status: 'approved',
                status_detail: 'manual_force',
                payment_method_id: 'manual',
                payment_type_id: 'manual',
                payer: { email: 'manual@admin.com' },
                date_approved: new Date().toISOString()
            };
        }
    } catch (e) {
        console.error("❌ MP Error:", e.message);
        process.exit(1);
    }

    // 4. CALL RPC
    console.log(`\n📝 4. Updating Order in Database (RPC)...`);
    try {
        const rpcUrl = `${SUPABASE_URL}/rest/v1/rpc/verify_payment`;
        const rpcBody = {
            p_mp_payment_id: payment.id.toString(),
            p_order_id: orderId,
            p_amount: payment.transaction_amount,
            p_status: payment.status,
            p_status_detail: payment.status_detail,
            p_payment_method: payment.payment_method_id,
            p_payment_type: payment.payment_type_id,
            p_payer_email: payment.payer?.email,
            p_date_approved: payment.date_approved
        };

        const rpcRes = await fetch(rpcUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${key}`,
                'apikey': key,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(rpcBody)
        });

        if (rpcRes.ok) {
            console.log("\n✅ SUCCESS! ORDER UPDATED TO PAID.");
            console.log("   Refresh the User and Admin Dashboard.");
        } else {
            console.log("\n❌ RPC FAILED:", await rpcRes.text());
        }

    } catch (e) {
        console.error("❌ RPC Error:", e.message);
    }

    rl.close();
}

main();
