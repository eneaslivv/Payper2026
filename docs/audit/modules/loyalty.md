# Loyalty Module — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Status:** AS-IS Documentation

---

## Module Overview

The Loyalty module implements a ledger-based points system where customers earn points on purchases and redeem them for rewards.

**Version:** v3.0 (Production Ready)  
**Architecture:** Ledger-based (all mutations tracked)

---

## Database Schema

### `loyalty_transactions` (Ledger — Source of Truth)

**Purpose:** Immutable ledger of all point movements

**Fields:**
- `id` (UUID, PK)
- `created_at` (timestamp)
- `store_id` (UUID, FK to stores)
- `client_id` (UUID, FK to clients)
- `order_id` (UUID, FK to orders, nullable)
- `type` (`'earn' | 'burn' | 'gift' | 'expire' | 'adjustment' | 'rollback'`)
- `points` (integer, signed: + for earn/gift, - for burn/expire)
- `monetary_cost` (numeric, COGS of gifted item)
- `monetary_value` (numeric, retail value of gifted item)
- `description` (string)
- `staff_id` (UUID, FK to profiles, nullable)
- `metadata` (JSONB)
- `is_rolled_back` (boolean, default false)

**Indexes:**
- UNIQUE: `idx_loyalty_tx_order_earn` on `order_id` WHERE `type='earn'` (idempotent)
- UNIQUE: `idx_loyalty_tx_order_burn` on `order_id` WHERE `type='burn'` (idempotent)
- `idx_loyalty_tx_client` on `client_id`
- `idx_loyalty_tx_store` on `store_id`

**Balance Calculation:**
```sql
SELECT SUM(points) FROM loyalty_transactions 
WHERE client_id = ? AND is_rolled_back = false;
```

---

### `loyalty_redemptions` (Burn Details)

**Purpose:** Details of reward redemptions (linked to burn transactions)

**Fields:**
- `id` (UUID, PK)
- `created_at` (timestamp)
- `transaction_id` (UUID, FK to loyalty_transactions)
- `reward_id` (UUID, FK to loyalty_rewards)
- `order_id` (UUID, FK to orders)
- `cost_points` (integer)
- `cost_value` (numeric, COGS)
- `retail_value` (numeric)
- `product_id` (UUID, FK to inventory_items)
- `is_rolled_back` (boolean)

---

### `loyalty_rewards` (Reward Catalog)

**Purpose:** Defines available rewards

**Fields (inferred from CheckoutPage.tsx):**
- `id` (UUID, PK)
- `store_id` (UUID)
- `name` (string)
- `points` (integer, cost to redeem)
- `product_id` (UUID, FK to inventory_items, nullable)
- `is_active` (boolean)

---

### `loyalty_configs` (Per-Store Configuration)

**Purpose:** Store-specific loyalty settings

**Fields (inferred from loyalty_engine.sql):**
- `store_id` (UUID, PK)
- `config` (JSONB):
  ```json
  {
    "isActive": true,
    "baseAmount": 100,
    "basePoints": 1,
    "rounding": "down"
  }
  ```

**Explanation:**
- `baseAmount`: Spend required for `basePoints` (e.g., $100 = 1 point)
- `basePoints`: Points awarded per `baseAmount`
- `rounding`: `'down' | 'normal' | 'up'`

---

### `loyalty_product_rules` (Per-Product Multipliers)

**Purpose:** Custom point multipliers for specific products

**Fields (inferred):**
- `store_id` (UUID)
- `product_id` (UUID)
- `multiplier` (numeric, e.g., 2 for double points)

---

## Point Earning Flow

### Trigger

**File:** `loyalty_engine.sql`

**Database Trigger:**
```sql
CREATE TRIGGER on_order_payment_approved_loyalty
AFTER UPDATE OF payment_status ON orders
FOR EACH ROW
EXECUTE FUNCTION trigger_process_loyalty_earn();
```

**Trigger Logic:**
1. Fires when `payment_status` changes TO `'approved'`
2. Skips if `client_id` is NULL
3. Calls `calculate_order_points(order_id)`
4. Inserts to `loyalty_transactions` with type= `'earn'`
5. Updates `clients.loyalty_points`

**Idempotency:**
- UNIQUE index on `(order_id, type='earn')` prevents duplicates
- Uses `ON CONFLICT DO NOTHING`

---

### Point Calculation

**Function:** `calculate_order_points(p_order_id)`

**Algorithm:**
```typescript
for each item in order:
  multiplier = loyalty_product_rules.multiplier || 1
  item_points = (item.unit_price * item.quantity / baseAmount) * basePoints * multiplier
  total_points += item_points

if (no items):
  total_points = (order.total_amount / baseAmount) * basePoints

// Apply rounding
if (rounding == 'down'): return FLOOR(total_points)
if (rounding == 'normal'): return ROUND(total_points)
if (rounding == 'up'): return CEIL(total_points)
```

