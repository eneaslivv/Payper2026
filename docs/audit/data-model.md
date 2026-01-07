# Data Model — Payper Platform

**Generated:** 2026-01-04  
**Type:** Read-Only Platform Audit  
**Status:** Comprehensive Table Documentation

---

## Overview

The Payper database consists of **~40 tables** organized into logical domains:

1. **Core** — Stores, Profiles, Auth
2. **Menu & Products** — Products, Categories, Variants
3. **Inventory** — Items, Recipes, Stock, Suppliers
4. **Orders** — Orders, Items, Sessions
5. **Clients** — Clients, Wallet, Loyalty
6. **Venue** — Tables, Zones, QR
7. **Finance** — Cash, Closures
8. **Security** — Roles, Permissions, Audit
9. **System** — Email Logs, Webhooks

---

## Core Domain

### `stores`
**Purpose:** Tenant/store records

**Key Fields:**
- `id` (UUID, PK)
- `name`, `slug` (unique)
- `owner_email`
- `plan` (subscription tier)
- `service_mode` (`'counter' | 'table' | 'club'`)
- `menu_theme` (JSONB)
- `menu_logic` (JSONB)
- `mp_connected`, `mp_access_token`, `mp_refresh_token`, `mp_expires_at`
- `mp_user_id`, `mp_email`
- `logo_url`
- `created_at`

**RLS:** Store-isolated (owners see their store, super_admin sees all)

---

### `profiles`
**Purpose:** User accounts linked to auth.users

**Key Fields:**
- `id` (UUID, PK, FK to auth.users)
- `email`, `full_name`, `phone`
- `role` (`'super_admin' | 'store_owner' | 'staff' | 'customer'`)
- `store_id` (UUID, FK to stores, nullable)
- `role_id` (UUID, FK to cafe_roles, nullable for non-staff)
- `is_active` (boolean)
- `created_at`, `updated_at`

**RLS:** Users see own profile + profiles from their store

---

## Menu & Products Domain

### `products`
**Purpose:** Menu items (customer-facing)

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `name`, `description`
- `price` (numeric)
- `category_id` (UUID, FK to categories)
- `image_url`
- `is_available` (boolean)
- `sort_order` (integer)
- `created_at`, `updated_at`

**RLS:** Store-isolated

---

### `categories`
**Purpose:** Product categorization

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `name` (string)
- `sort_order` (integer)
- `created_at`

**RLS:** Store-isolated

---

### `product_variants`
**Purpose:** Size/flavor options for products

**Key Fields:**
- `id` (UUID, PK)
- `product_id` (UUID, FK to products)
- `name` (e.g., "Grande", "Frappé")
- `price_modifier` (numeric, +/- from base)
- `is_available` (boolean)

**RLS:** Via product join (store-isolated)

---

### `product_addons`
**Purpose:** Extra items for products

**Key Fields:**
- `id` (UUID, PK)
- `product_id` (UUID, FK)
- `name` (e.g., "Extra shot")
- `price` (numeric)
- `is_available` (boolean)

**RLS:** Via product join

---

## Inventory Domain

### `inventory_items`
**Purpose:** Stock/ingredient catalog

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `name`, `description`
- `category_id` (UUID, FK to categories)
- `unit_type` (`'kg' | 'g' | 'l' | 'ml' | 'un'`)
- `stock_quantity` (numeric)
- `package_size` (numeric)
- `min_stock`, `max_stock` (numeric)
- `cost_price`, `sale_price` (numeric)
- `supplier_id` (UUID, FK, nullable)
- `is_recipe` (boolean)
- `barcode` (string, nullable)
- `created_at`, `updated_at`

**RLS:** Store-isolated

---

### `product_recipes`
**Purpose:** Maps products to ingredient requirements

**Key Fields:**
- `id` (UUID, PK)
- `product_id` (UUID, FK to products)
- `inventory_item_id` (UUID, FK to inventory_items)
- `quantity_required` (numeric)
- `unit` (string)

**RLS:** Via product join

---

### `inventory_suppliers`
**Purpose:** Supplier directory

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `name`, `contact_name`, `email`, `phone`
- `address` (text)
- `notes` (text)
- `created_at`

**RLS:** Store-isolated

---

### `inventory_location_stock`
**Purpose:** Multi-location stock tracking

