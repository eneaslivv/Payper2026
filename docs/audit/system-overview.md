# System Overview — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Status:** AS-IS Documentation

---

## Tech Stack

### Core Framework
- **Frontend:** React 19.2.3
- **Build Tool:** Vite 6.2.0
- **Router:** React Router DOM 7.11.0 (HashRouter)
- **Language:** TypeScript 5.8.2
- **Styling:** Tailwind CSS 4.1.18

### Backend & Database
- **BaaS:** Supabase (@supabase/supabase-js 2.89.0)
- **Database:** PostgreSQL (via Supabase)
- **Auth:** Supabase Auth
- **Storage:** Supabase Storage
- **Edge Functions:** Supabase Functions (Deno runtime)

### Key Libraries
- **Payments:** Mercado Pago integration (custom)
- **QR Codes:** qrcode.react 4.2.0, jsqr 1.4.0
- **Charts:** Recharts 3.6.0
- **PDF Generation:** jsPDF 3.0.4
- **AI:** @google/generative-ai 0.24.1
- **Animations:** Framer Motion 11.18.2
- **Toasts:** Sonner 2.0.7
- **Icons:** Material Symbols (web font)

---

## Application Structure

### Three Main Layouts

The platform operates across **three distinct UI contexts**, each serving different user types:

#### 1. **ClientLayout** — Customer-Facing Menu
**Component:** `components/client/ClientLayout.tsx`  
**Route Pattern:** `#/m/:slug`

**Purpose:**  
Mobile-first menu experience for end customers. Customers browse products, place orders, and track order status.

**Who Accesses:**
- End customers (role: `customer`)
- Any unauthenticated user visiting `/m/:slug`

**Features:**
- Bottom navigation (BottomNav.tsx)
- Active order widget
- Auth prompt modal for loyalty/wallet features
- Responsive mobile UI (max-width: md, centered)
- Theme-aware (store.menu_theme.accentColor)

**Key Routes:**
- `/m/:slug` → Menu page
- `/m/:slug/product/:id` → Product detail
- `/m/:slug/cart` → Cart
- `/m/:slug/checkout` → Checkout
- `/m/:slug/tracking/:orderId` → Order tracking
- `/m/:slug/order/:orderId` → Order status
- `/m/:slug/auth` → Client authentication
- `/m/:slug/profile` → Client profile
- `/m/:slug/loyalty` → Loyalty rewards
- `/m/:slug/wallet` → Client wallet

**Context Provider:**  
`ClientProvider` (from `contexts/ClientContext.tsx`)

**Data Loaded:**
- Store information (via slug)
- Active orders for current client
- Client session persistence

---

#### 2. **OperativeLayout** — Store Operations Panel
**Component:** Inline in `App.tsx` (lines 165-429)  
**Access:** Authenticated users with `store_owner` or staff roles

**Purpose:**  
Daily operations interface for store staff. Handles order management, inventory, clients, and venue control.

**Who Accesses:**
- `store_owner`
- Staff with assigned role_id (cafe_roles table)
- **GOD MODE users:** livvadm@gmail.com, livveneas@gmail.com

**Key UI Features:**
- Sidebar navigation (left panel, 220px width)
- Dynamic permissions via `PermissionGuard` and `RoleGuard`
- Notification center (toasts + live activity panel)
- Global shortcuts:
  - `N` → Create new order
  - `G` → Go to order board
  - `B` → Toggle bar mode (simplified UI)
  - `Ctrl/Cmd + K` → Open scanner
  - `Shift+Alt+L` → Emergency logout

**Branding:**
- Displays store logo and name (from `stores` table)
- Updates on `store_updated` event

**Sections (Sidebar Groups):**

**OPERACIONES:**
- `/orders` → Order dispatch board (OrderBoard.tsx)
- `/tables` → Tables & venue nodes (TableManagement.tsx)

**LOGÍSTICA:**
- `/inventory` → Inventory management (InventoryManagement.tsx)
- `/design` → Menu design (MenuDesign.tsx)

**NEGOCIO:**
- `/clients` → Client management (Clients.tsx)
- `/loyalty` → Loyalty engine (Loyalty.tsx)
- `/finance` → Financial dashboard (Finance.tsx)

**Permission System:**
Each route is wrapped in `PermissionGuard` which checks:
1. `hasPermission(section)` from AuthContext
2. Falls back to "allow all" if user has no `role_id`

**Fallback Logic:**
If `profile.role_id` is null/undefined, all sections are accessible.

---

#### 3. **SaaSLayout** — Super Admin Control
**Component:** Inline in `App.tsx` (lines 85-162)  
**Access:** Users where `profile.role === 'super_admin'`

**Purpose:**  
Platform-wide administration. Manage tenants (stores), users, billing, and audit logs.

**Who Accesses:**
- Users with `super_admin` role
- **Detected by:** `isAdmin` flag in AuthContext

