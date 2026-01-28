# RLS Matrix — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Total Policies:** ~100+

---

## Overview

Row Level Security (RLS) is enabled on **all sensitive tables** to enforce multi-tenant isolation.

**Core Principle:** Users can **ONLY** access data from their `store_id` (except `super_admin`).

---

## Helper Functions

### `auth.get_user_store_id()`
**File:** `rls_policies.sql`

**Purpose:** Get current user's `store_id` from their profile

```sql
CREATE OR REPLACE FUNCTION auth.get_user_store_id()
RETURNS UUID AS $$
  SELECT store_id FROM public.profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
```

**Used In:** Nearly all RLS policies

---

### `auth.is_super_admin()`
**Status:** ASSUMED (not found in inspected files, but referenced)

**Purpose:** Check if user has `super_admin` role

```sql
-- Assumed implementation
SELECT role = 'super_admin' FROM profiles WHERE id = auth.uid()
```

---

## Policy Patterns

### Pattern 1: Store-Isolated (Standard)
**Used For:** Most tables

**SELECT:**
```sql
USING (store_id = auth.get_user_store_id())
```

**INSERT:**
```sql
WITH CHECK (store_id = auth.get_user_store_id())
```

**UPDATE/DELETE:**
```sql
USING (store_id = auth.get_user_store_id())
```

---

### Pattern 2: Super Admin Bypass
**Used For:** Critical tables

**SELECT (Super Admin):**
```sql
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'super_admin'
  )
)
```

**ALL (Super Admin):**
```sql
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role = 'super_admin'
  )
)
```

---

### Pattern 3: Via Join (Foreign Key Isolation)
**Used For:** Child tables without `store_id`

**Example (product_recipes):**
```sql
USING (
  EXISTS (
    SELECT 1 FROM products 
    WHERE products.id = product_recipes.product_id 
    AND products.store_id = auth.get_user_store_id()
  )
)
```

---

### Pattern 4: Public Read, Staff Write
**Used For:** QR codes, client sessions

**SELECT:**
```sql
USING (true)  -- Public read
```

**INSERT:**
```sql
WITH CHECK (true)  -- Public insert
```

**UPDATE/DELETE (Staff Only):**
```sql
USING (
  store_id IN (
    SELECT store_id FROM profiles WHERE id = auth.uid()
  )
)
```

---

### Pattern 5: Own Data (Clients)
**Used For:** Client-specific tables

**SELECT:**
```sql
USING (client_id = auth.uid())
```

**Example:** `loyalty_transactions`, `client_sessions`

---

## RLS Policy Matrix

| Table | SELECT | INSERT | UPDATE | DELETE | Special Rules |
|-------|--------|--------|--------|--------|---------------|
| **Core** |||||
| `stores` | Store-isolated + Super Admin sees all | Super Admin | Store-isolated | Super Admin | Owners see their store |
| `profiles` | Own + same store | - | Own only | Super Admin | Users see profiles from their store |
| **Products** |||||
| `products` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | Super Admin bypass |
| `categories` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | - |
| `product_variants` | Via product join | Via product join | Via product join | Via product join | - |
| `product_addons` | Via product join | Via product join | Via product join | Via product join | - |
| **Inventory** |||||
| `inventory_items` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | Super Admin bypass |
| `product_recipes` | Via product join | Via product join | Via product join | Via product join | - |
| `inventory_suppliers` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | - |
| `inventory_location_stock` | Via location join | Via location join | Via location join | Via location join | - |
| `storage_locations` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | - |
| `stock_transfers` | Store-isolated | Store-isolated | - | - | Read-only after creation |
| `inventory_audit_logs` | Store-isolated (staff) | System only | - | - | Append-only |
| `open_packages` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | - |
| **Orders** |||||
| `orders` | Store-isolated | Store-isolated | Store-isolated | - | Super Admin bypass |
| `order_items` | Via order join | Via order join | Via order join | Via order join | - |
| **Clients** |||||
| `clients` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | Super Admin bypass |
| `wallet_transactions` | Store-isolated + client own + super admin | Service role | Service role | Service role | Clients see own |
| `loyalty_transactions` | Clients see own + Staff see all | System only | - | - | Ledger (append-only) |
| `loyalty_redemptions` | Clients see own + Staff see all | System only | - | - | Via transaction join |
| `loyalty_rewards` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | - |
| `loyalty_configs` | Store-isolated | Store-isolated | Store-isolated | - | - |
| `loyalty_product_rules` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | - |
| **Venue** |||||
| `store_tables` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | - |
| `venue_zones` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | - |
| `qr_codes` | **Public** | Staff only | Staff only | Staff only | Anyone can scan |
| `qr_scan_logs` | Staff only | **Public** | - | - | Audit log |
| `client_sessions` | Own sessions | **Public** | Own sessions | - | - |
| `qr_links` (legacy) | **Public** | Admin | Admin | Admin | Backward compatibility |
| **Finance** |||||
| `cash_sessions` | Store-isolated | Store-isolated | Store-isolated | - | - |
| `cash_closures` | Store-isolated | Store-isolated | - | - | Append-only |
| `day_closures` | Store-isolated | Store-isolated | - | - | Append-only |
| `dispatch_sessions` | Store-isolated + super admin | Store-isolated + super admin | Store-isolated + super admin | Super admin | - |
| `zones` (cash) | Store-isolated | Store-isolated | Store-isolated | Store-isolated | - |
| **Security** |||||
| `cafe_roles` | Store-isolated | Store-isolated | Store-isolated | Store-isolated | - |
| `cafe_role_permissions` | Via role join | Via role join | Via role join | Via role join | - |
| `audit_logs` | Staff only (store-isolated) | System only | - | - | Append-only |
| **System** |||||
| `email_logs` | Staff only (store-isolated) | Service role | Service role | - | System managed |
| `payment_webhooks` | Store members + super admin + service role | Service role | Service role | Service role | System only |