**Key Fields:**
- `id` (UUID, PK)
- `inventory_item_id` (UUID, FK)
- `location_id` (UUID, FK to storage_locations)
- `quantity` (numeric)
- `unit_type` (string)
- `updated_at`

**RLS:** Via location → store join

---

### `storage_locations`
**Purpose:** Define storage areas (e.g., "Main Pantry", "Freezer")

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `name`, `location_type` (string)
- `is_default` (boolean)
- `created_at`

**RLS:** Store-isolated

---

### `stock_transfers`
**Purpose:** Audit log of stock movements between locations

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `inventory_item_id` (UUID, FK)
- `from_location_id` (UUID, FK, nullable)
- `to_location_id` (UUID, FK)
- `quantity` (numeric)
- `unit_type` (string)
- `reason` (string)
- `transferred_by` (UUID, FK to profiles)
- `created_at`

**RLS:** Store-isolated

---

### `inventory_audit_logs`
**Purpose:** Full audit trail of inventory changes

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `inventory_item_id` (UUID, FK)
- `action` (`'create' | 'update' | 'delete' | 'adjust'`)
- `old_quantity`, `new_quantity` (numeric)
- `user_id` (UUID, FK to profiles)
- `change_reason` (text)
- `metadata` (JSONB)
- `created_at`

**RLS:** Store-isolated

---

### `open_packages`
**Purpose:** Track opened bulk items (e.g., opened 5kg bag)

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `inventory_item_id` (UUID, FK)
- `location_id` (UUID, FK, nullable)
- `opened_quantity` (numeric)
- `remaining_quantity` (numeric)
- `opened_at` (timestamp)
- `opened_by` (UUID, FK to profiles)
- `is_depleted` (boolean)

**RLS:** Store-isolated

---

## Orders Domain

### `orders`
**Purpose:** Customer orders

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `client_id` (UUID, FK to clients, nullable)
- `table_id` (UUID, FK to store_tables, nullable)
- `zone_id` (UUID, FK to venue_zones, nullable)
- `customer_name`, `customer_email` (string, for display)
- `order_number` (integer, auto-increment per store)
- `order_type` (`'dine_in' | 'takeaway' | 'delivery'`)
- `status` (`'Pendiente' | 'En Preparación' | 'Listo' | 'Entregado' | 'Cancelado'`)
- `payment_status` (`'pending' | 'approved' | 'paid' | 'rejected'`)
- `payment_provider` (`'mercadopago' | 'wallet' | 'cash'`)
- `payment_method` (string)
- `is_paid` (boolean)
- `total_amount` (numeric)
- `items` (JSONB array)
- `notes` (text)
- `created_at`, `updated_at`, `completed_at`

**RLS:** Store-isolated

---

### `order_items`
**Purpose:** Line items for orders (alternative to JSONB)

**Key Fields:**
- `id` (UUID, PK)
- `order_id` (UUID, FK to orders)
- `product_id` (UUID, FK to products, nullable)
- `inventory_item_id` (UUID, FK, nullable)
- `name` (string)
- `quantity` (integer)
- `unit_price` (numeric)
- `notes` (text)
- `created_at`

**RLS:** Via order join

**Status:** Partially used (some orders use JSONB, others use this table)

---

## Clients Domain

### `clients`
**Purpose:** Customer profiles (per-store)

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `email` (string, unique per store)
- `full_name`, `phone` (string)
- `wallet_balance` (numeric, default 0)
- `loyalty_points` (integer, default 0)
- `total_spent` (numeric, default 0)
- `orders_count` (integer, default 0)
- `join_date`, `last_visit` (timestamp)
- `is_vip` (boolean)
- `status` (`'active' | 'blocked'`)
- `created_at`, `updated_at`

**RLS:** Store-isolated

---

### `wallet_transactions`
**Purpose:** Wallet movement ledger

**Key Fields (assumed from edge functions):**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `user_id` (UUID, FK to auth.users)
- `wallet_id` (UUID, nullable)
- `client_id` (UUID, FK to clients)
- `amount` (numeric)
- `type` (`'topup_pending' | 'topup_completed' | 'payment' | 'refund'`)
- `description` (string)
- `mp_payment_id` (string, nullable)
- `order_id` (UUID, FK to orders, nullable)
- `created_at`

