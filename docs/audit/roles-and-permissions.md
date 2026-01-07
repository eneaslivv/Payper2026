# Roles and Permissions — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Status:** AS-IS Documentation

---

## Role System Overview

Payper uses a **4-tier role-based access control (RBAC)** system managed through the `profiles` table and enforced via:

1. **AuthContext** (`contexts/AuthContext.tsx`)
2. **PermissionGuard** component (`components/PermissionGuard.tsx`)
3. **RoleGuard** component (`components/RoleGuard.tsx`)
4. **Row Level Security (RLS)** policies in Supabase

---

## Roles Defined in Code

**Source:** `contexts/AuthContext.tsx` (line 9)

```typescript
export type UserRole = 'super_admin' | 'store_owner' | 'staff' | 'customer';
```

### 1. **super_admin** (Platform Administrator)

**Database Field:** `profiles.role = 'super_admin'`

**Who Gets This Role:**
- Platform administrators only
- **GOD MODE users:** `livvadm@gmail.com` (hardcoded bypass)

**Access Level:**
- Full platform access
- All stores visible
- Can manage tenants, users, billing
- Bypasses all permission checks

**Accessible Layouts:**
- **SaaSLayout** (primary)
- Can also access OperativeLayout (for store testing)
- Can access ClientLayout (for menu testing)

**Routes:**
- `/` → Global dashboard
- `/tenants` → Tenant management
- `/users` → User management
- `/plans` → Billing plans
- `/metrics` → MRR metrics
- `/audit` → Audit logs
- `/settings` → System configuration

**Permission System:**
- `permissions` state = `null` (full access)
- `hasPermission()` always returns `true`
- `PermissionGuard` always renders children

**RLS Behavior:**
- NOT filtered by `store_id`
- Can see all data across all stores
- RLS policies check for `auth.is_super_admin()` function

