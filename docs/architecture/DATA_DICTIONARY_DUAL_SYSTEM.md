# 📕 Data Dictionary: Dual Product System (Legacy State)

> [!WARNING]
> **CRITICAL ARCHITECTURAL DOCUMENTATION**
> This system currently operates in a **Dual State** where sellable items can exist in *either* the `products` table OR the `inventory_items` table. This document serves as the Source of Truth for this logic until a full migration is performed.

## 1. Core Logic: "The Dual Path"

In a standard system, `order_items` would always point to `products`. In Payper's current state:

*   **Path A (Standard):** `order_items.product_id` → `products.id`
*   **Path B (Legacy/Dual):** `order_items.product_id` → `inventory_items.id`

The stock engine must handle **both paths** to correctly deduce ingredients.

## 2. Table Definitions

### `products`
*   **Role:** Sellable items (Menu items).
*   **Key Field:** `id` (UUID).
*   **Relations:**
    *   Has recipes in `product_recipes`.
    *   Linked to `order_items.product_id` (Path A).

### `inventory_items`
*   **Role:**
    1.  **Ingredients:** Raw materials (Cheese, Bacon, Coffee Beans) - `item_type = 'ingredient'`.
    2.  **Sellable Items (Legacy):** Items sold directly (Coke, legacy menu items) - `item_type = 'sellable'`.
*   **Key Field:** `id` (UUID).
*   **Relations:**
    *   Linked to `order_items.product_id` (Path B).
    *   Linked to `product_recipes.inventory_item_id` (As an ingredient).
    *   **NEW:** Has recipes in `inventory_item_recipes` (As a sellable item).

### `product_recipes`
*   **Role:** Recipes for items in the `products` table.
*   **Foreign Key 1:** `product_id` → `products.id`.
*   **Foreign Key 2:** `inventory_item_id` → `inventory_items.id` (The ingredient).

### `inventory_item_recipes` (NEW - BRIDGE TABLE)
*   **Role:** Recipes for sellable items that live in the `inventory_items` table.
*   **Foreign Key 1:** `inventory_item_id` → `inventory_items.id` (The sellable item).
*   **Foreign Key 2:** `ingredient_item_id` → `inventory_items.id` (The ingredient).

## 3. Stock Deduction Logic (The "Unified" Function)

When an order occurs, the `deduct_order_stock_unified` function follows this decision tree:

1.  **Check `products` Recipe:**
    *   Does `order_items.product_id` exist in `product_recipes`?
    *   **YES:** Consume ingredients defined there.
    *   **NO:** Proceed to step 2.

2.  **Check `inventory_items` Recipe (Dual Support):**
    *   Does `order_items.product_id` exist in `inventory_item_recipes`?
    *   **YES:** Consume ingredients defined there.
    *   **NO:** Proceed to step 3.

3.  **Direct Sale (Fallback):**
    *   The item is sold as itself (1 unit).
    *   Consume `order_items.product_id` directly from inventory.

## 4. Developer Guidelines

*   **Creating New Products:** Prefer using the `products` table.
*   **Querying Recipes:** You must union `product_recipes` and `inventory_item_recipes` if you want *all* active recipes in the system.
*   **UI:** The Frontend likely merges these lists. Be aware of ID collisions (though UUIDs make this rare).

---
**Maintained by:** Payper Guardian / Anti-Gravity
**Last Verified:** 2026-01-28
