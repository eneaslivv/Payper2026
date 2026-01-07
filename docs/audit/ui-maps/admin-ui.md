# Admin UI Routes — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Layout:** `OperativeLayout`  
**Users:** `store_owner`, `staff`

---

## Layout Overview

**File:** `App.tsx` (lines 164-429)

**Access Control:**
- Store Owners: Full access (bypass permissions)
- Staff: Permission-gated routes (via `PermissionGuard`)

**Global Shortcuts:**
- `N` → Navigate to `/create-order`
- `G` → Navigate to `/orders`
- `B` → Toggle Bar Mode (simplified UI)
- `Ctrl+K` → Open scanner modal
- `Shift+Alt+L` → Emergency logout

---

## Route Map

### Dashboard
- **Path:** `/`
- **Component:** `Dashboard`
- **Permission:** `dashboard`
- **Description:** Main analytics view with KPIs

---

### Operations

#### Order Board
- **Path:** `/orders`
- **Component:** `OrderBoard`
- **Permission:** `orders`
- **Shortcut:** `G`
- **Description:** Kanban board for managing orders
- **Features:**
  - Drag-and-drop order cards
  - Status transitions
  - Payment validation

#### Create Order
- **Path:** `/create-order`
- **Component:** `OrderCreation`
- **Permission:** `orders`
- **Shortcut:** `N`
- **Description:** POS terminal for manual order creation
- **Features:**
  - Product selection
  - Cart management
  - Quick keyboard shortcuts

#### Scanner
- **Path:** `/scanner`
- **Component:** `Scanner`
- **Permission:** `orders`
- **Shortcut:** `Ctrl+K` (modal)
- **Description:** QR/barcode scanner for products

#### Tables & Venue
- **Path:** `/tables`
- **Component:** `TableManagement`
- **Permission:** `tables`
- **Description:** Visual table management (VenueSystem)
- ** Features:**
  - Drag-and-drop table layout
  - QR code generation
  - Real-time table status

---

### Logistics

#### Inventory
- **Path:** `/inventory`
- **Component:** `InventoryManagement`
- **Permission:** `inventory`
- **Description:** Product catalog & stock management
- **Features:**
  - Product CRUD
  - Recipe builder
  - Multi-location stock
  - AI invoice processor

#### Menu Design
- **Path:** `/design`
- **Component:** `MenuDesign`
- **Permission:** `design`
- **Description:** Visual menu builder for customer-facing UI
- **Features:**
  - Category organization
  - Product visibility
  - Menu theme customization

#### Menu Management
- **Path:** `/menus`
- **Component:** `MenuManagement`
- **Permission:** `inventory`
- **Description:** (Legacy?) Menu configuration

#### Invoice Processor
- **Path:** `/invoice-processor`
- **Component:** `InvoiceProcessor`
- **Permission:** `inventory`
- **Description:** AI-powered invoice scanning & bulk import

---

### Business

#### Clients
- **Path:** `/clients`
- **Component:** `Clients`
- **Permission:** `clients`
- **Description:** Customer database
- **Features:**
  - Client profiles
  - Wallet management
  - Loyalty points admin
  - Activity timeline

#### Loyalty
- **Path:** `/loyalty`
- **Component:** `Loyalty`
- **Permission:** `loyalty`
- **Description:** Loyalty program configuration
- **Features:**
  - Reward catalog
  - Points rules
  - Product multipliers
  - AI strategy generator

#### Finance
- **Path:** `/finance`
- **Component:** `Finance`
- **Permission:** `finance`
- **Description:** Financial reports & analytics
- **Features (assumed):**
  - Revenue tracking
  - Payment reconciliation
  - Cash register sessions

---

### Settings

#### Store Settings
- **Path:** `/settings`
- **Component:** `StoreSettings`
- **Permission:** `staff` (visible to owners + staff with permission)
- **Description:** Store configuration
- **Features (assumed):**
  - Mercado Pago connection
  - Store branding (logo, name)
  - Service mode settings
  - Menu theme

---

### Debug/Testing

#### Debug Payment
- **Path:** `/debug-payment`
- **Component:** `DebugPayment`
- **Permission:** None (developer tool)
- **Description:** Payment testing interface

---

## Sidebar Structure

**Groups:**

1. **<NONE>** (ungrouped)
   - Dashboard (`/`)

2. **OPERACIONES**
   - Despacho [G] (`/orders`)
   - Mesas y Salón (`/tables`)

3. **LOGÍSTICA**
   - Inventario (`/inventory`)
   - Diseño Menú (`/design`)

