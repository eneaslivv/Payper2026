# SaaS UI Routes — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Layout:** `SaaSLayout`  
**Users:** `super_admin` only

---

## Layout Overview

**File:** `App.tsx` (lines 84-162)

**Access:** Restricted to `super_admin` role

**Design:** Dark "GOD MODE" theme with grid background

**Branding:** SQUAD**HQ** — Master Control

---

## Access Control

**Entry Condition:**
```typescript
if (isAdmin) { // super_admin role
  return <SaaSLayout>...</SaaSLayout>;
}
```

**Blocked For:**
- `store_owner`
- `staff`
- `customer`

---

## Route Map

### Dashboard (Global Vision)
- **Path:** `/`
- **Component:** `SaaSAdmin` (tab: `tenants`)
- **Description:** Platform-wide overview
- **Redirect:** Default tab is "tenants"

---

### Platform Management

#### Tenant Management
- **Path:** `/tenants`
- **Component:** `SaaSAdmin` (tab: `tenants`)
- **Description:** Manage all stores
- **Features (assumed):**
  - List all stores
  - Create new store
  - Edit store settings
  - Pause/delete stores
  - View store metrics

#### Global Users
- **Path:** `/users`
- **Component:** `SaaSAdmin` (tab: `users`)
- **Description:** Platform-wide user management
- **Features (assumed):**
  - List all users (across all stores)
  - View user roles
  - Manage permissions
  - Block/unblock users

---

### Economics

#### Plans & Billing
- **Path:** `/plans`
- **Component:** `SaaSAdmin` (tab: `plans`)
- **Description:** Subscription plan management
- **Features (assumed):**
  - Define pricing tiers
  - Assign plans to stores
  - View billing history
  - Generate invoices

#### MRR Metrics
- **Path:** `/metrics`
- **Component:** `SaaSAdmin` (tab: `metrics`)
- **Description:** Monthly Recurring Revenue analytics
- **Features (assumed):**
  - MRR trends
  - Churn rate
  - Active subscriptions
  - Revenue forecasting

---

### System

#### Master Audit
- **Path:** `/audit`
- **Component:** `SaaSAdmin` (tab: `audit`)
- **Description:** Platform-wide audit logs
- **Features (assumed):**
  - System-level event log
  - User actions across stores
  - Security events
  - API usage

#### Engine Config
- **Path:** `/settings`
- **Component:** `SaaSAdmin` (tab: `settings`)
- **Description:** Platform configuration
- **Features (assumed):**
  - Feature flags
  - System parameters
  - Integrations
  - Email templates

---

## Sidebar Structure

**Groups:**

1. **Plataforma**
   - Visión Global (`/`)
   - Gestión Locales (`/tenants`)
   - Usuarios Globales (`/users`)

2. **Economía**
   - Planes y Billing (`/plans`)
   - Métricas MRR (`/metrics`)

3. **Sistema**
   - Auditoría Master (`/audit`)
   - Config. Motor (`/settings`)

**Logout Button:**
- Red styled
- Bottom of sidebar

---

## Special Routes

### Join Team (Fallback)
- **Path:** `/join`
- **Component:** `JoinTeam`
- **Description:** Staff invitation acceptance (accessible from SaaS)

---

### QR Resolver (Fallback)
- **Path:** `/qr/:hash`
- **Component:** `QRResolver`
- **Description:** QR code resolution (testing)

---

### Client Menu (Testing Access)

**Path Prefix:** `/m/:slug`

Super admins can access client menu routes for testing:
- `/m/:slug` — Menu browse
- `/m/:slug/product/:id` — Product detail
- `/m/:slug/cart` — Cart
- `/m/:slug/checkout` — Checkout
- `/m/:slug/tracking/:orderId` — Order tracking
- `/m/:slug/auth` — Client login
- `/m/:slug/profile` — Client profile
- `/m/:slug/loyalty` — Loyalty
- `/m/:slug/wallet` — Wallet

**Use Case:** QA testing of customer experience

---

## Fallback Routes

- **`*`** → Redirect to `/` (catch-all)

---

## Header Features

**Left Side:**
- Connection indicator: "CONEXIÓN SEGURA **ENCRIPTADA**"
- Animated neon dot

**Right Side:**
- User email display
- Role indicator: "Super Admin"
- Avatar (placeholder circle)

**No Notifications or Shortcuts** (unlike OperativeLayout)

---

## SaaSAdmin Component

**File:** `pages/SaaSAdmin.tsx` (not inspected)

**Purpose:** Multi-tab admin panel

**Props:**
```typescript
{
  initialTab: 'tenants' | 'users' | 'plans' | 'metrics' | 'audit' | 'settings'
}
```

**Behavior:**
- Routes map to tabs within single component
- Tab state likely controlled by URL

---

## Design Theme

**Colors:**
- Background: `#050605` (near black)
- Sidebar: `#0A0C0A` (dark gray)
- Accent: `#B4965C` (gold)
- Text: White + low opacity variations

**Visual Elements:**
- Grid pattern background (40px squares)
- Animated pulse on status dots
- Glow effects on branding

**Typography:**
- Headers: Uppercase, tracking-widest
- Small labels: 7-8px, bold, uppercase

---

## Security

### Role Check

**Code (lines 638-675):**
```typescript
if (isAdmin) {
  return <SaaSLayout>...</SaaSLayout>;
}
```

**Bypass Logic:**
- Email: `livvadm@gmail.com` → `isAdmin = true`
- Direct `super_admin` role → `isAdmin = true`

### Customer Blocking

Customers are **blocked** at routing level before reaching SaaS check.

---

## Key Observations

**✅ CONFIRMED:**
- Super admin exclusive
- Multi-tenant management
- Client menu testing access
- Dark theme "GOD MODE" UI

**❓ UNKNOWN:**
- Full `SaaSAdmin` component structure
- Tenant creation workflow
- Billing integration (Stripe? Custom?)
- Whether impersonation feature exists
- Full audit log schema

**⚠️ NOTES:**
- Single component (`SaaSAdmin`) handles all tabs
- No permission system within SaaS (super admin has full access)
- Can access client menus for testing
- Grid background for "control room" aesthetic
