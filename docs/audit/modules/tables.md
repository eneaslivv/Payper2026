# Tables Module — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Status:** MINIMAL (Wrapper component only)

---

## Module Overview

The Tables module provides a visual interface for managing venue layouts, tables, and QR codes.

**File:** `pages/TableManagement.tsx` (12 lines — wrapper only)

---

## Component Structure

**Code:**
```tsx
import React, { Suspense } from 'react';
import VenueSystem from '../components/venue-control/App';

export default function TableManagement() {
  return (
    <div className="relative w-full h-[calc(100vh-64px)] overflow-hidden bg-black">
      <Suspense fallback={<div>Cargando Venue Control...</div>}>
        <VenueSystem />
      </Suspense>
    </div>
  );
}
```

**Actual Implementation:** `components/venue-control/App.tsx`

---

## VenueSystem Component

**Location:** `components/venue-control/` (not inspected)

**Purpose (inferred):**
- Visual venue builder (drag-and-drop)
- Table placement and configuration
- QR code generation for tables
- Zone/area management (e.g., "Patio", "Interior")

---

## Database Table: `store_tables`

**Fields (from qr-system.md):**
- `id` (UUID, PK)
- `store_id` (UUID, FK to stores)
- `label` (string, e.g., "Mesa 5")
- `qr_code_url` (string, nullable) — Link to QR image
- `code_hash` (string, unique) — QR resolution hash
- `is_active` (boolean)
- `created_at` (timestamp)

**Additional Fields (assumed for VenueSystem):**
- `x_position` (numeric, canvas X coordinate)
- `y_position` (numeric, canvas Y coordinate)
- `shape` (`'circle' | 'square' | 'rectangle'`)
- `capacity` (integer, max guests)
- `zone_id` (UUID, FK to venue_zones, nullable)

---

## Venue Zones (Assumed)

**Table:** `venue_zones` or similar

**Purpose:** Group tables by area

**Fields (assumed):**
- `id` (UUID, PK)
- `store_id` (UUID)
- `name` (string, e.g., "Terraza", "Barra")
- `color` (string, hex color for UI)

---

## Features (Assumed from VenueSystem Name)

1. **Canvas Editor**
   - Drag-and-drop table placement
   - Visual layout builder
   - Zoom/pan controls

2. **Table Configuration**
   - Set label (e.g., "Mesa 3")
   - Set capacity
   - Assign to zone
   - Generate QR code

3. **QR Code Management**
   - Auto-generate QR on table creation
   - Download/print QR codes
   - View QR in UI

4. **Multi-Venue Support**
   - Different layouts per store
   - Save/load templates

5. **Real-Time Status**
   - Show occupied/available tables
   - Link to active orders
   - Visual indicators

---

## QR Code Generation

**Process (inferred from qr-system.md):**

1. **User creates table** in VenueSystem
2. **System generates** unique `code_hash`
3. **QR library** (qrcode.react) renders QR:
   ```
   {{app_url}}/#/qr/{{code_hash}}
   ```
4. **QR saved** as PNG/SVG to Supabase Storage
5. **URL stored** in `qr_code_url`

---

## Integration with Orders

**Link:**

1. Customer scans QR → `QRResolver` runs
2. Table info saved to context: `{ tableId: '...', tableLabel: 'Mesa 5' }`
3. Customer places order
4. Order created with `table_id` from context
5. **OrderBoard** shows "Mesa 5" label

**Status Indicator (assumed):**
- VenueSystem shows red dot if table has active order
- Green if table is available

---

## Key Observations

**✅ CONFIRMED:**
- Wrapper component loads VenueSystem
- VenueSystem is lazy-loaded (Suspense)
- Full-screen canvas UI

**❓ UNKNOWN:**
- VenueSystem implementation details
- Whether zones exist
- Table shape/positioning storage
- Real-time order status indicators
- Template system
- Multi-floor support
- Table merging/splitting
- Reservation system integration

**⚠️ NOTES:**
- Main logic NOT in `TableManagement.tsx`
- Imported from `components/venue-control/`
- Likely uses Canvas or SVG for rendering
- Tightly coupled with QR system
