
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env
const envLocal = fs.readFileSync('.env.local', 'utf8');
const envConfig = dotenv.parse(envLocal);

const supabaseUrl = envConfig.VITE_SUPABASE_URL;
const supabaseKey = envConfig.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function audit() {
    const report = {
        timestamp: new Date().toISOString(),
        tables: {},
        rpcs: {},
        integrity: {},
        errors: []
    };

    console.log('--- STARTING DATABASE AUDIT ---');

    // 1. Table Existence & Row Counts
    const tablesToCheck = ['stores', 'profiles', 'orders', 'order_items', 'products', 'inventory_items', 'clients'];

    for (const table of tablesToCheck) {
        try {
            console.log(`Checking table: ${table}...`);
            const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
            if (error) {
                report.tables[table] = { status: 'error', error: error.message };
                report.errors.push(`Table ${table} error: ${error.message}`);
            } else {
                report.tables[table] = { status: 'ok', count };
                console.log(`  -> OK (${count} rows)`);
            }
        } catch (e) {
            report.tables[table] = { status: 'fatal', error: e.message };
        }
    }

    // 2. Critical RPC Verification
    const rpcsToCheck = ['confirm_order_delivery', 'get_menu_products', 'get_public_order_status'];
    for (const rpc of rpcsToCheck) {
        try {
            console.log(`Checking RPC: ${rpc}...`);
            // Attempt to call with dummy data to see if it exists (expecting error but NOT "function not found")
            const { error } = await supabase.rpc(rpc, {});
            // If error code is 'PGRST202' (function not found) -> FAIL
            // If error is about parameters -> OK (function exists)

            if (error && error.code === 'PGRST202') {
                report.rpcs[rpc] = { status: 'missing', error: error.message };
                report.errors.push(`RPC ${rpc} MISSING`);
            } else {
                report.rpcs[rpc] = { status: 'exists', notes: error ? error.message : 'Called success' };
                console.log(`  -> EXISTS`);
            }
        } catch (e) {
            report.rpcs[rpc] = { status: 'unknown', error: e.message };
        }
    }

    // 3. Data Integrity - Orphans
    console.log('Checking Data Integrity...');

    // Order Items without Orders
    // We can't do complex joins easily with simple client without joining.
    // Let's sample 

    try {
        // Profiles without Roles
        const { count: profilesNoRole, error: pError } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).is('role', null);
        if (!pError) {
            report.integrity.profiles_without_role = profilesNoRole;
            if (profilesNoRole > 0) report.errors.push(`${profilesNoRole} Profiles found without ROLE`);
        }

        // Orders without Store
        const { count: ordersNoStore, error: oError } = await supabase.from('orders').select('*', { count: 'exact', head: true }).is('store_id', null);
        if (!oError) {
            report.integrity.orders_without_store_id = ordersNoStore;
            if (ordersNoStore > 0) report.errors.push(`${ordersNoStore} Orders found without STORE_ID`);
        }

    } catch (e) {
        console.error("Integrity check failed", e);
    }

    console.log('--- AUDIT COMPLETE ---');
    console.log('Writing report to db_health_report.json');
    fs.writeFileSync('db_health_report.json', JSON.stringify(report, null, 2));
}

audit();
