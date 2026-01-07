# QR System Module — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Status:** AS-IS Documentation

---

## Module Overview

The QR System allows customers to scan QR codes to access store menus and associate orders with specific tables/venues.

**Core Component:** `pages/QRResolver.tsx`

---

## QR Resolution Flow

### Entry Point

**Route:** `#/qr/:hash`

**URL Format:**
```
{{app_url}}/#/qr/{{qr_hash}}
```

Example: `https://payper.app/#/qr/abc123xyz`

### Resolution Process

**QRResolver Component:**

1. **Extract hash** from URL params (`useParams()`)
2. **Call** `resolveQR(qrHash)`
3. **Query database** for QR link
4. **Determine target** (store slug, table ID, venue node)
5. **Redirect** to appropriate route
6. **Store context** in localStorage/context

---

## Resolution Logic

**File:** `pages/QRResolver.tsx`

### Primary Flow (Modern)

```typescript
// Query: store_tables
const { data: tableData } = await supabase
  .from('store_tables')
  .select('id, code_hash, store_id, label, store:stores(slug, name)')
  .eq('code_hash', qrHash)
  .eq('is_active', true)
  .single();

if (tableData && tableData.store?.slug) {
  // Save context
  setQRContext({
    tableId: tableData.id,
    tableLabel: tableData.label,
    storeSlug: tableData.store.slug,
    timestamp: Date.now()
  });

  // Redirect to menu
  navigate(`/m/${tableData.store.slug}`);
}
```

**Context Storage:**
- File: `lib/qrContext.ts` (assumed)
- Uses: localStorage or React Context
- Data: `{ tableId, tableLabel, storeSlug, timestamp }`

---

### Legacy Flow (Backward Compatibility)

**Function:** `handleLegacyQR(link, qrHash)`

**Query:**
```typescript
const { data: link } = await supabase
  .from('qr_links')
  .select('*')
  .eq('code_hash', qrHash)
  .eq('is_active', true)
  .single();
```

**Legacy Structure:**
- `qr_links` table (DB structure unknown)
- Fields:
  - `store_id`
  - `target_node_id` (nullable)
  - `target_type` (`'table' | 'bar' | 'zone'` | null)
  - `is_active`

**Legacy Resolution:**
1. If `target_node_id` exists → Query `venue_nodes` (assumed table)
2. Get store slug from `stores` table
3. Set context with legacy format
4. Redirect to `/m/:slug`

**Purpose:** 
Supports old QR codes generated before migration to `store_tables`.

---

## QR Context

**Purpose:**  
Persist table/venue info so orders know which table they belong to.

**Interface (inferred):**
```typescript
interface QRContext {
  tableId: string | null;
  tableLabel: string | null;
  storeSlug: string;
  timestamp: number;
}
```

**Usage:**
- Set when QR scanned
- Retrieved during checkout to link `order.table_id`
- Cleared after order completion (assumed)

**Storage:**
- `localStorage.setItem('qr_context', JSON.stringify(context))`
- Or React Context (`QRContextProvider`)

---

## QR Resolver States

**File:** `pages/QRResolver.tsx`

**ResolverState Type:**
```typescript
type ResolverState = 'loading' | 'resolving' | 'success' | 'error' | 'inactive' | 'not_found';
```

**UI Messages:**
- `loading` → "Escaneando QR..."
- `resolving` → "Resolviendo ubicación..."
- `success` → "Redirigiendo al menú..."
- `error` → "Error al procesar QR"
- `inactive` → "Este código QR está desactivado"
- `not_found` → "Código QR no válido"

**Loader:** Uses `Loader2` component from lucide-react

---

## Database Tables

### `store_tables` (Primary)

**Purpose:** Modern QR table management

**Fields (from TypeScript):**
- `id` (UUID, PK)
- `store_id` (UUID, FK to stores)
- `label` (string, e.g., "Mesa 5")
- `qr_code_url` (string, nullable) — Link to generated QR image
- `code_hash` (string, unique) — Hash for resolution
- `is_active` (boolean)
- `created_at` (timestamp)

**QR Generation:** 
- Hash likely generated on table creation
- QR image generated (library: `qrcode.react`)
- Stored as `qr_code_url` (S3/storage link)

**RLS:** UNKNOWN

---

### `qr_links` (Legacy)

**Purpose:** Old QR system

**Fields (inferred):**
- `id` (UUID, PK)
- `store_id` (UUID)
- `target_node_id` (UUID, nullable)
- `code_hash` (string, unique)
- `target_type` (`'table' | 'bar' | 'zone'` | null)
- `is_active` (boolean)

**Status:** 
- Still supported for backward compatibility
- New QRs use `store_tables`

---

### `venue_nodes` (Assumed)

**Purpose:** Legacy venue/table structure

**Fields (inferred from QRResolver):**
- `id` (UUID, PK)
- `type` (string)
- `label` (string)

**Status:** UNKNOWN whether still in active use

---

## QR Code Generation

**Library:** `qrcode.react`

**Process (assumed):**
1. Admin creates table in `TableManagement.tsx`
2. System generates unique `code_hash`
3. QR code rendered with `<QRCode value={hash} />`
4. QR saved as image (PNG/SVG)
5. Uploaded to Supabase Storage
6. URL stored in `qr_code_url`

**QR Content:**
```
{{app_url}}/#/qr/{{code_hash}}
```

**Display:**
- Admin can download/print QR codes
- Physical QR placed on tables

---

## Integration with Orders

**Checkout Flow:**

1. Customer scans QR → QRResolver runs
2. Context saved: `{ tableId: '...', tableLabel: 'Mesa 5' }`
3. Customer browses menu at `/m/:slug`
4. Customer adds items to cart
5. Customer clicks checkout
6. **CheckoutPage** reads QR context
7. Order created with:
   ```typescript
   {
     store_id: '...',
     client_id: '...',
     table_id: qrContext.tableId, // From QR scan
     order_type: 'dine_in'
   }
   ```
8. Order appears in OrderBoard with "Mesa 5" label

---

## QR Security

**Active Status:**
- Only `is_active = true` QRs resolve
- Inactive QRs show error message
- Allows disabling stolen/lost QRs

**Hash Uniqueness:**
- `code_hash` is unique per table
- Collision prevention (UUID or crypto hash)

**No Authentication Required:**
- QR resolution works for unauthenticated users
- Menu browsing allowed without login

---

## Key Observations

**✅ CONFIRMED:**
- Modern flow uses `store_tables`
- Legacy support for `qr_links`
- Context persists table info
- Redirects to `/m/:slug` after resolution
- Active/inactive status check

**❓ UNKNOWN:**
- QR code generation logic (hash algorithm)
- Whether QR images are stored or generated on-the-fly
- `venue_nodes` table structure
- Whether expired QRs are automatically deactivated
- Multi-venue support (QR for bars, zones, etc.)

**🚨 BROKEN:**
- None detected

**⚠️ NOTES:**
- Backward compatibility maintained with `qr_links`
- QR system is decoupled from auth (public access)
- Table assignment is optional (orders can be takeaway)
