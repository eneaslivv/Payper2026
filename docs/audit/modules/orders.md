# Orders Module — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Status:** PARTIAL (Phase 3 in progress)

---

## Module Overview

The Orders module handles the complete order lifecycle from creation to delivery. Two main components:

1. **OrderBoard.tsx** — Kanban/list view for managing active and historical orders
2. **OrderCreation.tsx** — POS interface for creating new orders

---

## OrderBoard Component

**File:** `pages/OrderBoard.tsx`

### Purpose
Real-time order management dashboard with kanban columns and keyboard shortcuts.

### Order Lifecycle States

```
Pendiente → En Preparación → Listo → Entregado
                                ↓
                           Cancelado
```

**State Definitions:**
- **Pendiente**: New order received, not started
- **En Preparación**: Kitchen is preparing
- **Listo**: Ready for pickup/delivery
- **Entregado**: Delivered to customer (final)
- **Cancelado**: Cancelled (final)
- **Demorado**: Visual indicator only (not a status)

### Key Features

**View Modes:**
- Kanban (default) — Column-based drag-and-drop
- List — Table view with sorting

**Filters:**
- Status filter (TODOS, Pendiente, En Preparación, Listo)
- Search by order ID, customer name, order number
- History toggle (Entregados, Cancelados)

**Payment Integration:**
- Blocks advancing Mercado Pago orders until `is_paid = true`
- Shows payment badges (Efectivo, Mercado Pago, Saldo, Pendiente)

**Keyboard Shortcuts:**
- `1` → Set to Pendiente
- `2` → Set to En Preparación
- `3` → Set to Listo
- `4` → Mark as Entregado
- `X` → Cancel order (requires confirmation)
- `ESC` → Close detail panel

**Delay Detection:**
- Orders older than 15 min OR dynamic threshold show warning badge
- Dynamic threshold: `10 + floor(activeOrderCount / 5) * 2` minutes

### Data Source

**Context:** `useOffline()` (probably wraps Supabase realtime)
- `orders` — Array of Order objects
- `updateOrderStatus()` — Updates status locally + DB
- `confirmOrderDelivery()` — Special handler for "Entregado"
- `refreshOrders()` — Reload from DB

**Realtime:** Component likely subscribes to `orders` table changes (setup in useEffect, code omitted in file)

### Order Display

**Order Card Shows:**
- Order number (from `order.order_number` or truncated ID)
- Customer name
- Table/location ("Mesa X" or "Para Llevar")
- Timestamp
- List of first 3 items
- Total amount
- Payment badge
- Delay badge (if delayed)

**Side Panel (Detail):**
- Full order information
- All items with quantities and notes
- Total amount
- Action buttons:
  - Advance status (primary action)
  - Cancel order
  - Print (UI only, no functionality shown)

### Payment Badge Logic

```typescript
if (!isPaid) {
  if (provider === 'mercadopago') → "PAGO PENDIENTE" (red)
  else → "PENDIENTE" (red)
} else if (provider === 'mercadopago') → "MERCADO PAGO" (blue)
else if (provider === 'wallet') → "SALDO" (violet)
else → "EFECTIVO" (amber)
```

### Known Behaviors

**✅ CONFIRMED:**
- Drag-and-drop between columns
- Keyboard navigation
- Payment status validation before advancing
- Delay warnings
- Real-time updates

**❓ UNKNOWN:**
- Actual realtime subscription setup
- Print functionality implementation
- Whether "Demorado" status is stored in DB or UI-only

**🔧 BROKEN (Commented Out):**
- Payment filter (lines 154-161) — Hides unpaid MP orders entirely (disabled)

---

## OrderCreation Component

**File:** `pages/OrderCreation.tsx`

**Status:** OUTLINE ONLY (not fully inspected due to length)

### Key Functions (from outline):
- `fetchData()` — Load products, clients, tables
- `handleAddToCart()` — Add product to cart
- `removeFromCart()` — Remove item
- `modifyLastItem()` — Adjust quantity of last added item
- `handleConfirmSale()` — Create order
- `resetOrder()` — Clear cart
- `handleKeyDown()` — Keyboard shortcuts
- `startScanner()` / `stopScanner()` — Barcode scanning

### Keyboard Shortcuts (detected):
- Multiple shortcuts for quick product selection
- Cart manipulation via keys

### Cart Display:
- `CartContent()` component renders current cart

---

## Order Data Model

**Table:** `orders`

**Key Fields (inferred from OrderBoard):**
- `id` (UUID)
- `store_id` (UUID)
- `customer` (string, display name)
- `client_email` (string, nullable)
- `client_id` (UUID, nullable)
- `table_id` (UUID, nullable)
- `order_number` (integer, sequential per store)
- `status` (OrderStatus enum)
- `payment_status` (string, e.g., "approved", "paid", "pending")
- `payment_provider` (string, e.g., "mercadopago", "wallet", "cash")
- `payment_method` (string, alias for provider)
- `is_paid` (boolean)
- `amount` (numeric)
- `time` (string, formatted time)
- `created_at` (timestamp)
- `items` (JSONB array of OrderItem)

**OrderItem Structure:**
```typescript
{
  id: string,
  name: string,
  quantity: number,
  price_unit: number,
  notes?: string
}
```

---

## Integration Points

### Payments
- Mercado Pago orders MUST be paid before advancing past "Pendiente"
- Wallet orders deduct from `clients.wallet_balance`
- Cash orders assumed paid on delivery

### Clients
- If `client_id` set, contributes to:
  - `clients.total_spent`
  - `clients.orders_count`
  - Loyalty points

### Tables
- If `table_id` set, links order to QR table

### Inventory
- OrderItem has `inventory_items_to_deduct` field (not shown in UI)
- Likely consumed on order completion

---

## Status Transitions

**Allowed Transitions (from handleAdvanceStatus):**
- Pendiente → En Preparación
- En Preparación → Listo
- Listo → Entregado

**Special Transitions:**
- Any → Cancelado (via keyboard `X` or side panel button)
- Any → Any (via drag-and-drop or manual status change)

**Delivery Confirmation:**
- Uses `confirmOrderDelivery()` instead of `updateOrderStatus()`
- Likely records who delivered and timestamp

---

## Notes

- **HISTORY MODE:** Separate view for Entregado/Cancelado orders
- **SEARCH:** Works on order number, customer name, full ID
- **REALTIME:** Orders update live (subscription mechanism not shown)
- **OFFLINE:** Uses OfflineContext for sync
- **DRAG-AND-DROP:** Framer Motion for animations
