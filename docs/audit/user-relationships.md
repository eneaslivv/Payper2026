# User Relationships — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Status:** AS-IS Documentation

---

## Entity Relationship Overview

The Payper platform maintains several critical relationships between users, stores, clients, orders, sessions, and wallets. This document maps these connections as they exist in the codebase.

---

## Core Entities

### 1. User (Supabase Auth)
- **Table:** `auth.users` (Supabase managed)
- **Primary Key:** `id` (UUID)
- **Key Fields:**
  - `email`
  - `created_at`
  - `user_metadata`

**Relationships:**
- **1:1** with `profiles` (via `id`)
- **1:many** with `orders` (if store staff creates orders)
- **1:many** with `audit_logs`
- **1:many** with `stock_transfers` (via `user_id`)

---

### 2. Profile
- **Table:** `profiles`
- **Primary Key:** `id` (UUID, FK to `auth.users.id`)
- **Key Fields:**
  - `email` (string)
  - `full_name` (string)
  - `role` (`'super_admin' | 'store_owner' | 'staff' | 'customer'`)
  - `is_active` (boolean)
  - `store_id` (UUID, FK to `stores`, nullable)
  - `role_id` (UUID, FK to `cafe_roles`, nullable)

**Relationships:**
- **1:1** with `auth.users` (via `id`)
- **many:1** with `stores` (via `store_id`)
  - `super_admin`: No store (NULL)
  - `store_owner`: Owns 1 store
  - `staff`: Belongs to 1 store
  - `customer`: No store (NULL)
- **many:1** with `cafe_roles` (via `role_id`)
  - Only `staff` have `role_id`
  - O

thers have NULL

**Auto-Healing:**
If auth user exists but no profile, AuthContext creates profile with:
- `role`: `'customer'`
- `is_active`: `true`
- `store_id`: NULL

---

### 3. Store
- **Table:** `stores`
- **Primary Key:** `id` (UUID)
- **Key Fields:**
  - `name` (string)
  - `slug` (string, unique)
  - `logo_url` (string, nullable)
  - `owner_email` (string, nullable)
  - `plan` (string, nullable)
  - `service_mode` (`'counter' | 'table' | 'club'`)
  - `menu_theme` (JSONB)
  - `menu_logic` (JSONB)
  - `mp_connected` (boolean, Mercado Pago status)
  - `mp_access_token` (string, encrypted token)
  - `mp_user_id` (string)
  - `created_at` (timestamp)

**Relationships:**
- **1:many** with `profiles` (via `store_id`)
  - 1 owner
  - Many staff
- **1:many** with `orders`
- **1:many** with `inventory_items`
- **1:many** with `clients`
- **1:many** with `store_tables` (venue nodes)
- **1:many** with `cafe_roles`
- **1:1** with Mercado Pago account (via `mp_user_id`)

**Access:**
- `super_admin`: Can see ALL stores
- `store_owner`: Can see ONLY their store
- `staff`: Can see ONLY their store
- `customer`: No direct store relationship

---

### 4. Client
- **Table:** `clients`
- **Primary Key:** `id` (UUID)
- **Key Fields:**
  - `store_id` (UUID, FK to `stores`)
  - `email` (string, unique per store)
  - `name` (string)
  - `phone` (string, nullable)
  - `points_balance` (integer, default 0)
  - `wallet_balance` (numeric, default 0)
  - `total_spent` (numeric, default 0)
  - `orders_count` (integer, default 0)
  - `join_date` (timestamp)
  - `last_visit` (timestamp)
  - `is_vip` (boolean)
  - `status` (`'active' | 'blocked'`)

**Relationships:**
- **many:1** with `stores` (via `store_id`)
- **1:many** with `orders` (via `client_id`)
- **1:many** with `wallet_transactions`
- **1:many** with `loyalty_transactions`
- **1:1** with `auth.users` (optional, if client registers)
  - Clients can exist WITHOUT auth account (guest mode)
  - If authenticated, linked via `email` matching

**Client Creation:**
- **Guest Mode:** Client created on first order (via `/m/:slug` checkout)
- **Authenticated Mode:** Client created when user registers via `/m/:slug/auth`

**Data Ownership:**
- Clients are PER-STORE (not global)
- Same email can have different client records in different stores

---