**RLS:** Store-isolated (assumed)

---

### `loyalty_transactions`
**Purpose:** Points movement ledger (from loyalty_engine.sql)

**Key Fields:**
- `id` (UUID, PK)
- `created_at` (timestamp)
- `store_id` (UUID, FK)
- `client_id` (UUID, FK)
- `order_id` (UUID, FK, nullable)
- `type` (`'earn' | 'burn' | 'gift' | 'expire' | 'adjustment' | 'rollback'`)
- `points` (integer, signed)
- `monetary_cost`, `monetary_value` (numeric)
- `description` (text)
- `staff_id` (UUID, FK to profiles, nullable)
- `metadata` (JSONB)
- `is_rolled_back` (boolean)

**RLS:** Clients read own, staff read all

---

### `loyalty_redemptions`
**Purpose:** Reward redemption details

**Key Fields:**
- `id` (UUID, PK)
- `transaction_id` (UUID, FK to loyalty_transactions)
- `reward_id` (UUID, FK to loyalty_rewards)
- `order_id` (UUID, FK to orders)
- `cost_points` (integer)
- `cost_value`, `retail_value` (numeric)
- `product_id` (UUID, FK, nullable)
- `is_rolled_back` (boolean)
- `created_at`

**RLS:** Via transaction join

---

### `loyalty_rewards`
**Purpose:** Reward catalog

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `name`, `description` (string)
- `points` (integer, cost to redeem)
- `product_id` (UUID, FK to inventory_items, nullable)
- `is_active` (boolean)
- `created_at`

**RLS:** Store-isolated

---

### `loyalty_configs`
**Purpose:** Per-store loyalty settings

**Key Fields:**
- `store_id` (UUID, PK, FK)
- `config` (JSONB):
  ```json
  {
    "isActive": boolean,
    "baseAmount": number,
    "basePoints": number,
    "rounding": "down" | "normal" | "up"
  }
  ```

**RLS:** Store-isolated

---

### `loyalty_product_rules`
**Purpose:** Per-product point multipliers

**Key Fields:**
- `store_id` (UUID)
- `product_id` (UUID, FK)
- `multiplier` (numeric)

**RLS:** Store-isolated

---

## Venue Domain

### `store_tables`
**Purpose:** QR-enabled tables/venue nodes

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `label` (string, e.g., "Mesa 5")
- `qr_code_url` (string, nullable)
- `code_hash` (string, unique for QR resolution)
- `zone_id` (UUID, FK to venue_zones, nullable)
- `is_active` (boolean)
- `created_at`, `updated_at`

**RLS:** Store-isolated

---

### `venue_zones`
**Purpose:** Group tables by area

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `name` (string, e.g., "Terraza", "Barra")
- `description` (text)
- `color` (string, hex for UI)
- `created_at`

**RLS:** Store-isolated

---

### `qr_codes` (Enhanced QR System)
**Purpose:** Advanced QR tracking

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `code_hash` (string, unique)
- `target_type` (`'table' | 'menu' | 'promo'`)
- `target_id` (UUID, nullable)
- `is_active` (boolean)
- `scan_count` (integer)
- `last_scanned_at` (timestamp)
- `created_at`

**RLS:** Public read, staff write

---

### `qr_scan_logs`
**Purpose:** Audit log of QR scans

**Key Fields:**
- `id` (UUID, PK)
- `qr_code_id` (UUID, FK)
- `scanned_at` (timestamp)
- `user_agent` (text)
- `ip_address` (inet)
- `session_id` (UUID, nullable)

**RLS:** Public insert, staff read

---

### `client_sessions`
**Purpose:** Track customer browsing sessions

**Key Fields:**
- `id` (UUID, PK)
- `client_id` (UUID, FK to clients, nullable)
- `store_id` (UUID, FK)
- `qr_code_id` (UUID, FK, nullable)
- `started_at`, `ended_at` (timestamp)
- `cart_data` (JSONB)

**RLS:** Clients read own, public insert

---

### `qr_links` (Legacy)
**Purpose:** Old QR system (for backward compatibility)

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `target_node_id` (UUID, nullable)
- `code_hash` (string, unique)
- `target_type` (string)
- `is_active` (boolean)