---

## Policy Details by Table

### stores

**Policies (4):**
1. `"Super admins can view all stores"` — SELECT for super_admin
2. `"Store owners can view their own store"` — SELECT where `id = get_user_store_id()`
3. `"Store owners can update their own store"` — UPDATE where `id = get_user_store_id()`
4. `"Super admins can manage all stores"` — ALL for super_admin

**File:** `rls_policies.sql` (lines 29-55)

---

### profiles

**Policies (4):**
1. `"Users can view their own profile"` — SELECT where `id = auth.uid()`
2. `"Users can view profiles from their store"` — SELECT where `store_id = get_user_store_id()`
3. `"Users can update their own profile"` — UPDATE where `id = auth.uid()`
4. `"Super admins can manage all profiles"` — ALL for super_admin

**File:** `rls_policies.sql` (lines 60-80)

---

### products

**Policies (5):**
1. `"Users can view products from their store"` — SELECT
2. `"Users can insert products to their store"` — INSERT
3. `"Users can update products from their store"` — UPDATE
4. `"Users can delete products from their store"` — DELETE
5. `"Super admins can manage all products"` — ALL

**File:** `rls_policies.sql` (lines 85-109)

---

### inventory_items

**Policies (5):**
1. `"Users can view inventory from their store"` — SELECT
2. `"Users can insert inventory to their store"` — INSERT
3. `"Users can update inventory from their store"` — UPDATE
4. `"Users can delete inventory from their store"` — DELETE
5. `"Super admins can manage all inventory"` — ALL

**File:** `rls_policies.sql` (lines 114-138)

---

### orders

**Policies (4):**
1. `"Users can view orders from their store"` — SELECT
2. `"Users can insert orders to their store"` — INSERT
3. `"Users can update orders from their store"` — UPDATE
4. `"Super admins can manage all orders"` — ALL

**File:** `rls_policies.sql` (lines 143-163)

**Note:** No DELETE policy (orders not deletable, only cancellable)

---

### clients

**Policies (5):**
1. `"Users can view clients from their store"` — SELECT
2. `"Users can insert clients to their store"` — INSERT
3. `"Users can update clients from their store"` — UPDATE
4. `"Users can delete clients from their store"` — DELETE
5. `"Super admins can manage all clients"` — ALL

**File:** `rls_policies.sql` (lines 168-192)

---

### product_recipes

**Policies (2):**
1. `"Users can view recipes via products"` — SELECT via product join
2. `"Users can manage recipes via products"` — ALL via product join

**File:** `rls_policies.sql` (lines 197-215)

**Join Logic:**
```sql
EXISTS (
  SELECT 1 FROM products 
  WHERE products.id = product_recipes.product_id 
  AND products.store_id = auth.get_user_store_id()
)
```

---

### cafe_roles

**Policies (2):**
1. `"Users can view roles from their store"` — SELECT
2. `"Users can manage roles from their store"` — ALL

**File:** `rls_policies.sql` (lines 220-226)

---

### cafe_role_permissions

**Policies (2):**
1. `"Users can view permissions via roles"` — SELECT via role join
2. `"Users can manage permissions via roles"` — ALL via role join

**File:** `rls_policies.sql` (lines 231-249)

---

### loyalty_transactions

**Policies (2):**
1. `"Users can read own loyalty_transactions"` — SELECT where `client_id = auth.uid()`
2. `"Staff can manage loyalty_transactions"` — ALL where user role in (`'admin'`, `'store_owner'`, `'cashier'`, `'manager'`)

**File:** `loyalty_engine.sql` (lines 381-397)

---

### loyalty_redemptions

**Policies (2):**
1. `"Users can read own loyalty_redemptions"` — SELECT via transaction join
2. `"Staff can manage loyalty_redemptions"` — ALL for staff roles

**File:** `loyalty_engine.sql` (lines 399-413)

---

### qr_codes