4. **NEGOCIO**
   - Clientes (`/clients`)
   - Fidelidad (`/loyalty`)
   - Finanzas (`/finance`)

**Permissions:**
- Items hidden if user lacks permission
- Groups auto-hide if all children are hidden

---

## Permission Mapping

| Route | Permission Slug | Fallback |
|-------|----------------|----------|
| `/` | `dashboard` | *(visible to all)* |
| `/orders` | `orders` | Redirect to `/` |
| `/create-order` | `orders` | Redirect to `/` |
| `/scanner` | `orders` | Redirect to `/` |
| `/tables` | `tables` | Redirect to `/` |
| `/inventory` | `inventory` | Redirect to `/` |
| `/design` | `design` | Redirect to `/` |
| `/menus` | `inventory` | Redirect to `/` |
| `/invoice-processor` | `inventory` | Redirect to `/` |
| `/clients` | `clients` | Redirect to `/` |
| `/loyalty` | `loyalty` | Redirect to `/` |
| `/finance` | `finance` | Redirect to `/` |
| `/settings` | *(staff)* | *(visible to all)* |

**Note:** `store_owner` and `super_admin` bypass all checks

---

## Client Routes (Accessible from Admin)

**Path Prefix:** `/m/:slug`

Admins can access client menu routes while logged in:
- `/m/:slug` — Menu browse
- `/m/:slug/product/:id` — Product detail
- `/m/:slug/cart` — Cart
- `/m/:slug/checkout` — Checkout
- `/m/:slug/tracking/:orderId` — Order tracking
- `/m/:slug/auth` — Client login/register
- `/m/:slug/profile` — Client profile
- `/m/:slug/loyalty` — Client loyalty view
- `/m/:slug/wallet` — Client wallet

**Use Case:** Store owners testing customer experience

---

## Auth Routes

#### Join Team
- **Path:** `/join`
- **Component:** `JoinTeam`
- **Description:** Staff invitation acceptance

#### Setup Owner
- **Path:** `/setup-owner`
- **Component:** `SetupOwner`
- **Description:** Initial store owner setup

---

## Fallback Routes

- **`/saas-admin`** → Redirect to `/` (blocked for non-super_admin)
- **`*`** → Redirect to `/` (catch-all)

---

## Header Features

**Left Side:**
- Mobile menu toggle (hamburger)
- Active node indicator: `NODE: {{node_name}}`

**Right Side:**
- Keyboard shortcut hint cards (`N`, `G`)
- Notification center icon (with unread badge)
- Scanner icon (link to `/scanner`)
- **"NUEVA MISIÓN [N]"** button → `/create-order`

---

## User Menu (Bottom Sidebar)

**Trigger:** Click user avatar

**Options:**
- **Settings** (`/settings`) — Only if `hasPermission('staff')`
- **Cerrar Sesión** — Logout button

**User Info Display:**
- Email (truncated)
- Role (e.g., "store_owner", "staff")

---

## Modals & Overlays

### Scan Order Modal
- **Trigger:** `Ctrl+K` or custom event
- **Component:** `ScanOrderModal`
- **Purpose:** Quick QR/barcode scan

### AI Chat
- **Component:** `AIChat`
- **Purpose:** AI assistant overlay

### Offline Indicator
- **Component:** `OfflineIndicator`
- **Purpose:** Show connection status

### Notification Panel
- **Component:** `NotificationPanel`
- **Trigger:** Notification center icon
- **Purpose:** Toast/notification history

---

## UI State: Bar Mode

**Toggle:** `B` key

**Effect:**
- Increases font size (`text-lg` class on root)
- Simplifies UI for bartenders

**Toast Message:**
- On: "MODO BAR (UI SIMPLIFICADA)"
- Off: "MODO BAR DESACTIVADO"

---

## Security

### Customer Blocking

**Code (lines 677-700):**
```typescript
if (profile?.role === 'customer') {
  return <Navigate to={`/m/${lastSlug}`} replace />;
}
```

Customers are **explicitly blocked** from accessing admin routes.

---

## Key Observations

**✅ CONFIRMED:**
- All routes permission-gated
- Global keyboard shortcuts
- Store owner bypass
- Customer blocking
- Offline support

**❓ UNKNOWN:**
- Complete `Finance` component structure
- Whether `MenuManagement` is deprecated
- Full staff role assignment UI

**⚠️ NOTES:**
- Routes use hash routing (`#/`)
- PermissionGuard wraps protected routes
- Sidebar items auto-hide based on permissions