**UI Theme:**
- Dark mode (`bg-[#050605]`)
- Gold accents (`accent` color: #B4965C)
- "GOD MODE" aesthetic
- Grid background overlay

**Routes:**

**/Plataforma:**
- `/` → Global vision dashboard
- `/tenants` → Store/tenant management (SaaSAdmin tab: tenants)
- `/users` → Global user management (SaaSAdmin tab: users)

**/Economía:**
- `/plans` → Billing plans (SaaSAdmin tab: plans)
- `/metrics` → MRR metrics (SaaSAdmin tab: metrics)

**/Sistema:**
- `/audit` → Master audit logs (SaaSAdmin tab: audit)
- `/settings` → Engine configuration (SaaSAdmin tab: settings)

**Embedded Routes:**
SaaS admins can ALSO access:
- `/m/:slug` → Client menus (for testing)
- `/join` → Team onboarding flow
- `/qr/:hash` → QR resolver

**Component:**  
All tabs render through `SaaSAdmin.tsx` with `initialTab` prop.

---

## Routing Flow (App.tsx Entry Point)

```
App.tsx
├── ToastProvider
│   └── AuthProvider
│       └── MainRouter
│           ├── [PUBLIC] Client Menu Routes (isClientMenu || isOrderRoute || isQRRoute)
│           │   └── ClientProvider → ClientLayout → Routes
│           ├── [PUBLIC] QRResolver (#/qr/:hash)
│           ├── [PUBLIC] OrderConfirmation (#/orden/:orderId/*)
│           ├── [UNAUTHENTICATED] Login Screen
│           │   └── Allowed: /join, /setup-owner
│           ├── [PROFILE CHECK] Configuring Account (if user && !profile)
│           ├── [INACTIVE CHECK] Access Denied (if !is_active && !isAdmin)
│           ├── [SUPER_ADMIN] SaaSLayout → SaaSAdmin routes
│           ├── [CUSTOMER SECURITY] Redirect customer role to /m/:slug
│           └── [OPERATIVE] OperativeLayout → Operative routes
```

**Critical Routing Logic:**
1. **Public routes checked FIRST** (before auth) to allow unauthenticated menu access
2. **Profile integrity enforced** except for:
   - Client routes
   - GOD MODE users (livvadm@gmail.com, livveneas@gmail.com)
   - Checkout return URLs (Mercado Pago callbacks)
3. **Role-based layout selection:**
   - `super_admin` → SaaSLayout
   - `customer` → Forced to ClientLayout (security measure)
   - All others → OperativeLayout

---

## Data Flow Overview

### Authentication Flow
1. User signs in → Supabase Auth creates session
2. `AuthContext` calls `fetchProfile()` → loads from `profiles` table
3. Profile contains:
   - `role` (customer | store_owner | super_admin)
   - `role_id` (FK to cafe_roles, NULL for owners)
   - `store_id` (FK to stores)
   - `is_active` (approval status)
4. Based on role, routing determines layout

### Store Context (Operative)
- `AuthContext` provides `profile.store_id`
- All queries filter by `store_id`
- RLS policies enforce tenant isolation

### Client Context (Customer-Facing)
- URL slug resolves to store
- `ClientContext` loads store, menu, products
- Session persistence via `localStorage` or auth
- Active orders tracked by `client_id`

---

## External Integrations

### 1. Mercado Pago (Payment Gateway)

**Files:**
- `hooks/useMercadoPagoConnect.ts` — OAuth connection flow
- `components/PaymentSettings.tsx` — UI for linking account
- `supabase/functions/create-topup/index.ts` — Creates payment preferences
- `supabase/functions/mp-webhook/index.ts` — Handles payment notifications
- `supabase/functions/verify-payment-status/index.ts` — Verifies payment status
- `api/verify-payment.js` — Legacy payment verification
- `force_verify.cjs` — Manual payment verification script

**OAuth Flow:**
1. Store owner clicks "Connect Mercado Pago"
2. Redirects to `auth.mercadopago.com.ar/authorization`
3. Returns with `code` → exchanged for access token
4. Token stored in `stores.mp_access_token`

**Payment Flow:**
1. Customer selects Mercado Pago at checkout
2. Edge function `create-topup` creates preference
3. Returns `init_point` → redirect to Mercado Pago
4. Customer pays
5. Webhook `mp-webhook` receives notification
6. Verifies payment, updates order status
7. Customer redirected to `/orden/:orderId/confirmado`

**Status Mapping:**
- `approved` → Order marked as paid
- `pending` → Order remains in pending state
- `rejected` → Order marked as failed

**API Endpoints Used:**
- `POST /checkout/preferences` — Create payment link
- `GET /v1/payments/search` — Search payments by external_reference
- `GET /v1/payments/:id` — Get payment details
- `POST /oauth/token` — Refresh access token

---

### 2. Google Generative AI

**File:** `components/AIChat.tsx`  
**Library:** `@google/generative-ai`

**Purpose:**  
In-app AI assistant for operational help.

**Capabilities:**
- Audit configuration (Mercado Pago, roles)
- Answer operational questions
- Provide platform guidance

**Status:** ACTIVE (appears in OperativeLayout)

---

### 3. PWA Features

**Files:**
- `manifest.json` — App manifest
- `sw.js` — Service worker
- `index.html` — PWA meta tags

**Behavior:**
- Standalone mode detection
- Auto-redirect to last visited store (localStorage)
- Works offline (via OfflineContext)

---

## Known Config Files

- `.env` / `.env.local` — Supabase + Mercado Pago credentials
- `constants.tsx` — Mock data (MOCK_NODES, MOCK_TENANTS)
- `types.ts` — Shared type definitions
- `supabaseTypes.ts` — Auto-generated database types
- `tailwind.config.js` — Tailwind configuration
- `vite.config.ts` — Vite build config
- `vercel.json` — Deployment config

---

## Notes & Observations

**✅ WORKING:**
- React Router HashRouter for client-side routing
- Role-based layout selection
- Permission system (PermissionGuard)
- Theme-aware ClientLayout
- Mercado Pago integration

**❓ UNKNOWN:**
- Actual production deployment URL
- Number of active stores in production
- Whether MOCK_NODES/MOCK_TENANTS are used in production
- Offline sync logic (OfflineContext implementation not inspected)

**⚠️ NOTES:**
- GOD MODE users hardcoded: livvadm@gmail.com, livveneas@gmail.com
- Profile bypass logic exists for GOD MODE users
- Emergency logout shortcut: `Shift+Alt+L`
- Debug inspector available via `Shift+D`
- Customer role explicitly blocked from OperativeLayout (security)