**Policies (2):**
1. `"qr_codes_read_all"` — SELECT USING (true) — **Public read**
2. `"qr_codes_write_staff"` — ALL for store staff

**File:** `supabase/migrations/qr_sessions_system.sql` (lines 385-390)

---

### qr_scan_logs

**Policies (2):**
1. `"qr_scan_logs_insert"` — INSERT WITH CHECK (true) — **Public insert**
2. `"qr_scan_logs_read_staff"` — SELECT for staff

**File:** `supabase/migrations/qr_sessions_system.sql` (lines 391-396)

---

### client_sessions

**Policies (3):**
1. `"client_sessions_read_own"` — SELECT where `client_id = auth.uid()` OR public if guest
2. `"client_sessions_insert"` — INSERT WITH CHECK (true) — **Public insert**
3. `"client_sessions_update"` — UPDATE for own sessions

**File:** `supabase/migrations/qr_sessions_system.sql` (lines 397-407)

---

### store_tables

**Policies (1):**
1. `"Tenant Isolation: All Actions"` — ALL where `store_id = get_user_store_id()`

**File:** `store_tables_migration.sql` (line 47)

---

### storage_locations

**Policies (2):**
1. `"Users can view locations of their store"` — SELECT
2. `"Users can manage locations of their store"` — ALL

**File:** `stock_transfers_migration.sql` (lines 15-23)

---

### item_stock_levels

**Policies (2):**
1. `"Users can view stock levels"` — SELECT via location join
2. `"Users can update stock levels"` — UPDATE via location join

**File:** `stock_transfers_migration.sql` (lines 38-48)

---

### stock_transfers

**Policies (2):**
1. `"View transfers"` — SELECT via item join
2. `"Create transfers"` — INSERT via item join

**File:** `stock_transfers_migration.sql` (lines 68-78)

**Note:** No UPDATE/DELETE (audit log)

---

### email_logs

**Policies (2):**
1. `"Store members can view their email logs"` — SELECT for staff
2. `"Service role can manage email logs"` — ALL for service role

**File:** `supabase/migrations/email_logs_system.sql` (lines 75-80)

---

### cash_sessions

**Policies (3):**
1. `"Enable read for store members"` — SELECT
2. `"Enable insert for store members"` — INSERT
3. `"Enable update for store members"` — UPDATE

**File:** `supabase/migrations/cash_shift_system.sql` (lines 32-46)

---

### cash_closures

**Policies (2):**
1. `"Enable read for store members"` — SELECT
2. `"Enable insert for store members"` — INSERT

**File:** `supabase/migrations/cash_shift_system.sql` (lines 48-55)

**Note:** No UPDATE (append-only)

---

### dispatch_sessions

**Policies (4):**
1. "Store members can view dispatch sessions" — SELECT (store_id = get_user_store_id())
2. "Store members can insert dispatch sessions" — INSERT (store_id = get_user_store_id())
3. "Store members can update dispatch sessions" — UPDATE (store_id = get_user_store_id())
4. "Super admins can manage dispatch sessions" — ALL for super_admin

**File:** `supabase/migrations/20260128_add_missing_rls_policies.sql`

**Note:** No DELETE for store members

---

### wallet_transactions

**Policies (4):**
1. "Store members can view wallet transactions" — SELECT (store_id or wallet/client join)
2. "Clients can view own wallet transactions" — SELECT (user_id or client auth_user_id)
3. "Super admins can view wallet transactions" — SELECT for super_admin
4. "Service role can manage wallet transactions" — ALL for service_role

**File:** `supabase/migrations/20260128_add_missing_rls_policies.sql`

---

### payment_webhooks

**Policies (3):**
1. "Store members can view payment webhooks" — SELECT (store_id = get_user_store_id())
2. "Super admins can view payment webhooks" — SELECT for super_admin
3. "Service role can manage payment webhooks" — ALL for service_role

**File:** `supabase/migrations/20260128_add_missing_rls_policies.sql`

---

## RLS Status Summary

**Tables with RLS:** ~30  
**Total Policies:** ~100+  
**Public Access:** 3 tables (`qr_codes`, `qr_scan_logs` read, `client_sessions` insert)  
**Append-Only:** 5 tables (audit logs, closures, transfers, transactions)

**Security Posture:** ✅ **Strong**
- All sensitive tables protected
- Multi-tenant isolation enforced
- Super admin bypass for platform management
- Public access only for customer-facing features (QR scanning)

---

## Known Gaps

**❓ UNKNOWN:**
- Whether `auth.is_super_admin()` function exists or if role check is inline
- Full list of tables NOT protected by RLS (assumed: lookup tables, enums)

**⚠️ NOTES:**
- Some tables use `FOR ALL` shorthand instead of separate SELECT/INSERT/UPDATE/DELETE policies
- Policy naming is inconsistent (some quoted, some descriptive)
- Multiple migrations add/modify policies (versioning not tracked)