**UI Features:**
- Gold accent color (#B4965C)
- "GOD MODE" branding
- Master audit logs
- Economic metrics

---

### 2. **store_owner** (Store Administrator)

**Database Field:** `profiles.role = 'store_owner'`

**Who Gets This Role:**
- Store owners
- **GOD MODE users:** `livveneas@gmail.com` (hardcoded for store ID: `f5e3bfcf-3ccc-4464-9eb5-431fa6e26533`)

**Access Level:**
- Full access to their own store
- Cannot see other stores
- Can manage staff, inventory, orders
- Can configure store settings

**Accessible Layouts:**
- **OperativeLayout** (primary)
- Can access ClientLayout (for menu preview)

**Routes (OperativeLayout):**
- `/` → Dashboard
- `/orders` → Order board
- `/tables` → Table management
- `/inventory` → Inventory management
- `/design` → Menu design
- `/clients` → Client management
- `/loyalty` → Loyalty program
- `/finance` → Financial dashboard
- `/settings` → Store settings

**Permission System:**
- `permissions` state = `null` (full access within store)
- `profile.role_id` = `NULL` (no cafe_roles assignment)
- `hasPermission()` always returns `true`
- `PermissionGuard` always renders children

**RLS Behavior:**
- Filtered by `profiles.store_id`
- RLS policies check `auth.get_user_store_id() = store_id`
- Only sees data from their store

**UI Features:**
- Neon green accent (#4ADE80)
- Store branding (logo, name from `stores` table)
- Sidebar navigation with all sections

**Impersonation:**
- Super admins can impersonate stores via `localStorage.setItem('impersonated_store_id', storeId)`

---

### 3. **staff** (Store Employee)

**Database Field:** `profiles.role = 'staff'` (IMPLIED — not explicitly set)

**Who Gets This Role:**
- Store employees
- Users with `profile.role_id` pointing to `cafe_roles` table

**Access Level:**
- LIMITED access based on assigned role permissions
- Only sees sections granted by `cafe_role_permissions`

**Accessible Layouts:**
- **OperativeLayout** (primary)

**Routes (depends on permissions):**
- Routes are wrapped in `PermissionGuard`
- Example sections:
  - `dashboard`
  - `orders`
  - `tables`
  - `inventory`
  - `design`
  - `clients`
  - `loyalty`
  - `finance`

**Permission System:**
- `profile.role_id` → FK to `cafe_roles.id`
- `permissions` state loaded from `cafe_role_permissions` table
- `hasPermission(slug, action)` checks permissions map
- Example permission check:
  ```typescript
  hasPermission('orders', 'view') // true/false
  hasPermission('inventory', 'edit') // true/false
  ```

**Database Tables:**

**`cafe_roles`** (assumed structure):
- `id` (UUID, PK)
- `store_id` (UUID, FK to stores)
- `name` (string, e.g., "Waiter", "Barista", "Manager")
- Other metadata

**`cafe_role_permissions`** (confirmed structure):
- `role_id` (UUID, FK to cafe_roles)
- `section_slug` (string, matches SectionSlug type)
- `can_view` (boolean)
- `can_create` ( boolean)
- `can_edit` (boolean)
- `can_delete` (boolean)

**Permission Loading (AuthContext, lines 256-276):**
```typescript
if (userProfile.role_id) {
    const { data: permData } = await supabase
        .from('cafe_role_permissions')
        .select('section_slug, can_view, can_create, can_edit, can_delete')
        .eq('role_id', userProfile.role_id);

    if (permData) {
        const permMap: RolePermissions = {};
        permData.forEach((p: any) => {
            permMap[p.section_slug] = {
                view: p.can_view,
                create: p.can_create,
                edit: p.can_edit,
                delete: p.can_delete
            };
        });
        setPermissions(permMap);
    }
}
```

**RLS Behavior:**
- Filtered by `profiles.store_id`
- RLS on `cafe_roles`: user can only see roles for their store
- RLS on `cafe_role_permissions`: linked via `cafe_roles.store_id`

**UI Features:**
- Same neon theme as store_owner
- Sidebar items conditionally render based on `hasPermission(section)`
- Blocked routes show Navigate fallback

**Fallback Logic:**
If `profile.role_id` is `NULL` or `undefined`, the user is treated as having full access (likely store_owner).

---

### 4. **customer** (End User)

**Database Field:** `profiles.role = 'customer'`

**Who Gets This Role:**
- End customers who register via `/m/:slug/auth`
- Auto-created profiles when users sign in via client menu

**Access Level:**
- NO access to OperativeLayout or SaaSLayout
- ONLY access to ClientLayout
- Can view menu, place orders, track orders
- Can access loyalty, wallet (if authenticated)

**Accessible Layouts:**
- **ClientLayout** (ONLY)

**Routes (ClientLayout):**
- `/m/:slug` → Menu
- `/m/:slug/product/:id` → Product detail
- `/m/:slug/cart` → Shopping cart
- `/m/:slug/checkout` → Checkout
- `/m/:slug/tracking/:orderId` → Order tracking
- `/m/:slug/order/:orderId` → Order status
- `/m/:slug/auth` → Authentication
- `/m/:slug/profile` → Customer profile
- `/m/:slug/loyalty` → Loyalty points
- `/m/:slug/wallet` → Digital wallet

**Security Enforcement:**
**App.tsx (lines 678-701):**
```typescript
if (profile?.role === 'customer') {
    const lastSlug = localStorage.getItem('last_store_slug');
    if (lastSlug) {
        console.log('🔒 Security: Client attempting to access Admin. Redirecting to:', lastSlug);
        return <Navigate to={`/m/${lastSlug}`} replace />;
    }
    // Fallback: Access Denied screen
}
```

**Customers are EXPLICITLY BLOCKED from OperativeLayout and SaaSLayout.**

**Permission System:**
- `permissions` state = `null`
- No permission checks (not applicable)

**RLS Behavior:**
- Filtered by `client_id` or session
- Can only see their own orders, wallet, loyalty points

**UI Features:**
- Mobile-first design
- Store-branded theme (`menu_theme.accentColor`)
- Bottom navigation
- Active order widget

**Data Ownership:**
- Linked to `clients` table via `client_id`
- Session persistence via localStorage or Supabase auth

---

## Permission Guard System

### PermissionGuard Component

**File:** `components/PermissionGuard.tsx`

**Purpose:**  
Conditionally render UI elements based on user permissions.

**Props:**
- `section` / `slug` → SectionSlug ('orders', 'inventory', etc.)
- `action` → 'view' | 'create' | 'edit' | 'delete' (default: 'view')
- `children` → Content to render if allowed
- `fallback` → Content to render if denied (default: null)

**Logic:**
1. **Owners & Admins:** Always render `children`
2. **Staff:** Check `hasPermission(section, action)`
3. **Others:** Render `fallback`

**Usage Example (from App.tsx):**
```typescript
<Route path="/inventory" element={
  <PermissionGuard section="inventory" fallback={<Navigate to="/" replace />}>
    <InventoryManagement />
  </PermissionGuard>
} />
```

---

### RoleGuard Component

**File:** `components/RoleGuard.tsx`

**Purpose:**  
Route-level protection based on role.

**Props:**
- `allowedRoles` → Array of role names (e.g., `['store_owner', 'super_admin']`)
- `fallbackPath` → Redirect path if denied (default: `/dashboard`)
- `children` → Protected content

**Logic:**
1. If loading → Show spinner
2. If no user → Redirect to `/login`
3. If no profile (and roles required) → Redirect to `/login`
4. If `super_admin` → Always allow
5. If user role NOT in `allowedRoles` → Redirect to `fallbackPath`

**Usage Example:**
```typescript
<RoleGuard allowedRoles={['store_owner']}>
  <StoreSettings />
</RoleGuard>
```

**Note:** RoleGuard is LESS USED than PermissionGuard in the current codebase. Most protection happens via PermissionGuard and layout routing logic.

---

## Section Slugs (Permissions Taxonomy)

**Source:** `types.ts` (SectionSlug type)

**Confirmed Sections:**
- `dashboard`
- `orders`
- `tables`
- `inventory`
- `design`
- `clients`
- `loyalty`
- `finance`
- `staff` (assumed for settings)

**Permission Actions:**
- `view` → Can see the section
- `create` → Can create new records
- `edit` → Can modify existing records
- `delete` → Can delete records

---

## GOD MODE Users (Hardcoded Bypass)

**Source:** `contexts/AuthContext.tsx`

### 1. **livvadm@gmail.com** (Super Admin)
- **Lines 161-176, 303-317, 428-429**
- **Role:** `super_admin`
- **Bypass:** Skips ALL database queries
- **Access:** SaaSLayout + full platform
- **Profile:** Hardcoded in memory
- **Purpose:** Emergency access if database fails

### 2. **livveneas@gmail.com** (Store Owner)
- **Lines 180-208, 322-351**
- **Role:** `store_owner`
- **Store ID:** `f5e3bfcf-3ccc-4464-9eb5-431fa6e26533` (hardcoded)
- **Bypass:** Provides immediate access, attempts DB repair in background
- **Access:** OperativeLayout for store "ciro"
- **Profile:** Hardcoded, with background DB upsert
- **Purpose:** Ensure owner can always access their store

---

## Auto-Healing Logic

**Source:** `contexts/AuthContext.tsx` (lines 354-388)

If a user authenticates but NO profile exists in the database:

1. **Auto-create profile** with `role: 'customer'`
2. **Upsert to database** (idempotent)
3. **Allow UI access** immediately

**Purpose:**  
Prevent "stuck" state where user is logged in but has no profile.

**Default Auto-Heal Role:** `customer`

---

## Key Observations

**✅ WORKING:**
- Role-based layout routing (SaaS vs Operative vs Client)
- Permission system for staff roles
- GOD MODE bypass for emergency access
- Customer security (blocked from admin areas)
- Auto-healing for missing profiles

**❓ UNKNOWN:**
- Actual `cafe_roles` table schema (not inspected)
- How roles are assigned to staff (UI for role management not documented)
- Default permissions for new roles
- Whether `cafe_roles` has soft delete or status field

**⚠️ NOTES:**
- `store_owner` has NO `role_id` (always null)
- `staff` roles are ONLY identified by presence of `role_id`
- If `role_id` is null/undefined, user is treated as having full access
- Permissions are loaded ONLY if `role_id` exists
- Super admins bypass RLS entirely
- Customers are security-hardened (cannot access admin routes)

---

## Permission Enforcement Points

1. **Routing Level** → `<PermissionGuard>` wraps routes
2. **Component Level** → Guards wrap UI sections
3. **Function Level** → `hasPermission()` checks in code
4. **Database Level** → RLS policies on Supabase
5. **Layout Level** → Role determines which layout renders

---

## Data Isolation

**Super Admin:**
- No `store_id` filter
- Sees all tenants

**Store Owner:**
- Filtered by `profiles.store_id`
- RLS enforces single-store visibility

**Staff:**
- Filtered by `profiles.store_id`
- Additional permission checks via `cafe_role_permissions`

**Customer:**
- Filtered by `client_id` or auth session
- RLS on orders, wallet, loyalty