### 5. Order
- **Table:** `orders`
- **Primary Key:** `id` (UUID)
- **Key Fields:**
  - `store_id` (UUID, FK to `stores`)
  - `client_id` (UUID, FK to `clients`, nullable)
  - `table_id` (UUID, FK to `store_tables`, nullable)
  - `customer_name` (string, for display)
  - `customer_email` (string, nullable)
  - `order_number` (integer, auto-increment per store)
  - `order_type` (`'dine_in' | 'takeaway' | 'delivery'`)
  - `status` (`'received' | 'preparing' | 'ready' | 'completed' | 'cancelled'`)
  - `payment_status` (`'pending' | 'paid' | 'failed'`)
  - `payment_provider` (`'wallet' | 'mercadopago' | 'cash'`)
  - `payment_method` (string, e.g., "Mercado Pago")
  - `is_paid` (boolean)
  - `total_amount` (numeric)
  - `items` (JSONB, array of order items)
  - `created_at` (timestamp)
  - `completed_at` (timestamp, nullable)

**Relationships:**
- **many:1** with `stores` (via `store_id`)
- **many:1** with `clients` (via `client_id`, nullable)
- **many:1** with `store_tables` (via `table_id`, nullable for takeaway/delivery)
- **1:many** with `order_items` (embedded in JSONB or separate table — UNKNOWN)
- **1:1** with `mp_payments` (Mercado Pago payment record)

**Order → Client Linkage:**
- If `client_id` is set, order counts toward:
  - `client.total_spent`
  - `client.orders_count`
  - Loyalty points (if enabled)
- If `client_id` is NULL, it's a guest order

**Order → Table Linkage:**
- If `table_id` is set, order is tied to a venue node (QR table)
- Null if takeaway or delivery

---

### 6. Session (Cash Register Session — ASSUMED)
- **Table:** `cash_register_sessions` (assumed from types.ts)
- **Primary Key:** `id` (UUID)
- **Key Fields:**
  - `store_id` (UUID, FK to `stores`, assumed)
  - `opened_at` (timestamp)
  - `closed_at` (timestamp, nullable)
  - `opened_by` (string, user email/name)
  - `total_orders` (integer)
  - `total_revenue` (numeric)
  - `status` (`'open' | 'closed'`)

**Relationships:**
- **many:1** with `stores` (assumed)
- **1:many** with `orders` (via session period — UNKNOWN if explicit FK exists)

**Status:** UNKNOWN whether this table actually exists in database. Type is defined but not confirmed used.

---

### 7. Wallet
- **Status:** NO dedicated `wallet` table found
- **Structure:** Wallet balance is stored DIRECTLY on `clients` table
  - `clients.wallet_balance` (numeric)

**Wallet Transactions:**
- **Table:** `wallet_transactions` (assumed)
- **Key Fields:**
  - `client_id` (UUID, FK to `clients`)
  - `amount` (numeric, positive for topup, negative for payment)
  - `type` (`'topup' | 'payment' | 'refund'`) (assumed)
  - `order_id` (UUID, FK to `orders`, nullable)
  - `payment_provider` (string, e.g., "mercadopago" for topups)
  - `created_at` (timestamp)

**Relationships:**
- **many:1** with `clients` (via `client_id`)
- **many:1** with `orders` (via `order_id`, if payment)

**Wallet Flow:**
1. Client adds funds → Creates `wallet_transaction` (topup)
2. Mercado Pago payment confirmed → Updates `clients.wallet_balance`
3. Client pays with wallet → Creates `wallet_transaction` (payment), decrements balance
4. Order linked to transaction

**Status:** Table structure NOT confirmed. Wallet feature exists in UI but backing table not inspected.

---

### 8. Loyalty (Points System)
- **Status:** NO dedicated `loyalty_points` table found
- **Structure:** Points stored DIRECTLY on `clients` table
  - `clients.points_balance` (integer)

**Loyalty Transactions:**
- **Table:** `loyalty_transactions` (assumed)
- **Key Fields:**
  - `client_id` (UUID, FK to `clients`)
  - `points_delta` (integer, positive for earn, negative for redeem)
  - `type` (`'earn' | 'redeem'`)
  - `order_id` (UUID, FK to `orders`, nullable)
  - `detail` (string, reason)
  - `created_at` (timestamp)

**Relationships:**
- **many:1** with `clients` (via `client_id`)
- **many:1** with `orders` (via `order_id`, if earned from purchase)

**Loyalty Engine:**
- **Function:** `calculate_loyalty_points` (from `loyalty_engine.sql`)
- **Triggered:** On order completion (if `is_paid = true`)
- **Configuration:** Per-store via `stores.loyalty_config` (assumed JSONB)

**Status:** Loyalty system exists (UI + SQL function), but transaction table not confirmed.

---

## Relationship Diagram (ASCII)

