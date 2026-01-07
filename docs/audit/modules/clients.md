# Clients Module — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Status:** AS-IS Documentation

---

## Module Overview

The Clients module manages customer profiles, wallets, loyalty points, and activity timelines.

**File:** `pages/Clients.tsx` (1013 lines)

---

## Key Features

1. **Client Management** — View all customers
2. **Wallet Operations** — Add balance, view transactions
3. **Loyalty Management** — Add/remove points, grant gifts
4. **Activity Timeline** — View customer history
5 **Status Management** — Block/unblock clients
6. **Invitations** — Send signup links

---

## Database Table: `clients`

**Purpose:** Customer profiles (per-store)

**Fields (inferred from user-relationships.md + Clients.tsx):**
- `id` (UUID, PK)
- `store_id` (UUID, FK to stores)
- `email` (string, unique per store)
- `full_name` (string)
- `phone` (string, nullable)
- `wallet_balance` (numeric, default 0)
- `loyalty_points` (integer, default 0)
- `total_spent` (numeric, default 0)
- `orders_count` (integer, default 0)
- `join_date` (timestamp)
- `last_visit` (timestamp)
- `is_vip` (boolean)
- `status` (`'active' | 'blocked'`)

**Note:** Clients are PER-STORE (same email can exist in multiple stores)

---

## Client Fetch Logic

**Function:** `fetchClients()`

**Query:**
```typescript
const { data } = await supabase
  .from('clients')
  .select('*')
  .eq('store_id', storeId)
  .order('created_at', { ascending: false });
```

**Filters (assumed from outline):**
- All clients
- VIP only
- Blocked
- Active
- Search by name/email

---

## Wallet Operations

### Open Wallet Modal

**Function:** `openWalletModal(client: Client)`

**Data Loaded:**
- `client.wallet_balance`
- Recent `wallet_transactions`

**Query (assumed):**
```typescript
const { data: transactions } = await supabase
  .from('wallet_transactions')
  .select('*')
  .eq('client_id', clientId)
  .order('created_at', { ascending: false })
  .limit(10);
```

---

### Add Balance

**Function:** `handleAddBalance()`

**Process:**
1. Admin enters amount
2. **Calls edge function** (assumed) or **RPC:**
   ```typescript
   await supabase.rpc('admin_add_wallet_balance', {
     p_client_id: clientId,
     p_amount: amount,
     p_staff_id: profile.id,
     p_description: 'Recarga manual por staff'
   });
   ```
3. **Creates `wallet_transaction`** with `type = 'topup_manual'`
4. **Updates** `clients.wallet_balance`
5. **Refreshes** client list

**Note:** Different from customer-initiated topup (which uses Mercado Pago)

---

## Loyalty Operations

### Open Points Modal

**Function:** `openPointsModal(client: Client)`

**Shows:**
- Current `loyalty_points`
- Recent `loyalty_transactions`

---

### Add Points

**Function:** `handleAddPoints()`

**Calls RPC:** `admin_add_points` (from `loyalty_engine.sql`)

```typescript
await supabase.rpc('admin_add_points', {
  target_client_id: clientId,
  points_amount: points,
  staff_id: profile.id,
  description: reason
});
```

**Creates:** Transaction with `type = 'adjustment'`

---

### Grant Gift

**Function:** `handleGrantGift()`

**Calls RPC:** `admin_grant_gift` (from `loyalty_engine.sql`)

```typescript
await supabase.rpc('admin_grant_gift', {
  target_client_id: clientId,
  gift_name: giftName,
  gift_description: description,
  staff_id: profile.id,
  product_id: productId,
  monetary_cost: cost,
  monetary_value: retailValue
});
```

**Purpose:** Record free item giveaways (e.g., promotional coffee)

---

## Activity Timeline

**Function:** `fetchTimeline()`

**Type:**
```typescript
interface TimelineEvent {
  type: 'order' | 'wallet' | 'loyalty' | 'note' | 'login';
  label: string;
  detail: string;
  timestamp: string;
  icon?: string;
}
```

**Data Sources:**

1. **Orders:**
   ```typescript
   const { data: orders } = await supabase
     .from('orders')
     .select('id, order_number, total_amount, created_at, status')
     .eq('client_id', clientId)
     .order('created_at', { ascending: false });
   ```

2. **Wallet Transactions:**
   ```typescript
   const { data: walletTx } = await supabase
     .from('wallet_transactions')
     .select('*')
     .eq('client_id', clientId)
     .order('created_at', { ascending: false});
   ```

3. **Loyalty Transactions:**
   ```typescript
   const { data: loyaltyTx } = await supabase
     .from('loyalty_transactions')
     .select('*')
     .eq('client_id', clientId)
     .order('created_at', { ascending: false});
   ```

4. **Notes:** (Assumed table: `client_notes`)

**Timeline Rendering:**
- Merged and sorted by timestamp
- Icons for each event type
- Color-coded by activity

---

## Block/Unblock

**Function:** `toggleBlockStatus(id: string)`

**Process:**
```typescript
const newStatus = client.status === 'active' ? 'blocked' : 'active';
await supabase
  .from('clients')
  .update({ status: newStatus })
  .eq('id', id);
```

**Effect:**
- Blocked clients cannot place orders (assumed)
- Wallet/loyalty remain intact

---

## Invitations

### Send Invite

**Function:** `handleSendInvite()`

**Flow (assumed):**
1. Admin enters client email
2. **Generate signup link:**
   ```
   {{app_url}}/#/m/:slug/auth?invite={{invite_token}}
   ```
3. **Send email** via edge function `send-email`
4. **Client clicks link** → Auto-associates with store

---

### Copy Link

**Function:** `handleCopyLink()`

**Copies to clipboard:**
```
{{app_url}}/#/m/:slug/auth
```

**Use Case:** Share via WhatsApp, social media

---

## Metrics / KPIs

**Component:** `MetricBlock`

**Metrics Shown (per client):**
- Total spent
- Order count
- Wallet balance
- Loyalty points
- Last visit date
- Lifetime value (LTV)

---

## Filters & Tabs

**Component:** `FilterTab`

**Options (assumed):**
- **Todos** — All clients
- **VIP** — `is_vip = true`
- **Activos** — `status = 'active'`
- **Bloqueados** — `status = 'blocked'`
- **Recientes** — Joined in last 30 days

---

## Activity Item Rendering

**Component:** `ActivityItem`

**Props:**
- `label` — Event title (e.g., "Pedido #123")
- `time` — Timestamp
- `detail` — Description
- `isNote` — Special styling for notes
- `icon` — Material icon name

---

## Key Observations

**✅ CONFIRMED:**
- Per-store client isolation
- Admin wallet topup (manual)
- Admin loyalty adjustments
- Timeline with merged activity
- Block/unblock functionality
- Invite system

**❓ UNKNOWN:**
- Whether `client_notes` table exists
- Full RLS policies for `clients` table
- Whether blocked clients can browse menu
- Email template for invites
- CSV export functionality
- Bulk operations (e.g., mass points grant)

**⚠️ NOTES:**
- Clients can exist WITHOUT auth account (guest orders)
- Email is NOT globally unique (per-store only)
- Wallet balance stored directly on `clients` (not separate table)
- Loyalty points stored directly on `clients` (ledger is in `loyalty_transactions`)
