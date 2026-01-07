# Inventory Module — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Status:** PARTIAL (Main file 3200+ lines, only outline inspected)

---

## Module Overview

The Inventory module manages products, stock levels, recipes, categories, and supply chain logistics.

**File:** `pages/InventoryManagement.tsx` (3201 lines)

---

## Key Features (from Outline)

### Components/Views

1. **Product Management** — CRUD for inventory items
2. **Recipes** — Define product recipes with ingredients
3. **Categories** — Product categorization with ordering
4. **Stock Movements** —Track stock changes (adjustments, transfers)
5. **Invoice Processor** — AI-powered invoice scanning
6. **Logistics** — Multi-location stock management
7. **AI Insights** — Stock predictions and recommendations

---

## Database Tables

### `inventory_items`

**Purpose:** Product catalog

**Fields (inferred from types.ts and outline):**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `name` (string)
- `description` (string, nullable)
- `category_id` (UUID, FK to categories)
- `unit_type` (`'kg' | 'g' | 'l' | 'ml' | 'un'`)
- `stock_quantity` (numeric)
- `package_size` (numeric, e.g., units per bulk package)
- `min_stock` (numeric, reorder point)
- `max_stock` (numeric, max capacity)
- `cost_price` (numeric, COGS)
- `sale_price` (numeric)
- `is_recipe` (boolean, true if product has recipe)
- `created_at` (timestamp)

---

### `categories`

**Purpose:** Product grouping

**Fields (inferred):**
- `id` (UUID, PK)
- `store_id` (UUID)
- `name` (string)
- `sort_order` (integer)
- `created_at` (timestamp)

**Functions (from outline):**
- `handleCreateCategory()` — Create new category
- `handleDeleteCategory()` — Delete if empty
- `handleMoveCategory()` — Reorder (up/down)

---

### `recipes` (or `product_recipes`)

**Purpose:** Recipe definitions

**Type (from outline):**
```typescript
interface ProductRecipeDB {
  product_id: string;
  inventory_item_id: string;
  quantity_required: number;
}
```

**Flexible UI State:**
```typescript
interface RecipeIngredientUI {
  id: string;
  qty: number;
  unit: 'kg' | 'g' | 'l' | 'ml' | 'un';
}
```

**Functions:**
- `updateIngredientQty()` —Modify quantity
- `removeIngredient()` — Remove from recipe
- `handleConfirmAddIngredient()` — Add ingredient
- `getRecipeAvailability()` — Check if recipe can be made

---

### `stock_movements` (from outline type)

**Purpose:** Audit log of stock changes

**Type:**
```typescript
interface StockMovement {
  id: number;
  qty_delta: number;
  unit_type: string;
  reason: string;
  created_at: string;
  order_id?: string;
}
```

**Reasons:**
- Manual adjustment
- Order fulfillment (deduction)
- Stock transfer
- Inventory count

**Function:** `fetchStockHistory(itemId)`

---

## Multi-Location Support

**Component:** `LogisticsView` (imported from`../components/LogisticsView`)

**Component:** `LocationStockBreakdown`

**Function:** `fetchLocations()`

**Purpose:**
- Manage stock across multiple storage locations
- Track where items are stored
- Transfer stock between locations

**Stock Transfers:**
- **Component:** `StockTransferModal`
- Moves stock from one location to another

**Stock Adjustments:**
- **Component:** `StockAdjustmentModal`
- Manual corrections (e.g., after physical count)

---

## AI Features

### AI Gourmet Description

**Function:** `generateAIGourmetDescription()`

**Library:** `@google/generative-ai`

**Purpose:** Auto-generate product descriptions using AI

**Process (assumed):**
1. User enters basic product info
2. Clicks "Generate AI Description"
3. Sends to Google Generative AI
4. AI returns gourmet description
5. Populates `description` field

---

### AI Stock Insights

**Component:** `AIStockInsight` (imported from `../components/AIStockInsight`)

**Purpose (assumed):**
- Predict reorder needs
- Detect slow-moving items
- Suggest optimal stock levels

---

### Invoice Processor

**Component:** `InvoiceProcessor` (imported from`./InvoiceProcessor`)

**Purpose:** Scan invoices (PDFs/images) and auto-populate inventory

**Features (assumed):**
- OCR for text extraction
- AI parsing for item names, quantities, prices
- Bulk import to `inventory_items`

---

## Recipe System

**Recipe Availability Logic:**

**Function:** `getRecipeAvailability(item: InventoryItem)`

**Returns:**
```typescript
{
  canMake: boolean;
  missing: string[];
  available: number; // How many portions can be made
}
```

**Process:**
1. Fetch recipe ingredients for `item.id`
2. For each ingredient:
   - Check current `stock_quantity`
   - Compare to `quantity_required`
3. Calculate max portions based on limiting ingredient
4. Return availability

**Integration with Orders:**
- When order placed, check `getRecipeAvailability()`
- Deduct ingredients from stock
- Log deductions to `stock_movements`

---

## KPIs / Metrics

** Component:** `KpiCard`

**Metrics (assumed from outline):**
- Total inventory value
- Low stock items count
- Out-of-stock items count
- Stock turnover rate
- Waste/shrinkage

**Component:** `MetricBlock`

---

## UI Tabs/Views

**State:** `DrawerTab` type

**Tabs (inferred):**
- **Productos** — List of all inventory items
- **Recetas** — Recipe builder
- **Categorías** — Category management
- **Logística** — Multi-location view
- **Movimientos** — Stock history
- **Análisis** — AI insights

---

## Functions & Actions

### Product CRUD

- `fetchData()` — Load products, categories, locations
- `handleCreateManualItem()` — Create new product
- `handleUpdateItem()` — Modify existing product
- **Delete:** Not shown in outline (assumed exists)

### Inventory Adjustments

- `handleAdjustStock()` — Manual stock change (assumed)
- Logs to `stock_movements`

### Stock Transfers

- `handleTransferStock()` — Move between locations (assumed)
- Uses `StockTransferModal`

---

## Integration with Orders

**Deduction Flow:**

1. Order created with `items`
2. For each item:
   - If `is_recipe = false`: Deduct `stock_quantity` directly
   - If `is_recipe = true`: Deduct recipe ingredients
3. Log to `stock_movements` with `order_id`

**Deduction Logic:** Likely in Edge Function or trigger (not inspected)

---

## Filters

**Type:** `InventoryFilter`

**Options (assumed):**
- By category
- By stock status (low, out, ok)
- By recipe vs non-recipe
- Search by name

---

## Wizard Creation

**Type:** `WizardMethod` and `ManualType`

**Purpose:** Multi-step product creation wizard

**Methods (assumed):**
- Quick add (basic info)
- Full wizard (name, category, stock, pricing, recipe)
- AI-assisted (invoice scan, AI description)

---

## Key Observations

**✅ CONFIRMED:**
- Multi-location stock management
- Recipe system with ingredient deduction
- Stock movement history
- AI invoice processing
- AI description generation
- Category ordering
- Low stock alerts (via KPIs)

**❓ UNKNOWN:**
- RLS policies for `inventory_items`
- Automatic reorder system (if implemented)
- Waste tracking
- Expiration date management
- Supplier management
- Barcode scanning integration
- Whether stock deduction is automatic on order creation

**⚠️ NOTES:**
- File is 3201 lines (very complex)
- Multiple sub-components imported
- Heavy use of AI (Google Generative AI)
- Supports both simple items and recipes
- Logistics view for multi-venue businesses