```
┌─────────────────┐
│  auth.users     │
│  (Supabase)     │
└────────┬────────┘
         │ 1:1
         ▼
┌─────────────────┐       ┌──────────────┐
│   profiles      │◄──────│ cafe_roles   │
│  (role, store)  │ many:1│ (permissions)│
└────────┬────────┘       └──────────────┘
         │
         │ many:1
         ▼
┌─────────────────┐
│     stores      │
│  (tenant/shop)  │
└────────┬────────┘
         │
         │ 1:many
         ├──────────────┐───────────────┐─────────────┐
         ▼              ▼               ▼             ▼
┌────────────┐   ┌────────────┐  ┌────────────┐  ┌────────────┐
│  clients   │   │   orders   │  │store_tables│  │ inventory  │
│(wallet,pts)│   │            │  │  (QR/venue)│  │  _items    │
└──────┬─────┘   └──────┬─────┘  └─────┬──────┘  └────────────┘
       │                │               │
       │ 1:many         │ many:1        │ many:1
       ▼                ▼               ▼
┌────────────┐   ┌────────────┐  ┌────────────┐
│  wallet_   │   │   orders   │  │   orders   │
│transactions│   │  (client)  │  │  (table)   │
└────────────┘   └────────────┘  └────────────┘
       │
       │ 1:many
       ▼
┌────────────┐
│  loyalty_  │
│transactions│
└────────────┘
```

---

## Key Relationship

 Rules

### User → Store
- **super_admin:** NO store (can impersonate any store)
- **store_owner:** OWNS 1 store (via `profiles.store_id`)
- **staff:** BELONGS TO 1 store (via `profiles.store_id`)
- **customer:** NO store assignment (client record is per-store)

### User → Profile
- **Always 1:1** (enforced by `profiles.id = auth.users.id`)
- If missing, auto-created as `customer`

### Profile → Role
- **super_admin, store_owner:** NO `role_id` (NULL)
- **staff:** HAS `role_id` → FK to `cafe_roles`
- **customer:** NO `role_id` (NULL)

### Client → Store
- **Always many:1** (client belongs to ONE store)
- Same email can be client in MULTIPLE stores (separate records)

### Client → Auth User
- **Optional 1:1** (client can exist without auth)
- If authenticated, linked via matching email

### Order → Client
- **Optional many:1** (order can be guest or linked)
- If `client_id` set, contributes to client stats

### Order → Table
- **Optional many:1** (only for dine-in)
- Takeaway/delivery have `table_id = NULL`

### Order → Payment
- **1:1** with Mercado Pago preference (if `payment_provider = 'mercadopago'`)
- Webhook updates `orders.payment_status`

---

## Data Flow Examples

### Customer Places Order (Authenticated)
1. Customer scans QR → Resolves to `store_id` + `table_id`
2. Customer logs in → Creates/fetches `client` record
3. Customer adds items → Stored in localStorage cart
4. Customer checks out → Creates `order` with `client_id` and `table_id`
5. Payment processed → Updates `order.is_paid`, `client.total_spent`
6. Loyalty triggered → Updates `client.points_balance`

### Staff Creates Manual Order
1. Staff (with `role_id`) opens OrderCreation
2. Selects table or takeaway
3. Adds items
4. Confirms → Creates `order` with `client_id = NULL` (guest)
5. Payment marked as cash → `order.payment_provider = 'cash'`

### Wallet Topup (Client)
1. Client navigates to `/m/:slug/wallet`
2. Clicks "Add Funds"
3. Selects amount
4. Redirects to Mercado Pago
5. Payment confirmed via webhook
6. Edge function creates `wallet_transaction` (topup)
7. Updates `client.wallet_balance`

### Wallet Payment (Order)
1. Client at checkout selects "Pay with Wallet"
2. System checks `client.wallet_balance >= order.total_amount`
3. If sufficient:
   - Creates `wallet_transaction` (payment) with `order_id`
   - Decrements `client.wallet_balance`
   - Marks `order.is_paid = true`

---

## Observations

**✅ CONFIRMED:**
- User → Profile (1:1)
- Profile → Store (many:1)
- Store → Clients (1:many)
- Store → Orders (1:many)
- Client → Orders (1:many)
- Order → Table (many:1, optional)

**❓ UNKNOWN:**
- Whether `cash_register_sessions` table actually exists
- Whether `wallet_transactions` table exists or if wallet is append-only on `clients`
- Whether `loyalty_transactions` table exists or if loyalty is append-only on `clients`
- Whether `order_items` is a separate table or embedded JSONB (likely JSONB)
- Whether orders have explicit session FK or just timestamp-based grouping

**⚠️ NOTES:**
- Client records are NOT global (per-store isolation)
- Wallet/Loyalty balances are stored on `clients` table (not separate ledger tables — ASSUMED)
- GOD MODE users bypass profile relationships entirely
- Impersonation allows super_admin to temporarily "own" a store