**Example:**
- Config: `baseAmount=100`, `basePoints=1`, `rounding=down`
- Order: $350 total
- Points: `FLOOR(350 / 100 * 1) = 3 points`

---

## Reward Redemption Flow

### UI Flow

**File:** `pages/client/CheckoutPage.tsx`

1. **Customer at checkout** sees available rewards
2. **UI queries:**
   ```typescript
   const { data: rewards } = await supabase
     .from('loyalty_rewards')
     .select('*')
     .eq('store_id', storeId)
     .eq('is_active', true);
   ```
3. **Customer selects reward** (if points >= reward.points)
4. **Order created** WITHOUT reward redeemed yet
5. **After order creation**, calls RPC:
   ```typescript
   await supabase.rpc('redeem_reward', {
     p_client_id: clientId,
     p_reward_id: rewardId,
     p_order_id: orderId
   });
   ```

---

### Redemption Logic

**Function:** `redeem_reward(p_client_id, p_reward_id, p_order_id)`

**File:** `loyalty_engine.sql` (lines 173-245)

**Process:**
1. **Lock client row** (`FOR UPDATE`)
2. **Fetch reward** (verify `is_active`)
3. **Check balance:** `client.loyalty_points >= reward.points`
4. **Insert to `loyalty_transactions`:**
   - `type = 'burn'`
   - `points = -reward.points` (negative)
   - Idempotent via UNIQUE index on `(order_id, type='burn')`
5. **Insert to `loyalty_redemptions`** (detail record)
6. **Update balance:** `loyalty_points -= reward.points`
7. **Return** `{success: true, new_balance, points_spent}`

**Concurrency Safety:**
- `FOR UPDATE` lock prevents race conditions
- UNIQUE index prevents double redemption

---

## Rollback Logic

**Function:** `rollback_redemption(p_order_id)`

**Triggered When:** Order cancelled after reward redemption

**Process:**
1. Find active `burn` transaction for order
2. Mark as `is_rolled_back = true` (NOT deleted)
3. Create new transaction with `type = 'rollback'` and `points = +reward.points`
4. Restore `client.loyalty_points`

**Audit Trail:** Retained via `is_rolled_back` flag

---

## Admin Functions

### Add Points Manually

**Function:** `admin_add_points(client_id, points_amount, staff_id, description)`

**Creates:** Transaction with `type = 'adjustment'`

**Use Cases:**
- Compensation
- Promotional bonuses
- Error correction

---

### Grant Gift

**Function:** `admin_grant_gift(client_id, gift_name, staff_id, product_id, monetary_cost, monetary_value)`

**Creates:** Transaction with `type = 'gift'` and `points = 0`

**Purpose:** Track non-point gifts (e.g., free coffee)

**Accounting:**
- `monetary_cost`: COGS
- `monetary_value`: Retail price

---

## UI Component

**File:** `pages/Loyalty.tsx`

**Tabs:**
-  **Configuración** — Set `baseAmount`, `basePoints`, rounding
- **Recompensas** — Manage reward catalog
- **Reglas por Producto** — Set multipliers
- **Análisis** — View stats (not fully inspected)

**Features:**
- AI Strategy Generator (Google Generative AI)
- Reward CRUD
- Per-product multiplier rules

---

## RLS Policies

**File:** `loyalty_engine.sql` (lines 375-413)

### `loyalty_transactions`

**Read (Clients):**
```sql
FOR SELECT USING (client_id = auth.uid())
```

**Manage (Staff):**
```sql
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'store_owner', 'cashier', 'manager')
  )
)
```

### `loyalty_redemptions`

**Read (Clients):**
```sql
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM loyalty_transactions 
    WHERE id = loyalty_redemptions.transaction_id 
    AND client_id = auth.uid()
  )
)
```

**Manage (Staff):** Same as transactions

---

## Balance Verification

**Function:** `verify_loyalty_balance(p_client_id)`

**Returns:**
```json
{
  "ledger_sum": 150,
  "cached_balance": 150,
  "is_consistent": true
}
```

**Purpose:** Detect drift between ledger and `clients.loyalty_points`

---

## Key Observations

**✅ CONFIRMED:**
- Ledger-based architecture
- Automatic points on payment approval
- Idempotent earn/burn logic
- Rollback support
- Admin manual adjustments
- Per-product multipliers
- Balance verification function

**❓ UNKNOWN:**
- Whether `loyalty_product_rules` UI is complete
- Point expiration logic (type='expire' exists but not used)
- Client-facing loyalty dashboard structure
- Whether gifts are displayed in client UI

**⚠️ NOTES:**
- All point movements tracked in ledger
- `clients.loyalty_points` is cached (derived from ledger)
- Concurrency safe via row locks
- Trigger only fires on `payment_status` → `'approved'`