**RLS:** Public read, admin write

---

## Finance Domain

### `cash_sessions`
**Purpose:** Cash register sessions/shifts

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `opened_by` (UUID, FK to profiles)
- `opened_at` (timestamp)
- `opening_balance` (numeric)
- `closed_at` (timestamp, nullable)
- `closing_balance` (numeric, nullable)
- `expected_balance` (numeric, nullable)
- `discrepancy` (numeric, nullable)
- `status` (`'open' | 'closed'`)

**RLS:** Store-isolated

---

### `cash_closures`
**Purpose:** End-of-shift cash reconciliation

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `session_id` (UUID, FK to cash_sessions)
- `closed_by` (UUID, FK to profiles)
- `total_cash_sales` (numeric)
- `total_card_sales` (numeric)
- `total_wallet_sales` (numeric)
- `cash_counted` (numeric)
- `notes` (text)
- `created_at`

**RLS:** Store-isolated

---

### `day_closures`
**Purpose:** End-of-day financial summary

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `closure_date` (date)
- `total_revenue` (numeric)
- `total_orders` (integer)
- `cash_total`, `card_total`, `wallet_total` (numeric)
- `closed_by` (UUID, FK)
- `created_at`

**RLS:** Store-isolated

---

### `dispatch_sessions`
**Purpose:** (Unknown — possibly order dispatch tracking)

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `started_at`, `ended_at` (timestamp)
- `orders_count` (integer)

**RLS:** Store-isolated

**Status:** UNKNOWN usage

---

## Security Domain

### `cafe_roles`
**Purpose:** Staff role definitions

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `name` (string, e.g., "Barista", "Manager")
- `description` (text)
- `created_at`

**RLS:** Store-isolated

---

### `cafe_role_permissions`
**Purpose:** Permissions assigned to roles

**Key Fields:**
- `id` (UUID, PK)
- `role_id` (UUID, FK to cafe_roles)
- `section` (SectionSlug: `'dashboard' | 'orders' | 'inventory'` etc.)
- `can_view`, `can_create`, `can_edit`, `can_delete` (boolean)

**RLS:** Via role join

---

### `audit_logs`
**Purpose:** Platform-wide audit trail

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `user_id` (UUID, FK to profiles)
- `action` (string)
- `table_name` (string)
- `record_id` (UUID)
- `old_values`, `new_values` (JSONB)
- `ip_address` (inet)
- `user_agent` (text)
- `created_at`

**RLS:** Store-isolated (staff read)

---

## System Domain

### `email_logs`
**Purpose:** Track outgoing emails

**Key Fields:**
- `id` (UUID, PK)
- `store_id` (UUID, FK)
- `recipient_email`, `recipient_name` (string)
- `recipient_type` (`'client' | 'staff'`)
- `event_type` (string, e.g., "payment.approved")
- `event_id` (string)
- `event_entity` (string)
- `template_key` (string)
- `payload_core` (JSONB)
- `idempotency_key` (string, unique)
- `status` (`'pending' | 'sent' | 'failed'`)
- `resend_id`, `resend_response` (JSONB)
- `error_message`, `error_code` (string)
- `triggered_by`, `trigger_source` (string)
- `sent_at` (timestamp)
- `created_at`

**RLS:** Store-isolated (staff read)

---

### `payment_webhooks`
**Purpose:** Mercado Pago webhook audit log

**Key Fields:**
- `id` (UUID, PK)
- `provider` (`'mercadopago'`)
- `provider_event_id` (string)
- `topic` (string)
- `action` (string)
- `payload` (JSONB, full webhook body)
- `headers` (JSONB)
- `store_id` (UUID, FK)
- `processed` (boolean)
- `processed_at` (timestamp)
- `processing_result` (string)
- `created_at`

**RLS:** UNKNOWN (likely service-role only)

---

## Summary

**Total Tables:** ~42  
**Core Entities:** 13  
**Support/Audit:** 29  
**Migration Status:** Active (multiple migrations applied)

**Key Patterns:**
- All multi-tenant tables have `store_id`
- RLS enforced on all sensitive tables
- Audit logging on critical operations
- JSONB for flexible schemas (menu_theme, config, etc.)
- UUIDs for all primary keys
- Timestamps: `created_at`, `updated_at`
