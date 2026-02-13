# 📘 DOCUMENTACIÓN COMPLETA DEL SISTEMA PAYPER

**Fecha:** 2026-02-13
**Versión:** 1.0
**Sistema:** Payper - Multi-tenant SaaS for Venue Management
**Stack:** React + TypeScript + Supabase (PostgreSQL) + Vite

---

## 📋 TABLA DE CONTENIDOS

1. [Overview del Sistema](#1-overview-del-sistema)
2. [Roles de Usuario](#2-roles-de-usuario)
3. [Funcionalidades del Sistema](#3-funcionalidades-del-sistema)
4. [Flows Completos](#4-flows-completos)
5. [Database Schema Overview](#5-database-schema-overview)
6. [API/RPC Reference](#6-apirpc-reference)
7. [Frontend Architecture](#7-frontend-architecture)

---

## 1. OVERVIEW DEL SISTEMA

### ¿Qué es Payper?

**Payper** es un sistema SaaS multi-tenant para gestión integral de negocios de food & beverage (cafeterías, bares, restaurantes).

### Características Principales

- **Multi-tenant Architecture**: Múltiples stores (tenants) en una sola plataforma
- **Row-Level Security (RLS)**: Aislamiento de datos por tenant a nivel de base de datos
- **Offline-First PWA**: Funciona sin conexión mediante IndexedDB
- **Multi-Channel Orders**: Counter service, table service, club mode, delivery
- **Smart Inventory**: Gestión automática de stock con sistema de recipes
- **Multi-Payment**: Cash, Card, MercadoPago QR, Wallet prepago
- **Cash Management**: Control de caja con arqueo y cierre de día
- **Loyalty Program**: Sistema de puntos y recompensas configurable
- **AI-Powered**: Procesamiento de facturas con IA, insights automáticos
- **QR System**: Menú digital con QR por mesa/zona

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite |
| **UI** | Tailwind CSS + Radix UI + Lucide Icons |
| **Backend** | Supabase (PostgreSQL + Auth + Storage + Edge Functions) |
| **Database** | PostgreSQL 15 con Row-Level Security |
| **State** | React Context API + IndexedDB (offline) |
| **Payments** | MercadoPago SDK |
| **AI** | Google Gemini (invoice processing, insights) |
| **Deployment** | Vercel (frontend) + Supabase Cloud |

### Arquitectura Multi-Tenant

```
┌─────────────────────────────────────────────────────┐
│                   SUPABASE                          │
├─────────────────────────────────────────────────────┤
│  Auth Layer (JWT)                                   │
│    ↓                                                │
│  Row-Level Security (RLS)                           │
│    ↓                                                │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Store A │  │ Store B │  │ Store C │            │
│  │ tenant1 │  │ tenant2 │  │ tenant3 │            │
│  └─────────┘  └─────────┘  └─────────┘            │
│       ↑             ↑             ↑                 │
│       └─────────────┴─────────────┘                │
│           Isolated by store_id                      │
└─────────────────────────────────────────────────────┘
```

Cada store (tenant) tiene sus propios:
- Productos, inventario, clientes
- Órdenes, pagos, sesiones de caja
- Staff, roles, permisos
- Configuración, branding, menú

Pero **comparten la misma infraestructura y código**.

---

## 2. ROLES DE USUARIO

### Jerarquía de Roles

```
┌──────────────────────────────────────────────┐
│ PLATFORM LEVEL                               │
│  ↓                                           │
│  super_admin (SaaS Admin)                    │
│    - Gestión de todos los stores             │
│    - Métricas globales                        │
│    - Soporte técnico                          │
└──────────────────────────────────────────────┘
              ↓
┌──────────────────────────────────────────────┐
│ STORE LEVEL (per tenant)                     │
│  ↓                                           │
│  owner (Store Owner)                         │
│    - Full access al store                     │
│    - Configuración                            │
│    - Gestión de team                          │
│    ↓                                         │
│  admin (Administrator)                       │
│    - Operaciones completas                    │
│    - No puede borrar el store                 │
│    ↓                                         │
│  staff (Staff Member)                        │
│    - Permisos limitados configurables         │
│    - Puede ver solo su área (bar, cocina)     │
│    ↓                                         │
│  waiter (Waiter/Server)                      │
│    - Tomar órdenes                            │
│    - Gestionar mesas                          │
│    - Ver clientes                             │
│    ↓                                         │
│  client (Customer)                           │
│    - Ver menú digital                         │
│    - Hacer pedidos                            │
│    - Ver wallet y loyalty                     │
│    - Track de orden                           │
│    ↓                                         │
│  anonymous (Guest)                           │
│    - Solo ver menú público (si habilitado)    │
└──────────────────────────────────────────────┘
```

---

### Detalle de Roles

#### 🔴 super_admin (Platform Admin)

**Descripción:** Administrador de la plataforma SaaS Payper.

**Permisos generales:**
- Acceso a TODOS los stores
- Crear/eliminar stores
- Gestionar subscripciones
- Ver métricas globales
- Soporte técnico a stores

**Funcionalidades disponibles:**
- `SaaSAdmin.tsx` - Dashboard de plataforma
- Ver todos los stores
- Métricas de uso (orders, revenue, users por store)
- Gestión de billing

**RLS:** Bypass de RLS (acceso total)

---

#### 🟠 owner (Store Owner)

**Descripción:** Propietario del negocio (café, bar, restaurante).

**Permisos generales:**
- Full access a SU store
- Configurar store (branding, service mode)
- Gestionar team (invitar owner, admin, staff)
- Ver todas las secciones
- Configurar integraciones (MercadoPago)

**Funcionalidades disponibles:**

| Módulo | Acceso |
|--------|--------|
| Dashboard | ✅ Full |
| Orders | ✅ Create, Edit, Delete |
| Inventory | ✅ Full |
| Products | ✅ Full |
| Clients | ✅ Full |
| Staff | ✅ Full |
| Finance | ✅ Full |
| Loyalty | ✅ Configure |
| Settings | ✅ Full |
| Menu Design | ✅ Full |
| Analytics | ✅ Full |

**Páginas accesibles:**
- Todas las páginas del sistema

---

#### 🟡 admin (Store Administrator)

**Descripción:** Administrador del store con acceso operacional completo.

**Permisos generales:**
- Gestión operacional completa
- NO puede eliminar el store
- NO puede cambiar owner
- Puede invitar staff
- Ver todas las secciones operativas

**Funcionalidades disponibles:**

| Módulo | Acceso |
|--------|--------|
| Dashboard | ✅ Full |
| Orders | ✅ Create, Edit, Delete |
| Inventory | ✅ Full |
| Products | ✅ Full |
| Clients | ✅ Full |
| Staff | ✅ View, Invite (no delete owner) |
| Finance | ✅ Full |
| Loyalty | ✅ Configure |
| Settings | ⚠️ Limited (no billing) |
| Menu Design | ✅ Full |
| Analytics | ✅ Full |

**Restricciones:**
- No puede borrar el store
- No puede cambiar owner
- No puede ver billing settings

---

#### 🔵 staff (Staff Member)

**Descripción:** Empleado del store con permisos configurables por rol.

**Sistema de permisos:**
Permisos granulares via `cafe_role_permissions`:
- `dashboard`, `orders`, `tables`, `inventory`, `design`
- `clients`, `loyalty`, `finance`, `staff`, `audit`
- `settings`, `reports`

**Funcionalidades disponibles (ejemplo rol "Manager"):**

| Módulo | Acceso |
|--------|--------|
| Dashboard | ✅ View |
| Orders | ✅ Create, Edit |
| Inventory | ✅ View, Transfer |
| Products | ✅ View |
| Clients | ✅ View, Edit |
| Staff | ❌ No access |
| Finance | ✅ View |
| Loyalty | ❌ No access |
| Settings | ❌ No access |

**Permisos configurables por store.**

**Ejemplo roles comunes:**
- **Manager**: orders, inventory, clients, finance
- **Barista**: orders (bar only), inventory (view)
- **Cashier**: orders, finance, clients

---

#### 🟢 waiter (Waiter/Server)

**Descripción:** Mesero/camarero con acceso limitado a toma de órdenes y mesas.

**Permisos generales:**
- Tomar órdenes (POS)
- Gestionar mesas (abrir, cerrar, mover)
- Ver clientes
- Ver menú y productos
- NO gestiona inventario
- NO gestiona finanzas

**Funcionalidades disponibles:**

| Módulo | Acceso |
|--------|--------|
| Dashboard | ❌ No access |
| Orders | ✅ Create, Edit (own orders) |
| Table Management | ✅ Full |
| Inventory | ❌ No access |
| Products | ✅ View only |
| Clients | ✅ View, Search |
| Staff | ❌ No access |
| Finance | ❌ No access |

**Páginas accesibles:**
- `OrderCreation.tsx` - Crear órdenes
- `OrderBoard.tsx` - Ver órdenes activas
- `TableManagement.tsx` - Gestionar mesas
- `Clients.tsx` - Buscar clientes

---

#### 🟣 client (Customer)

**Descripción:** Cliente final del negocio.

**Permisos generales:**
- Ver menú digital (via QR)
- Hacer pedidos self-service
- Ver y recargar wallet
- Ver loyalty points y rewards
- Track de órdenes en tiempo real
- Perfil personal

**Funcionalidades disponibles:**

| Funcionalidad | Descripción |
|--------------|-------------|
| MenuPage | Ver catálogo de productos (digital menu) |
| CartPage | Carrito de compras |
| CheckoutPage | Pagar (wallet, MercadoPago) |
| TrackingPage | Rastrear orden en tiempo real |
| OrderStatusPage | Ver detalle de orden |
| WalletPage | Ver balance, recargar, historial |
| LoyaltyPage | Ver puntos, redimir rewards |
| ProfilePage | Editar perfil, preferencias |
| AuthPage | Login/registro |

**Páginas accesibles:**
- Todas las páginas en `client/` folder

**Flujo típico:**
1. Escanea QR en mesa
2. Ve menú digital
3. Agrega productos al carrito
4. Checkout (paga con wallet o MP)
5. Recibe orden
6. Trackea estado en tiempo real

---

#### ⚪ anonymous (Guest)

**Descripción:** Usuario no autenticado.

**Permisos generales:**
- Ver menú público (si habilitado por store)
- Ver información del store
- NO puede hacer pedidos
- NO puede ver precios (opcional, configurable)

**Funcionalidades disponibles:**
- `MenuPage.tsx` (modo read-only)

**Restricciones:**
- Debe crear cuenta para hacer pedidos
- No puede ver wallet ni loyalty
- No puede trackear órdenes

---

### Matriz de Permisos

| Funcionalidad | super_admin | owner | admin | staff | waiter | client | anonymous |
|--------------|-------------|-------|-------|-------|--------|--------|-----------|
| **Dashboard** | ✅ All | ✅ Own | ✅ Own | ⚠️ Config | ❌ | ❌ | ❌ |
| **Create Order** | ✅ | ✅ | ✅ | ⚠️ Config | ✅ | ✅ | ❌ |
| **Manage Inventory** | ✅ | ✅ | ✅ | ⚠️ Config | ❌ | ❌ | ❌ |
| **Manage Products** | ✅ | ✅ | ✅ | ⚠️ Config | ❌ | ❌ | ❌ |
| **Manage Clients** | ✅ | ✅ | ✅ | ⚠️ Config | ✅ View | ✅ Own | ❌ |
| **Manage Staff** | ✅ | ✅ | ✅ Limited | ❌ | ❌ | ❌ | ❌ |
| **Finance** | ✅ | ✅ | ✅ | ⚠️ Config | ❌ | ❌ | ❌ |
| **Cash Sessions** | ✅ | ✅ | ✅ | ⚠️ Config | ❌ | ❌ | ❌ |
| **Loyalty Config** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Menu Design** | ✅ | ✅ | ✅ | ⚠️ Config | ❌ | ❌ | ❌ |
| **Settings** | ✅ | ✅ | ⚠️ Limited | ❌ | ❌ | ✅ Own | ❌ |
| **View Menu** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ Public |
| **Use Wallet** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ Own | ❌ |
| **Loyalty Points** | ✅ | ✅ | ✅ Admin | ❌ | ❌ | ✅ Own | ❌ |

**Leyenda:**
- ✅ Full access
- ⚠️ Config: Depende de permisos configurados en `cafe_role_permissions`
- ⚠️ Limited: Acceso limitado (view only, no delete, etc.)
- ⚠️ Public: Solo si el store habilita menú público
- ❌ No access

---

## 3. FUNCIONALIDADES DEL SISTEMA

### A. Gestión de Tiendas (Store Management)

#### A.1 Configuración de Store

**Página:** `StoreSettings.tsx`

**Funcionalidades:**
- **Información básica**
  - Nombre del negocio
  - Logo (upload a Supabase Storage)
  - Descripción
  - Dirección, teléfono, email

- **Modo de servicio**
  - Counter service (mostrador)
  - Table service (mesas)
  - Club mode (barra)
  - Delivery

- **Integraciones**
  - MercadoPago (client_id, access_token)
  - Email (SMTP config)
  - SMS (provider config)

- **Configuración de menú**
  - Horarios de operación
  - Visibilidad de precios
  - Menú público (anonymous access)
  - Categorías de productos

**Database:**
- `stores` table
  - `id`, `name`, `slug`, `logo_url`
  - `service_mode` (enum)
  - `mercadopago_client_id`, `mercadopago_access_token`
  - `menu_theme` (JSONB), `menu_logic` (JSONB)

**Roles con acceso:**
- super_admin, owner, admin (limited)

---

#### A.2 Multi-Sucursal (Multi-Location)

**Funcionalidad:** Un mismo tenant (store) puede tener múltiples sucursales.

**Implementación:**
- `storage_locations` table
  - Tipos: `warehouse`, `bar`, `kitchen`, `storage`
  - Cada location tiene inventario independiente
  - Transfers entre locations

**Casos de uso:**
- Cafetería con 2 sucursales (Centro, Norte)
- Restaurante con warehouse central + 3 salones

**Gestión:**
- `InventoryManagement.tsx` - View by location
- `transfer_stock` RPC - Mover inventario entre locations

---

### B. Gestión de Team (Staff Management)

**Página:** `StaffManagement.tsx`

#### B.1 Invitar Staff

**Funcionalidades:**
- Invitar owner, admin, staff, waiter
- Asignar rol (cafe_roles)
- Enviar email de invitación
- Gestionar permisos granulares

**Flow:**
1. Owner/Admin va a Staff Management
2. Click "Invite Member"
3. Ingresa email, selecciona rol
4. Sistema envía email con link de invitación
5. Usuario crea cuenta y queda asignado al store

**Edge Functions:**
- `invite-owner` - Invitar owner
- `invite-member` - Invitar staff
- `invite-user` - Invitar usuario genérico

**Database:**
- `profiles` table
  - `id`, `email`, `store_id`, `role_id`
- `cafe_roles` table
  - `id`, `store_id`, `name`, `description`
- `cafe_role_permissions` table
  - `role_id`, `permission` (enum)

---

#### B.2 Roles y Permisos

**Sistema de permisos:**

Cada store puede crear roles custom con permisos granulares.

**Permisos disponibles:**
```typescript
enum Permission {
  dashboard,    // Ver dashboard
  orders,       // Gestionar órdenes
  tables,       // Gestionar mesas
  inventory,    // Gestionar inventario
  design,       // Editar menú design
  clients,      // Gestionar clientes
  loyalty,      // Configurar loyalty
  finance,      // Ver finanzas
  staff,        // Gestionar team
  audit,        // Ver audit logs
  settings,     // Configurar store
  reports       // Ver reportes
}
```

**Ejemplo de configuración:**

| Rol | Permisos |
|-----|----------|
| Manager | dashboard, orders, tables, inventory, clients, finance, reports |
| Barista | orders (bar only), inventory (view) |
| Cashier | orders, clients, finance |
| Waiter | orders, tables, clients |

**Implementación:**
- RLS policies verifican `role_id` en `cafe_role_permissions`
- Frontend checkea permisos antes de mostrar UI
- Backend valida permisos en RPCs

---

### C. Gestión de Clientes (Client Management)

**Página:** `Clients.tsx` (staff), `client/ProfilePage.tsx` (customer)

#### C.1 Registro de Clientes

**Métodos de registro:**

1. **Self-service** (cliente se registra)
   - `client/AuthPage.tsx`
   - Email + password
   - Verificación por email

2. **Staff registration** (mesero registra cliente)
   - `Clients.tsx` → "Add Client"
   - Nombre, teléfono, email

3. **Automático en primera orden**
   - Cliente hace pedido sin cuenta
   - Sistema crea cuenta guest
   - Email de bienvenida con link para completar perfil

**Database:**
- `clients` table
  - `id`, `store_id`, `name`, `email`, `phone`
  - `wallet_balance`, `loyalty_points`
  - `vip_status`, `notes`

---

#### C.2 Wallet (Saldo Prepago)

**Funcionalidad:** Cliente tiene balance de dinero prepago en el sistema.

**Ventajas:**
- Pagos instantáneos sin efectivo
- Control de gastos
- Descuentos en recargas
- No requiere internet para pagar (balance cached)

**Operations:**

| Operación | Descripción | RPC |
|-----------|-------------|-----|
| **Top-up** | Recarga de saldo | Edge Function `create-topup` + webhook MP |
| **Payment** | Pago de orden con wallet | `pay_with_wallet` |
| **Refund** | Devolución a wallet | `wallet_partial_refund_on_edit` |
| **Transfer P2P** | Transferir a otro cliente | `p2p_wallet_transfer` |
| **Admin Add** | Owner agrega saldo manual | `admin_add_balance_v2` |

**Database:**
- `wallets` table (DEPRECATED, usar clients.wallet_balance)
- `clients.wallet_balance` - Balance actual
- `wallet_ledger` - Ledger de transacciones (audit trail)
- `wallet_topups` - Recargas via MercadoPago

**Wallet Ledger (Audit Trail):**
```sql
wallet_ledger:
  - id
  - wallet_id (client_id)
  - store_id
  - amount (+ topup, - payment)
  - balance_after
  - entry_type (topup, payment, refund, adjustment, p2p_send, p2p_receive)
  - reference_type (order, wallet_transaction, manual)
  - reference_id
  - description
  - performed_by (user_id)
  - source (mercadopago, cash, card, admin)
  - payment_method
  - idempotency_key
  - created_at
```

**Flow de Topup:**
```
1. Cliente va a WalletPage
2. Click "Recargar" → Ingresa monto
3. Frontend llama Edge Function create-topup
4. Edge Function crea MercadoPago preference
5. Cliente escanea QR y paga en MP app
6. MP envía webhook a mp-webhook Edge Function
7. Webhook verifica pago y llama credit_wallet RPC
8. RPC inserta en wallet_ledger
9. Trigger update_wallet_balance_from_ledger actualiza clients.wallet_balance
10. Cliente ve balance actualizado
```

**Seguridad:**
- RLS policies: Cliente solo ve su wallet
- Idempotency keys previenen duplicados
- Ledger inmutable (append-only)
- Trigger automático update balance desde ledger

---

#### C.3 Loyalty Points (Puntos de Lealtad)

**Funcionalidad:** Sistema de puntos por compra y recompensas.

**Configuración:**
- `loyalty_configs` table (1 por store)
  - `points_per_100_pesos` - Puntos ganados por cada $100
  - `enabled` - Activo/inactivo

**Product Multipliers:**
- `loyalty_product_rules` table
  - Productos específicos dan puntos extra
  - Ejemplo: Café del día da 2x puntos

**Rewards:**
- `loyalty_rewards` table
  - `name`, `points_required`, `product_id`
  - Cliente canjea puntos por producto gratis

**Transactions:**
- `loyalty_transactions` table
  - `client_id`, `order_id`, `points`, `transaction_type`
  - Tipos: `earn` (ganó puntos), `redeem` (canjeó)

**Flow de Earn Points:**
```
1. Cliente completa orden de $500
2. Trigger process_loyalty_points se ejecuta
3. Calcula: $500 / 100 * 5 puntos = 25 puntos
4. Si producto tiene multiplier 2x → 50 puntos
5. INSERT en loyalty_transactions (type: earn)
6. UPDATE clients.loyalty_points += 50
```

**Flow de Redeem:**
```
1. Cliente ve rewards en LoyaltyPage
2. Selecciona reward (Ej: "Café gratis - 100 puntos")
3. Click "Redeem"
4. Frontend llama redeem_points RPC
5. RPC verifica balance de puntos
6. Deduce puntos, crea orden con precio $0
7. INSERT en loyalty_transactions (type: redeem)
```

---

#### C.4 Historial de Órdenes

**Funcionalidad:** Cliente ve historial de sus compras.

**Páginas:**
- `client/ProfilePage.tsx` - Historial resumido
- `client/OrderStatusPage.tsx` - Detalle de orden

**Data mostrada:**
- Fecha, número de orden
- Items comprados
- Total, método de pago
- Estado (delivered, cancelled)
- Puntos ganados

**Database:**
- `orders` table filtered by `client_id`
- Join con `order_items` para detalle

---

### D. Gestión de Productos (Product Management)

**Páginas:**
- `Products.tsx` - Lista de productos
- `MenuManagement.tsx` - Catálogo completo
- `RecipeManagement.tsx` - Recipes de productos

#### D.1 Catálogo de Productos

**Estructura:**

```
Product (producto vendible)
  ├── Variants (variantes: chico, mediano, grande)
  ├── Addons (extras: leche, azúcar, shot extra)
  └── Recipe (ingredientes de inventario)
```

**Database:**
- `products` table
  - `id`, `store_id`, `name`, `description`, `price`
  - `category`, `image_url`, `available`
  - `has_variants`, `has_addons`, `has_recipe`
- `product_variants` table
  - `product_id`, `name`, `price_modifier`
  - Ejemplo: Chico (+$0), Grande (+$50)
- `product_addons` table
  - `product_id`, `name`, `price`
  - Ejemplo: Shot extra espresso (+$30)
- `product_recipes` table
  - `product_id`, `inventory_item_id`, `quantity`
  - Ejemplo: Latte requiere 20g café + 200ml leche

**Funcionalidades:**
- Crear/editar productos
- Subir imagen (Supabase Storage)
- Marcar como disponible/no disponible
- Asignar categoría
- Set precio base
- Configurar variantes y addons
- Definir recipe (ingredientes)

**Roles con acceso:**
- super_admin, owner, admin, staff (con permiso `inventory`)

---

#### D.2 Variantes (Product Variants)

**Ejemplo:**

```
Producto: Café Latte
  Variantes:
    - Chico (250ml) → +$0
    - Mediano (350ml) → +$20
    - Grande (500ml) → +$50
```

**Implementación:**
- `product_variants` table
  - `id`, `product_id`, `name`, `price_modifier`
- Precio final = `product.price + variant.price_modifier`

**Recipe Override:**
- Variante puede override recipe
- Ejemplo: Grande usa 30g café (vs 20g base)
- `variant_id` en `product_recipes` table

---

#### D.3 Addons (Extras)

**Ejemplo:**

```
Producto: Café Americano
  Addons disponibles:
    - Leche (+$10)
    - Azúcar (+$0)
    - Shot extra espresso (+$30)
    - Crema (+$15)
```

**Implementación:**
- `product_addons` table
  - `id`, `product_id`, `name`, `price`, `inventory_item_id`
- Cliente selecciona addons en checkout
- Precio final = `base + variant + sum(addons)`

**Stock deduction:**
- Addons con `inventory_item_id` deduce stock
- Ejemplo: Leche addon deduce 50ml del inventario de leche

---

#### D.4 Recipes (Recetas)

**Funcionalidad:** Define ingredientes de inventario que componen un producto.

**Ejemplo:**

```
Producto: Café Latte (250ml)
  Recipe:
    - Café molido: 20g (inventory_item_id: uuid-cafe)
    - Leche: 200ml (inventory_item_id: uuid-leche)
    - Vaso 250ml: 1 unidad (inventory_item_id: uuid-vaso)
```

**Database:**
- `product_recipes` table
  - `product_id`, `inventory_item_id`, `quantity`, `unit`
  - `variant_id` (optional, para override por variante)

**Stock Deduction:**
- Al completar orden (status → delivered)
- Trigger `finalize_order_stock` ejecuta
- Por cada order_item:
  - Busca recipe del product
  - Deduce `quantity * order_item.quantity` de inventory
  - Registra en `stock_movements`

**Funcionalidades:**
- Crear recipe (vincular productos → inventory items)
- Editar cantidades
- Override recipe por variante
- Ver cost de producto (suma de ingredientes)

**Página:**
- `RecipeManagement.tsx`

---

### E. Gestión de Inventario (Inventory Management)

**Página:** `InventoryManagement.tsx`

#### E.1 Items de Inventario

**Estructura:**

```
Inventory Item (materia prima)
  ├── Stock by Location (warehouse, bar, kitchen)
  ├── Open Packages (paquetes abiertos en uso)
  └── Closed Packages (paquetes sellados en stock)
```

**Database:**
- `inventory_items` table (39 columnas - BLOATED, ver auditoría)
  - `id`, `store_id`, `name`, `unit` (kg, L, units)
  - `category`, `supplier`, `sku`
  - `reorder_point`, `reorder_quantity`
  - `cost_per_unit`
- `inventory_location_stock` table
  - `inventory_item_id`, `location_id`, `quantity`
  - Stock por ubicación (warehouse 50kg, bar 5kg)
- `item_stock_levels` table
  - Similar a location_stock pero con más metadata
- `open_packages` table
  - Tracking de paquetes abiertos (FIFO consumption)
  - `inventory_item_id`, `location_id`, `quantity_remaining`, `opened_at`

**Funcionalidades:**
- Crear/editar items de inventario
- Set reorder points (alertas de stock bajo)
- Tracking de cost per unit
- Ver stock por location
- Transferir entre locations
- Ajustar stock manualmente
- Ver historial de movimientos

---

#### E.2 Stock por Ubicación (Locations)

**Locations comunes:**
- **Warehouse** (bodega central)
- **Bar** (barra de preparación)
- **Kitchen** (cocina)
- **Storage** (almacén adicional)

**Database:**
- `storage_locations` table
  - `id`, `store_id`, `name`, `type`

**Funcionalidad:**
- Ver stock de cada item por location
- Ejemplo:
  - Café molido: Warehouse 50kg, Bar 2kg
  - Leche: Warehouse 100L, Bar 10L

**Página:**
- `InventoryManagement.tsx` - Selector de location

---

#### E.3 Transferencias de Stock

**Funcionalidad:** Mover inventario entre locations.

**Use cases:**
- Warehouse → Bar (reponer barra)
- Bar → Kitchen (mover ingredientes)
- Warehouse → Storage (reorganizar)

**RPC:**
- `transfer_stock(from_location, to_location, item_id, quantity)`

**Flow:**
```
1. Staff va a Inventory Management
2. Selecciona item (ej: Café molido)
3. Click "Transfer"
4. From: Warehouse → To: Bar
5. Quantity: 5kg
6. Submit
7. RPC transfer_stock ejecuta:
   - UPDATE inventory_location_stock
     SET quantity = quantity - 5 WHERE location_id = warehouse
   - UPDATE inventory_location_stock
     SET quantity = quantity + 5 WHERE location_id = bar
   - INSERT stock_transfers (from, to, quantity, performed_by)
   - INSERT stock_movements (audit trail)
```

**Database:**
- `stock_transfers` table
  - `id`, `inventory_item_id`, `from_location_id`, `to_location_id`
  - `quantity`, `performed_by`, `created_at`
- `stock_movements` table
  - Audit trail de TODOS los movimientos
  - `inventory_item_id`, `location_id`, `quantity_change`, `movement_type`
  - Tipos: `transfer_in`, `transfer_out`, `sale`, `adjustment`, `purchase`

---

#### E.4 Ajustes de Stock

**Funcionalidad:** Corregir stock manualmente (merma, robo, error de conteo).

**Use cases:**
- Merma (producto vencido/dañado)
- Robo
- Error en conteo físico
- Regalo a cliente

**Flow:**
```
1. Staff selecciona item
2. Click "Adjust Stock"
3. Current: 50kg → New: 48kg (merma de 2kg)
4. Reason: "Leche vencida"
5. Submit
6. Sistema registra en stock_movements (type: adjustment)
7. Actualiza inventory_location_stock
```

**Tracking:**
- `stock_movements` table con `movement_type = 'adjustment'`
- Campo `notes` para justificación

---

#### E.5 Open Packages (Sistema de Paquetes Abiertos)

**Problema:** Al abrir un paquete de 1kg de café, se debe consumir primero ese antes de abrir otro (FIFO).

**Solución:** Sistema de open packages.

**Database:**
- `open_packages` table
  - `id`, `inventory_item_id`, `location_id`
  - `quantity_remaining`, `original_quantity`
  - `opened_at`, `opened_by`
  - `package_number` (for tracking)

**Flow de consumo:**

```
1. Orden requiere 20g de café
2. Sistema busca open packages de café en location=bar
3. Si existe open package:
   - Consume de ese paquete primero (FIFO)
   - UPDATE open_packages SET quantity_remaining -= 20g
   - Si quantity_remaining = 0 → DELETE open package
4. Si NO existe open package:
   - Busca closed packages en inventory
   - Crea nuevo open package
   - INSERT open_packages (quantity_remaining = 1000g - 20g = 980g)
   - Consume 20g
```

**RPC:**
- `consume_from_smart_packages(item_id, location_id, quantity)`

**Ventajas:**
- Evita desperdiciar paquetes parcialmente usados
- FIFO automático (primero abierto, primero consumido)
- Tracking de cuántos paquetes abiertos hay
- Alertas si hay muchos paquetes abiertos (mala rotación)

---

#### E.6 Alertas de Stock

**Funcionalidad:** Notificar cuando stock está bajo.

**Configuración:**
- `inventory_items.reorder_point` - Stock mínimo
- `inventory_items.reorder_quantity` - Cantidad a pedir

**Ejemplo:**
- Café molido:
  - Reorder point: 5kg
  - Reorder quantity: 20kg
- Cuando stock < 5kg → Alerta "Pedir 20kg de café"

**Implementación:**
- Query en Dashboard: `SELECT * FROM inventory_items WHERE total_stock < reorder_point`
- Mostrar badge rojo en InventoryManagement

---

#### E.7 Procesamiento de Facturas con IA

**Funcionalidad:** Extraer items de factura con Google Gemini.

**Página:** `InvoiceProcessor.tsx`

**Flow:**
```
1. Staff sube imagen/PDF de factura
2. Frontend llama Edge Function process-invoice
3. Edge Function:
   - Sube archivo a Supabase Storage
   - Envía a Gemini AI (vision model)
   - Prompt: "Extrae items de esta factura: nombre, cantidad, unidad, precio"
4. Gemini retorna JSON:
   [
     { name: "Café molido", quantity: 10, unit: "kg", price: 5000 },
     { name: "Leche", quantity: 50, unit: "L", price: 3000 }
   ]
5. Frontend muestra items extraídos
6. Staff valida y mapea a inventory_items
7. Submit → transfer_stock para cada item
8. Stock actualizado automáticamente
```

**Edge Function:**
- `process-invoice` - Gemini Vision API

**Beneficios:**
- Ahorra tiempo (no tipear factura manualmente)
- Reduce errores de transcripción
- Automatic matching con items existentes

---

### F. Gestión de Órdenes (Order Management)

**Páginas:**
- `OrderCreation.tsx` - POS manual (staff)
- `OrderBoard.tsx` - Kanban de órdenes activas
- `OrderConfirmationPage.tsx` - Confirmación post-orden
- `client/MenuPage.tsx` - Menú digital (cliente)
- `client/CartPage.tsx` - Carrito (cliente)
- `client/CheckoutPage.tsx` - Checkout (cliente)
- `client/TrackingPage.tsx` - Tracking en tiempo real
- `client/OrderStatusPage.tsx` - Detalle de orden

#### F.1 Crear Orden (POS - Staff)

**Flujo:**
```
1. Staff abre OrderCreation.tsx (POS)
2. Selecciona cliente (opcional, buscar por nombre/teléfono)
3. Selecciona mesa/zona (opcional)
4. Agrega productos:
   - Selecciona producto
   - Selecciona variante (chico/grande)
   - Selecciona addons
   - Ingresa cantidad
   - Click "Add to cart"
5. Revisa carrito
6. Selecciona método de pago:
   - Cash
   - Card
   - Wallet
   - MercadoPago QR
7. Click "Create Order"
8. Frontend llama create_order_with_stock_deduction RPC
9. Orden creada con status = 'pending'
10. Si pago inmediato (cash/card) → status = 'paid'
11. Orden aparece en OrderBoard
```

**RPC:**
- `create_order_with_stock_deduction(client_id, items, payment_method, ...)`

**Database:**
- INSERT `orders` (client_id, store_id, total_amount, status, payment_method)
- INSERT `order_items` (order_id, product_id, variant_id, addons, quantity, price)
- Si config `deduct_stock_on_create = true`:
  - Ejecuta `decrease_stock_atomic_v20` RPC
  - INSERT `stock_movements`

---

#### F.2 Crear Orden (Self-Service - Cliente)

**Flujo:**
```
1. Cliente escanea QR en mesa
2. QR Resolver → redirige a MenuPage con context (table_id)
3. Cliente navega menú (MenuPage.tsx)
4. Agrega productos a carrito (CartPage.tsx)
5. Click "Checkout"
6. CheckoutPage.tsx
7. Selecciona método de pago:
   - Wallet (si tiene balance)
   - MercadoPago QR
8. Si Wallet:
   - pay_with_wallet RPC
   - Orden creada y pagada instantáneamente
9. Si MercadoPago:
   - create-checkout Edge Function
   - Genera QR de pago
   - Cliente paga en app de MP
   - Webhook verifica pago
   - Orden marcada como paid
10. Cliente redirigido a TrackingPage
11. Ve estado en tiempo real (pending → preparing → ready → delivered)
```

**Edge Functions:**
- `create-checkout` - Crea preference de MP
- `mp-webhook` - Procesa notificación de pago

**Database:**
- INSERT `orders`, `order_items`
- INSERT `client_sessions` (tracking de sesión del cliente)
- UPDATE `wallet_ledger` (si pago con wallet)

---

#### F.3 Estados de Orden

**Lifecycle de orden:**

```
pending → paid → preparing → ready → delivered
   ↓
 cancelled
```

**Estados:**

| Estado | Descripción | Siguiente |
|--------|-------------|-----------|
| `pending` | Orden creada, pago pendiente | `paid` o `cancelled` |
| `paid` | Pagada, esperando preparación | `preparing` |
| `preparing` | En cocina/barra | `ready` |
| `ready` | Lista para entrega/pickup | `delivered` |
| `delivered` | Entregada al cliente | (final) |
| `cancelled` | Cancelada | (final) |

**Triggers en cambio de estado:**
- `pending → paid`: No action (ya pagó)
- `paid → preparing`: Notificar cocina/barra
- `preparing → ready`: Notificar cliente (push notification)
- `ready → delivered`:
  - **Deducir stock** (trigger finalize_order_stock)
  - **Award loyalty points** (trigger process_loyalty_points)
  - **Update cash session** (si pago cash)
- `* → cancelled`:
  - **Rollback stock** (si ya se dedujo)
  - **Refund wallet** (si pagó con wallet)

---

#### F.4 Modificar Orden

**Funcionalidad:** Editar orden existente (agregar/quitar items).

**Use cases:**
- Cliente pide item adicional
- Cliente cancela item
- Error en orden original

**Flow:**
```
1. Staff abre orden en OrderBoard
2. Click "Edit"
3. Agrega/quita items
4. Submit
5. Sistema:
   - Calcula diff de precio (+ $50 si agregó, - $20 si quitó)
   - Si diff > 0:
     - Cobrar diff con mismo método de pago original
     - O generar nueva transacción
   - Si diff < 0:
     - Refund a wallet (wallet_partial_refund_on_edit RPC)
   - Ajustar stock (compensate_stock_on_order_edit trigger)
   - Crear order_event (type: edited)
```

**RPCs:**
- `wallet_partial_refund_on_edit` - Refund parcial a wallet
- `wallet_additional_charge_on_edit` - Cobro adicional

**Triggers:**
- `compensate_stock_on_order_edit` - Ajusta stock según diff

---

#### F.5 Cancelar Orden

**Funcionalidad:** Cancelar orden (antes o después de preparación).

**Flow:**
```
1. Staff/Cliente click "Cancel Order"
2. Sistema verifica:
   - Si status = 'delivered' → NO se puede cancelar
   - Si status = 'preparing' → Confirmar (ya están cocinando)
3. Confirma cancelación
4. UPDATE orders SET status = 'cancelled'
5. Triggers:
   - rollback_stock_on_cancellation (devolver stock)
   - wallet_refund_on_cancel (refund a wallet si pagó con wallet)
   - reverse_loyalty_on_cancel (quitar puntos otorgados)
   - reverse_cash_on_cancel (ajustar cash session)
6. INSERT order_event (type: cancelled, reason)
```

**Triggers:**
- `rollback_stock_on_cancellation` - Devuelve stock
- Wallet refund automático
- Loyalty points reversed

---

#### F.6 OrderBoard (Kanban)

**Funcionalidad:** Vista Kanban de órdenes activas.

**Página:** `OrderBoard.tsx`

**Columnas:**
- **Pending** (pendientes de pago)
- **Paid** (pagadas, listas para preparar)
- **Preparing** (en cocina/barra)
- **Ready** (listas para entrega)
- **Delivered** (entregadas hoy)

**Funcionalidades:**
- Drag & drop para cambiar estado
- Filtrar por:
  - Service area (bar, kitchen, salon)
  - Payment method
  - Date range
- Click en orden → Ver detalle
- Acciones rápidas:
  - Mark as preparing
  - Mark as ready
  - Mark as delivered
  - Cancel order
  - Print ticket

**Real-time:**
- Supabase Realtime subscription
- Nuevas órdenes aparecen automáticamente
- Cambios de estado se reflejan en tiempo real para todos los devices

---

### G. Gestión de Pagos (Payment Management)

**Métodos de pago soportados:**
1. **Cash** - Efectivo
2. **Card** - Tarjeta (terminal física)
3. **Wallet** - Saldo prepago
4. **MercadoPago QR** - Pago digital con QR

#### G.1 Pago con MercadoPago

**Flow:**
```
1. Cliente selecciona pago con MP
2. Frontend llama create-mp-preference Edge Function
3. Edge Function:
   - Usa MP SDK
   - Crea preference con:
     - Items de la orden
     - Total amount
     - External reference (order_id)
     - Notification URL (webhook)
   - Retorna preference_id
4. Frontend genera QR con preference_id
5. Cliente escanea QR en app MercadoPago
6. Cliente paga
7. MercadoPago envía webhook a mp-webhook Edge Function
8. Webhook:
   - Verifica signature
   - Busca payment por ID
   - Actualiza orden: payment_status = 'approved'
   - Llama complete_wallet_payment RPC si corresponde
9. Frontend recibe update via Realtime
10. Orden marcada como paid
```

**Edge Functions:**
- `create-mp-preference` - Crea QR de pago
- `mp-webhook` - Procesa notificación de pago
- `verify-payment-status` - Verifica estado de pago

**Database:**
- `orders.payment_status` - Estado del pago (pending, approved, rejected)
- `orders.payment_id` - ID de transacción en MercadoPago

**Configuración:**
- `stores.mercadopago_client_id`
- `stores.mercadopago_access_token`

---

#### G.2 Pago con Wallet

**Flow:**
```
1. Cliente selecciona pago con Wallet
2. Frontend verifica balance:
   - GET clients.wallet_balance
   - Si balance < total → Error "Saldo insuficiente"
3. Cliente confirma pago
4. Frontend llama pay_with_wallet RPC:
   - Parámetros: client_id, amount, order_id
5. RPC:
   - Verifica balance >= amount
   - INSERT wallet_ledger (amount = -amount, type = 'payment')
   - Trigger update_wallet_balance_from_ledger actualiza clients.wallet_balance
   - Retorna new_balance
6. UPDATE orders SET payment_status = 'approved', payment_method = 'wallet'
7. Orden marcada como paid
```

**RPCs:**
- `pay_with_wallet(client_id, amount, order_id)` - Pagar con wallet
- `complete_wallet_payment(order_id)` - Completar pago

**Seguridad:**
- RLS policies: Cliente solo puede usar su wallet
- Store_id validation: Wallet debe ser del mismo store que la orden
- Idempotency: Evita double-payment

---

#### G.3 Pago con Cash

**Flow:**
```
1. Cliente paga en efectivo
2. Staff selecciona payment_method = 'cash'
3. CREATE order con status = 'paid'
4. Cash se registra en cash session activa
5. Trigger update_cash_on_payment:
   - UPDATE cash_sessions
   - SET cash_sales += order.total_amount
6. No payment_id (pago offline)
```

**Tracking:**
- `cash_sessions` table
  - `cash_sales`, `card_sales`, `wallet_sales`, `mp_sales`
- Arqueo al final del día

---

#### G.4 Payment Transactions (Audit)

**Database:**
- `payment_transactions` table (FALTA created_at según auditoría)
  - `id`, `order_id`, `amount`, `payment_method`
  - `status` (pending, completed, failed, refunded)
  - `gateway_transaction_id` (ID en MP, Stripe, etc.)
  - `metadata` (JSONB con detalles adicionales)

**Funcionalidad:**
- Audit trail de todas las transacciones
- Ver historial de pagos por orden
- Detectar intentos fallidos
- Refunds tracking

---

#### G.5 Refunds (Devoluciones)

**Casos:**
1. **Orden cancelada después de pagar**
2. **Orden editada con diff negativo**

**Flow de refund a Wallet:**
```
1. Orden cancelada (status → cancelled)
2. Si payment_method = 'wallet':
   - Trigger wallet_refund_on_cancel
   - INSERT wallet_ledger (amount = +order.total, type = 'refund')
   - Trigger update balance
   - Cliente recupera saldo
3. Si payment_method = 'mercadopago':
   - Manual: Owner debe hacer refund en dashboard de MP
   - TODO: Automatizar con MP Refunds API
```

**RPCs:**
- `wallet_partial_refund_on_edit(order_id, amount)` - Refund parcial

---

### H. Gestión de Caja (Cash Management)

**Página:** `Finance.tsx`

#### H.1 Sesiones de Caja (Cash Sessions)

**Funcionalidad:** Tracking de efectivo por turno.

**Database:**
- `cash_sessions` table
  - `id`, `store_id`, `opened_by`, `closed_by`
  - `opened_at`, `closed_at`
  - `initial_cash` - Efectivo inicial
  - `cash_sales`, `card_sales`, `wallet_sales`, `mp_sales`
  - `total_sales`
  - `cash_withdrawals`, `cash_deposits`, `cash_adjustments`
  - `expected_cash` - Calculado
  - `actual_cash` - Contado al cerrar
  - `discrepancy` - Diferencia
  - `notes`

**Flow:**
```
1. Staff inicia turno
2. Abre caja (open_cash_session RPC)
3. Ingresa initial_cash (ej: $500)
4. Durante el turno:
   - Órdenes con cash → cash_sales += amount
   - Órdenes con card → card_sales += amount
   - Retiros de caja → cash_withdrawals += amount
5. Al final del turno:
   - Cierra caja (close_cash_session RPC)
   - Cuenta efectivo real (actual_cash)
   - Sistema calcula expected_cash:
     expected = initial + cash_sales + deposits - withdrawals - adjustments
6. Compara expected vs actual:
   - discrepancy = actual - expected
   - Si discrepancy > threshold → Alerta
7. Registra arqueo en cash_closures
```

**RPCs:**
- `open_cash_session(initial_cash, location_id)` - Abrir caja
- `close_cash_session(session_id, actual_cash, notes)` - Cerrar caja
- `get_session_cash_summary(session_id)` - Resumen de sesión
- `get_session_expected_cash(session_id)` - Calcular efectivo esperado

---

#### H.2 Eventos de Caja (Cash Events)

**Funcionalidad:** Registrar movimientos de efectivo durante el turno.

**Tipos de eventos:**
- **Withdrawal** (retiro) - Sacar efectivo de caja
- **Deposit** (depósito) - Agregar efectivo a caja
- **Adjustment** (ajuste) - Corrección manual
- **Expense** (gasto) - Pago de expense fijo

**Database:**
- `cash_movements` table (FALTA store_id según auditoría)
  - `id`, `session_id`, `amount`, `movement_type`
  - `reason`, `performed_by`, `created_at`

**Flow de Withdrawal:**
```
1. Staff necesita retirar $200 para comprar suministros
2. Finance.tsx → "Register Withdrawal"
3. Ingresa amount: 200, reason: "Compra de azúcar"
4. Submit → INSERT cash_movements
5. UPDATE cash_sessions SET cash_withdrawals += 200
```

**RPCs:**
- `register_cash_withdrawal(session_id, amount, reason)`
- `register_cash_adjustment(session_id, amount, reason)`

---

#### H.3 Arqueo (Cash Closure)

**Funcionalidad:** Proceso de cierre y reconciliación de caja.

**Flow:**
```
1. Staff click "Close Cash Session"
2. Sistema muestra expected_cash (calculado automáticamente):
   - Initial: $500
   - Sales (cash): +$3200
   - Withdrawals: -$200
   - Expected: $3500
3. Staff cuenta efectivo real: $3480
4. Ingresa actual_cash: 3480
5. Sistema calcula discrepancy: -$20 (falta)
6. Staff ingresa notes: "Cliente se fue sin pagar $20"
7. Submit
8. UPDATE cash_sessions:
   - closed_at = NOW()
   - actual_cash = 3480
   - discrepancy = -20
   - status = 'closed'
9. INSERT cash_closures (backup/audit)
```

**Database:**
- `cash_closures` table
  - Copia de cash_sessions al cerrar
  - Inmutable (audit trail)

---

#### H.4 Cierre de Día (Day Closure)

**Funcionalidad:** Resumen consolidado del día (múltiples cash sessions).

**Database:**
- `day_closures` table
  - `id`, `store_id`, `closure_date`
  - `total_sales`, `total_cash`, `total_card`, `total_wallet`, `total_mp`
  - `total_expenses`, `net_profit`
  - `notes`

**Flow:**
```
1. Owner click "Close Day"
2. Sistema agrega todas las cash_sessions del día:
   - Session 1 (turno mañana): $3500
   - Session 2 (turno tarde): $5200
   - Session 3 (turno noche): $4100
   - Total sales: $12,800
3. Sistema calcula expenses del día:
   - Fixed expenses: $500 (rent proration, salaries)
   - Variable expenses: $3200 (COGS, losses)
   - Total expenses: $3700
4. Net profit: $12,800 - $3700 = $9,100
5. INSERT day_closures
6. Genera reporte PDF (opcional)
```

**RPCs:**
- Ninguno específico, se calcula client-side o con query

---

#### H.5 Gastos Fijos (Fixed Expenses)

**Funcionalidad:** Registrar gastos operacionales fijos.

**Database:**
- `fixed_expenses` table
  - `id`, `store_id`, `name`, `amount`, `frequency`
  - Frecuencia: `daily`, `weekly`, `monthly`, `yearly`
  - Ejemplos: Rent, salaries, utilities

**Flow:**
```
1. Owner va a Finance → "Fixed Expenses"
2. Agrega expense:
   - Name: "Rent"
   - Amount: $15,000
   - Frequency: monthly
3. Sistema calcula daily proration:
   - Daily = 15000 / 30 = $500/day
4. En day_closure, se incluye proration
```

**RPCs:**
- `register_fixed_expense(name, amount, frequency)`

---

### I. Venue Control (Mesas/Nodos)

**Página:** `TableManagement.tsx`

#### I.1 QR Codes

**Funcionalidad:** Sistema de QR por mesa/zona para pedidos self-service.

**Database:**
- `qr_codes` table
  - `id`, `store_id`, `code` (unique string)
  - `type` (table, bar, zone, takeaway, pickup)
  - `reference_id` (node_id o zone_id)
  - `status` (active, inactive)
  - `scan_count`

**Flow de generación:**
```
1. Owner va a TableManagement
2. Selecciona mesa "Mesa 5"
3. Click "Generate QR"
4. Sistema:
   - INSERT qr_codes (type='table', reference_id=mesa_5_id)
   - code = random UUID
5. QR generado con URL:
   https://payper.app/qr/{code}
6. Cliente escanea → QR Resolver → MenuPage con context
```

**QR Resolver:**
- Endpoint: `/qr/:code`
- Busca en `qr_codes` table
- Extrae `type` y `reference_id`
- Redirige a MenuPage con query params:
  - `?table=mesa_5_id` (si type=table)
  - `?zone=bar` (si type=zone)
  - `?mode=pickup` (si type=pickup)

---

#### I.2 Tables/Bars (Venue Nodes)

**Funcionalidad:** Gestión de mesas, barras, zonas.

**Database:**
- `venue_nodes` table
  - `id`, `store_id`, `name`, `type` (table, bar, zone)
  - `capacity` (personas)
  - `status` (available, occupied, reserved, inactive)
  - `current_order_id` - Orden activa en la mesa

**Funcionalidades:**
- Crear/editar nodos
- Marcar como occupied/available
- Vincular orden a mesa
- Mover mesa (transfer order)
- Reservar mesa

**Flow de abrir mesa:**
```
1. Cliente escanea QR de mesa
2. Cliente hace pedido
3. En checkout, order.venue_node_id = mesa_5_id
4. Trigger sync_node_status_from_order:
   - UPDATE venue_nodes
   - SET status = 'occupied', current_order_id = order.id
5. Mesa marcada como ocupada en TableManagement view
6. Al completar orden:
   - UPDATE venue_nodes SET status = 'available', current_order_id = NULL
```

**RPCs:**
- `open_table(table_id, client_id)` - Abrir mesa
- `sync_node_status_from_order` - Trigger automático

---

#### I.3 Zones (Service Areas)

**Funcionalidad:** Agrupar mesas por zona.

**Database:**
- `zones` table
  - `id`, `store_id`, `name` (Salon, Bar, Terraza, Takeaway, Pickup)
  - `service_mode` (dine_in, takeaway, delivery)

**Use cases:**
- Filtrar órdenes por zona en OrderBoard
- Asignar staff a zonas específicas
- Menú diferente por zona (bar vs restaurante)

**Ejemplo:**
- Zona "Bar" → Solo bebidas
- Zona "Salon" → Menú completo
- Zona "Pickup" → Órdenes para llevar

---

### J. Loyalty & Rewards

**Página:** `Loyalty.tsx` (admin), `client/LoyaltyPage.tsx` (customer)

#### J.1 Configuración de Programa de Lealtad

**Database:**
- `loyalty_configs` table
  - `id`, `store_id`, `points_per_100_pesos`
  - `enabled` - Activo/inactivo
  - `created_at`, `updated_at`

**Funcionalidades:**
- Activar/desactivar programa
- Configurar tasa de puntos:
  - Ejemplo: 5 puntos por cada $100 gastados

**Flow:**
```
1. Owner va a Loyalty.tsx
2. Toggle "Enable Loyalty Program"
3. Set points_per_100_pesos: 5
4. Save
5. UPDATE loyalty_configs
```

---

#### J.2 Product Multipliers

**Funcionalidad:** Productos específicos dan puntos extra.

**Database:**
- `loyalty_product_rules` table
  - `id`, `store_id`, `product_id`, `points_multiplier`
  - Ejemplo: Café del día → multiplier = 2

**Flow:**
```
1. Owner selecciona producto "Café del día"
2. Set multiplier: 2x
3. INSERT loyalty_product_rules
4. Al comprar Café del día de $100:
   - Base: 5 puntos
   - Con multiplier: 5 * 2 = 10 puntos
```

---

#### J.3 Rewards Catalog

**Funcionalidad:** Crear recompensas canjeables.

**Database:**
- `loyalty_rewards` table
  - `id`, `store_id`, `name`, `description`
  - `points_required` - Puntos necesarios
  - `product_id` - Producto que recibe (nullable)
  - `discount_amount` - Descuento en pesos (nullable)
  - `available` - Activo/inactivo

**Tipos de rewards:**
1. **Product reward** - Canjear por producto gratis
   - Ejemplo: "Café gratis - 100 puntos"
2. **Discount reward** - Descuento en $
   - Ejemplo: "$50 de descuento - 80 puntos"
3. **Percentage reward** - Descuento en %
   - Ejemplo: "10% off - 150 puntos"

**Flow:**
```
1. Owner crea reward:
   - Name: "Café Latte gratis"
   - Points required: 100
   - Product: Café Latte
2. INSERT loyalty_rewards
3. Cliente ve reward en LoyaltyPage
4. Cliente redime:
   - Click "Redeem"
   - RPC redeem_points(reward_id, client_id)
   - Deduce 100 puntos
   - Crea orden con precio $0
```

**RPCs:**
- `redeem_points(client_id, reward_id)` - Canjear puntos

---

#### J.4 Earn Points Flow

**Trigger:** `process_loyalty_points`

**Flow:**
```
1. Orden completada (status → delivered)
2. Trigger process_loyalty_points ejecuta:
   - Verifica si loyalty enabled
   - Calcula puntos base:
     points = (order.total_amount / 100) * loyalty_config.points_per_100_pesos
   - Verifica product multipliers:
     - Por cada order_item:
       - Busca en loyalty_product_rules
       - Si existe multiplier:
         item_points = base_points * multiplier
   - Total points = sum(item_points)
   - INSERT loyalty_transactions (type='earn', points, order_id)
   - UPDATE clients.loyalty_points += points
3. Cliente ve puntos en LoyaltyPage
```

---

### K. Analytics & Reports

**Páginas:**
- `Dashboard.tsx` - Main analytics
- `Finance.tsx` - Financial analytics
- `AuditLog.tsx` - Audit trail

#### K.1 Dashboard Financiero

**Métricas mostradas:**

| Métrica | Cálculo | Período |
|---------|---------|---------|
| **Revenue** | SUM(orders.total_amount WHERE status='delivered') | Today/Week/Month |
| **Order Count** | COUNT(orders WHERE status='delivered') | Today/Week/Month |
| **Avg Ticket** | Revenue / Order Count | Today/Week/Month |
| **By Payment Method** | GROUP BY payment_method | Today/Week/Month |
| **Top Products** | ORDER BY SUM(order_items.quantity) DESC LIMIT 10 | Today/Week/Month |
| **Cash Flow** | cash_sales + card_sales + wallet_sales + mp_sales | Today |
| **Expenses** | SUM(fixed_expenses + variable_expenses) | Today/Month |
| **Net Profit** | Revenue - Expenses | Today/Month |

**RPCs:**
- `get_financial_metrics(store_id, start_date, end_date)`
- `get_financial_chart_data(store_id, period)`
- `get_top_products(store_id, limit)`

---

#### K.2 Reportes de Ventas

**Funcionalidades:**
- Ver ventas por período (día, semana, mes, custom)
- Filtrar por:
  - Payment method
  - Service area (bar, salon, etc.)
  - Staff member
  - Product category
- Exportar a CSV/PDF
- Gráficos:
  - Ventas por hora (peak hours)
  - Ventas por día de semana
  - Trend de revenue (últimos 30 días)

**Database:**
- Query directo a `orders` con agregaciones

---

#### K.3 Stock Reports

**Funcionalidades:**
- Items con stock bajo (< reorder point)
- Movimientos de stock por período
- Consumption rate (velocidad de consumo)
- Projected reorder date (IA predice cuándo pedir)
- Cost analysis (COGS)

**Ejemplo:**
```
Café molido:
- Stock actual: 8kg
- Reorder point: 5kg
- Avg consumption: 2kg/day
- Days until reorder: 1.5 days
- Projected reorder date: Tomorrow
```

---

#### K.4 Cash Reconciliation

**Funcionalidad:** Comparar expected vs actual cash.

**Report muestra:**
- Initial cash
- Cash sales
- Withdrawals/deposits
- Expected cash (calculated)
- Actual cash (counted)
- Discrepancy
- Discrepancy %

**Alerts:**
- Si discrepancy > 5% → Alerta amarilla
- Si discrepancy > 10% → Alerta roja

---

### L. Offline Mode (PWA)

**Funcionalidad:** App funciona sin internet.

**Tecnologías:**
- Service Worker (Vite PWA)
- IndexedDB (Dexie.js)
- Background Sync

**Database local:**
- `orders` (pending sync)
- `products` (cached)
- `clients` (cached)
- `inventory_items` (cached)
- `sync_queue` (operations pendientes)

**Flow offline:**
```
1. Usuario pierde conexión
2. App detecta offline
3. Muestra banner "Modo Offline"
4. Usuario crea orden:
   - Orden se guarda en IndexedDB
   - Estado: pending_sync
   - UUID pre-generado
5. Cuando vuelve conexión:
   - Service Worker detecta online
   - Background Sync se activa
   - Envía órdenes de IndexedDB a Supabase
   - Supabase inserta con UUID pre-generado (idempotency)
   - IndexedDB marca como synced
   - Muestra toast "3 órdenes sincronizadas"
```

**Sync Conflicts:**
- Si orden ya existe en server (por UUID):
  - Compara timestamps
  - Server wins (descarta local)
  - O merge (si campos diferentes)

**Contexto:**
- `OfflineContext.tsx` (1000+ líneas - ver auditoría)
- Maneja toda la lógica de sync

---

### M. Notifications & Emails

**Funcionalidades:**
- Email transaccional
- Push notifications (futuro)
- SMS (futuro)

#### M.1 Email Logs

**Database:**
- `email_logs` table (FALTA store_id según auditoría)
  - `id`, `recipient`, `subject`, `template`
  - `status` (pending, sent, failed)
  - `sent_at`, `error_message`
  - `idempotency_key` (evitar duplicados)

**Emails enviados:**
- Bienvenida (nuevo cliente)
- Invitación (nuevo staff member)
- Orden confirmada
- Orden lista para pickup
- Wallet topup confirmado
- Day closure summary (owner)

**Edge Functions:**
- `send-email` - Enviar email individual
- `process-email-queue` - Procesar cola de emails

**Flow:**
```
1. Evento dispara email (ej: orden confirmada)
2. INSERT email_logs (status='pending')
3. Edge Function process-email-queue (ejecuta cada 5min):
   - SELECT * FROM email_logs WHERE status='pending'
   - Por cada email:
     - Envía via SMTP (Resend, SendGrid, etc.)
     - UPDATE status='sent' o 'failed'
4. Cliente recibe email
```

---

## 4. FLOWS COMPLETOS

### FLOW 1: Crear Orden (Cliente Self-Service)

**Actors:** Cliente (customer)

**Steps:**

```
┌─────────────────────────────────────────────────────┐
│ 1. ESCANEO DE QR                                    │
└─────────────────────────────────────────────────────┘
Cliente escanea QR en mesa
  ↓
QR Resolver (/qr/:code)
  ↓
Busca en qr_codes table
  ↓
Extrae: type='table', reference_id=mesa_5
  ↓
Redirige a MenuPage?table=mesa_5

┌─────────────────────────────────────────────────────┐
│ 2. NAVEGACIÓN DE MENÚ                               │
└─────────────────────────────────────────────────────┘
MenuPage.tsx carga:
  - GET /products WHERE store_id={store} AND available=true
  - Filtra por categoría
  - Renderiza catálogo

Cliente navega, selecciona "Café Latte"
  ↓
Modal de producto:
  - Selecciona variante: Grande (+$50)
  - Selecciona addons: Shot extra (+$30)
  - Quantity: 1
  - Click "Add to Cart"
  ↓
Context actualiza cart state (local)

┌─────────────────────────────────────────────────────┐
│ 3. CHECKOUT                                          │
└─────────────────────────────────────────────────────┘
Cliente click "Checkout"
  ↓
CartPage.tsx muestra resumen:
  - Café Latte Grande + Shot extra: $180
  - Total: $180
  ↓
CheckoutPage.tsx
  ↓
Selecciona método de pago: "Wallet"
  ↓
Frontend verifica balance:
  GET /clients?id={client_id}
  clients.wallet_balance = $500 (suficiente)

┌─────────────────────────────────────────────────────┐
│ 4. PAGO CON WALLET                                   │
└─────────────────────────────────────────────────────┘
Cliente confirma pago
  ↓
Frontend llama: pay_with_wallet RPC
  Params:
    - client_id: {uuid}
    - amount: 180
    - order_id: null (se crea después)
  ↓
RPC pay_with_wallet:
  1. Verifica balance >= 180 ✅
  2. new_balance = 500 - 180 = 320
  3. INSERT wallet_ledger:
     - amount: -180
     - balance_after: 320
     - entry_type: 'payment'
  4. Trigger update_wallet_balance_from_ledger:
     - UPDATE clients SET wallet_balance = 320
  5. RETURN {success: true, new_balance: 320}

┌─────────────────────────────────────────────────────┐
│ 5. CREACIÓN DE ORDEN                                 │
└─────────────────────────────────────────────────────┘
Frontend recibe success de payment
  ↓
Llama: create_order_with_stock_deduction RPC
  Params:
    - client_id
    - items: [{product_id, variant_id, addons, quantity}]
    - total_amount: 180
    - payment_method: 'wallet'
    - venue_node_id: mesa_5
  ↓
RPC create_order_with_stock_deduction:
  1. INSERT orders:
     - client_id, store_id, total_amount: 180
     - status: 'paid' (ya pagó con wallet)
     - payment_method: 'wallet'
     - venue_node_id: mesa_5
  2. INSERT order_items:
     - order_id, product_id, variant_id
     - addons: [shot_extra]
     - quantity: 1, unit_price: 180
  3. Si config.deduct_stock_on_create = false:
     - NO deduce stock (se hará en delivery)
  4. RETURN order_id

┌─────────────────────────────────────────────────────┐
│ 6. TRIGGERS POST-CREACIÓN                           │
└─────────────────────────────────────────────────────┘
Trigger: sync_node_status_from_order
  - UPDATE venue_nodes
  - SET status='occupied', current_order_id={order_id}
  - WHERE id=mesa_5

Trigger: create_order_event
  - INSERT order_events (type='created')

┌─────────────────────────────────────────────────────┐
│ 7. TRACKING EN TIEMPO REAL                          │
└─────────────────────────────────────────────────────┘
Frontend redirige a TrackingPage?order={order_id}
  ↓
TrackingPage.tsx:
  - Supabase Realtime subscription:
    supabase
      .channel('order_status')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${orderId}`
      }, (payload) => {
        setOrderStatus(payload.new.status)
      })
  ↓
Cliente ve estado actual: "paid" → "preparing"

┌─────────────────────────────────────────────────────┐
│ 8. PREPARACIÓN (STAFF)                              │
└─────────────────────────────────────────────────────┘
Staff abre OrderBoard.tsx
  ↓
Nueva orden aparece en columna "Paid"
  ↓
Barista drag & drop orden a "Preparing"
  ↓
UPDATE orders SET status='preparing'
  ↓
Realtime notifica a cliente → TrackingPage actualiza

Barista termina de preparar
  ↓
Drag & drop a "Ready"
  ↓
UPDATE orders SET status='ready'
  ↓
Push notification a cliente: "Tu orden está lista!"

┌─────────────────────────────────────────────────────┐
│ 9. ENTREGA                                           │
└─────────────────────────────────────────────────────┘
Staff entrega orden a cliente
  ↓
Click "Mark as Delivered" en OrderBoard
  ↓
UPDATE orders SET status='delivered'
  ↓
Trigger: finalize_order_stock
  1. Busca recipe de "Café Latte Grande":
     - Café molido: 30g
     - Leche: 350ml
     - Vaso grande: 1 unidad
  2. Busca recipe de addon "Shot extra":
     - Café molido: +10g
  3. Total deduction:
     - Café molido: 40g
     - Leche: 350ml
     - Vaso grande: 1 unidad
  4. Llama decrease_stock_atomic_v20:
     - Consume de open_packages (FIFO)
     - Si no hay open package → Abre nuevo
     - UPDATE inventory_location_stock
     - INSERT stock_movements

Trigger: process_loyalty_points
  1. Calcula: $180 / 100 * 5 = 9 puntos
  2. INSERT loyalty_transactions (type='earn', points=9)
  3. UPDATE clients.loyalty_points += 9

Trigger: sync_node_status_from_order
  - UPDATE venue_nodes
  - SET status='available', current_order_id=NULL

┌─────────────────────────────────────────────────────┐
│ 10. CONFIRMACIÓN FINAL                               │
└─────────────────────────────────────────────────────┘
Cliente ve en TrackingPage: "Delivered ✅"
  ↓
Muestra:
  - Total: $180
  - Payment method: Wallet
  - Loyalty points earned: +9
  - New wallet balance: $320
  ↓
Click "Done" → Redirige a MenuPage (nueva orden)
```

---

### FLOW 2: Pagar con MercadoPago

**Actors:** Cliente (customer)

**Steps:**

```
┌─────────────────────────────────────────────────────┐
│ 1-3. IGUAL QUE FLOW 1 (Escaneo, Menú, Checkout)    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ 4. SELECCIÓN DE MERCADOPAGO                         │
└─────────────────────────────────────────────────────┘
CheckoutPage.tsx → Cliente selecciona "MercadoPago QR"
  ↓
Frontend llama Edge Function: create-mp-preference
  Params:
    - items: [{title, quantity, unit_price}]
    - total_amount: 180
    - external_reference: temp_order_id
  ↓
Edge Function create-mp-preference:
  1. Usa MercadoPago SDK
  2. Crea preference:
     const preference = await mp.preferences.create({
       items: [{
         title: "Café Latte Grande",
         quantity: 1,
         unit_price: 180
       }],
       external_reference: order_id,
       notification_url: "https://payper.app/api/mp-webhook"
     })
  3. RETURN preference_id

┌─────────────────────────────────────────────────────┐
│ 5. GENERACIÓN DE QR                                  │
└─────────────────────────────────────────────────────┘
Frontend recibe preference_id
  ↓
Genera QR code con:
  https://www.mercadopago.com.ar/checkout/v1/payment/{preference_id}
  ↓
Muestra QR en pantalla
  ↓
Mensaje: "Escanea este QR en tu app de MercadoPago"

┌─────────────────────────────────────────────────────┐
│ 6. PAGO EN MERCADOPAGO APP                          │
└─────────────────────────────────────────────────────┘
Cliente abre app MercadoPago
  ↓
Escanea QR
  ↓
App muestra detalle:
  - Café Latte Grande
  - Total: $180
  - Merchant: Café Example
  ↓
Cliente confirma pago con huella/PIN
  ↓
MercadoPago procesa pago
  ↓
MercadoPago envía webhook a:
  POST https://payper.app/api/mp-webhook

┌─────────────────────────────────────────────────────┐
│ 7. PROCESAMIENTO DE WEBHOOK                         │
└─────────────────────────────────────────────────────┘
Edge Function mp-webhook recibe:
  {
    type: "payment",
    data: { id: "payment_id_12345" }
  }
  ↓
Webhook:
  1. Verifica signature (security)
  2. GET payment info desde MP API:
     GET https://api.mercadopago.com/v1/payments/{id}
  3. Extrae:
     - status: "approved"
     - external_reference: order_id
     - transaction_amount: 180
  4. Busca orden:
     SELECT * FROM orders WHERE id = external_reference
  5. UPDATE orders:
     - payment_status = 'approved'
     - payment_id = 'payment_id_12345'
     - status = 'paid'
  6. Si orden aún no existe (race condition):
     - Guarda payment en tabla temporal
     - Frontend crea orden y matchea después

┌─────────────────────────────────────────────────────┐
│ 8. NOTIFICACIÓN AL FRONTEND                         │
└─────────────────────────────────────────────────────┘
Frontend tiene Realtime subscription:
  supabase
    .channel('order_updates')
    .on('UPDATE', (payload) => {
      if (payload.new.payment_status === 'approved') {
        navigate('/tracking')
      }
    })
  ↓
Detecta cambio de payment_status
  ↓
Redirige automáticamente a TrackingPage
  ↓
Muestra: "Pago confirmado ✅"

┌─────────────────────────────────────────────────────┐
│ 9-10. IGUAL QUE FLOW 1 (Preparación, Entrega)       │
└─────────────────────────────────────────────────────┘
```

---

### FLOW 3: Transfer Stock

**Actors:** Admin/Staff (con permiso inventory)

**Steps:**

```
┌─────────────────────────────────────────────────────┐
│ 1. INICIAR TRANSFER                                  │
└─────────────────────────────────────────────────────┘
Staff abre InventoryManagement.tsx
  ↓
Selecciona item: "Café molido"
  ↓
Current stock:
  - Warehouse: 50kg
  - Bar: 2kg
  - Kitchen: 0kg
  ↓
Click "Transfer Stock"

┌─────────────────────────────────────────────────────┐
│ 2. CONFIGURAR TRANSFER                               │
└─────────────────────────────────────────────────────┘
Modal abre:
  ↓
Selecciona:
  - From location: Warehouse
  - To location: Bar
  - Quantity: 5kg
  - Notes: "Reponer barra para turno tarde"
  ↓
Click "Transfer"

┌─────────────────────────────────────────────────────┐
│ 3. EJECUCIÓN DE RPC                                  │
└─────────────────────────────────────────────────────┘
Frontend llama: transfer_stock RPC
  Params:
    - inventory_item_id: {uuid-cafe}
    - from_location_id: warehouse
    - to_location_id: bar
    - quantity: 5
    - performed_by: auth.uid()
    - notes: "Reponer barra"
  ↓
RPC transfer_stock:
  1. Valida store_id (security):
     - Verifica que user.store_id = item.store_id
  2. Valida stock suficiente:
     SELECT quantity FROM inventory_location_stock
     WHERE item_id={cafe} AND location_id=warehouse
     → quantity = 50kg ✅ (>= 5kg)
  3. Deduce de origin:
     UPDATE inventory_location_stock
     SET quantity = quantity - 5
     WHERE item_id={cafe} AND location_id=warehouse
  4. Agrega a destination:
     UPDATE inventory_location_stock
     SET quantity = quantity + 5
     WHERE item_id={cafe} AND location_id=bar
  5. Registra transfer:
     INSERT stock_transfers:
       - from_location, to_location, quantity
       - performed_by, notes
  6. Audit trail:
     INSERT stock_movements:
       - (warehouse, -5kg, type='transfer_out')
       - (bar, +5kg, type='transfer_in')
  7. RETURN {success: true}

┌─────────────────────────────────────────────────────┐
│ 4. ACTUALIZACIÓN UI                                  │
└─────────────────────────────────────────────────────┘
Frontend recibe success
  ↓
Refetch inventory stock:
  GET inventory_location_stock WHERE item_id={cafe}
  ↓
UI actualiza:
  - Warehouse: 50kg → 45kg
  - Bar: 2kg → 7kg
  ↓
Toast: "✅ Transferidos 5kg de Warehouse a Bar"
```

---

### FLOW 4: Cerrar Caja (Cash Session)

**Actors:** Admin/Cashier

**Steps:**

```
┌─────────────────────────────────────────────────────┐
│ 1. ABRIR SESIÓN (INICIO DE TURNO)                   │
└─────────────────────────────────────────────────────┘
Cashier abre Finance.tsx
  ↓
Click "Open Cash Session"
  ↓
Modal:
  - Initial cash: $500
  - Location: Caja Principal
  - Notes: "Turno mañana"
  ↓
Click "Open"
  ↓
RPC open_cash_session:
  INSERT cash_sessions:
    - opened_by: auth.uid()
    - opened_at: NOW()
    - initial_cash: 500
    - status: 'open'
  ↓
Session ID: session_123

┌─────────────────────────────────────────────────────┐
│ 2. OPERACIONES DURANTE EL TURNO                     │
└─────────────────────────────────────────────────────┘
Durante el turno, se procesan órdenes:

Orden 1: $150 (cash) → Trigger update_cash_on_payment:
  UPDATE cash_sessions
  SET cash_sales = cash_sales + 150
  WHERE id=session_123

Orden 2: $200 (card) → Trigger:
  UPDATE cash_sessions
  SET card_sales = card_sales + 200

Orden 3: $100 (wallet) → Trigger:
  UPDATE cash_sessions
  SET wallet_sales = wallet_sales + 100

Retiro de efectivo: $200
  ↓
Finance.tsx → "Register Withdrawal"
  ↓
RPC register_cash_withdrawal:
  INSERT cash_movements:
    - session_id: session_123
    - amount: 200
    - movement_type: 'withdrawal'
    - reason: "Compra de azúcar"
  ↓
  UPDATE cash_sessions
  SET cash_withdrawals = cash_withdrawals + 200

Depósito: $1000 (cambio)
  ↓
RPC register_cash_deposit:
  INSERT cash_movements
  UPDATE cash_sessions SET cash_deposits += 1000

┌─────────────────────────────────────────────────────┐
│ 3. CIERRE DE SESIÓN (FIN DE TURNO)                  │
└─────────────────────────────────────────────────────┘
Cashier click "Close Cash Session"
  ↓
Sistema calcula expected_cash:
  RPC get_session_expected_cash(session_123):
    expected = initial_cash
             + cash_sales
             + cash_deposits
             - cash_withdrawals
             - cash_adjustments

    expected = 500 + 3500 + 1000 - 200 - 0
    expected = $4800
  ↓
Modal muestra:
  - Initial: $500
  - Sales (cash): $3,500
  - Deposits: $1,000
  - Withdrawals: $200
  - Expected: $4,800
  ↓
Prompt: "Count physical cash and enter amount"

┌─────────────────────────────────────────────────────┐
│ 4. CONTEO FÍSICO                                     │
└─────────────────────────────────────────────────────┘
Cashier cuenta efectivo:
  - Billetes de $1000: 4 → $4000
  - Billetes de $500: 1 → $500
  - Billetes de $100: 2 → $200
  - Monedas: $80
  - Total: $4780
  ↓
Ingresa actual_cash: 4780
  ↓
Sistema calcula discrepancy:
  discrepancy = actual - expected
  discrepancy = 4780 - 4800
  discrepancy = -$20 (falta)
  ↓
Prompt: "Discrepancy: -$20. Add notes?"
  ↓
Cashier ingresa: "Cliente se fue sin pagar $20"

┌─────────────────────────────────────────────────────┐
│ 5. FINALIZAR CIERRE                                  │
└─────────────────────────────────────────────────────┘
Click "Close Session"
  ↓
RPC close_cash_session:
  UPDATE cash_sessions:
    - closed_at = NOW()
    - closed_by = auth.uid()
    - actual_cash = 4780
    - discrepancy = -20
    - status = 'closed'
    - notes = "Cliente se fue sin pagar $20"
  ↓
  INSERT cash_closures (backup inmutable):
    - Copia de cash_sessions
  ↓
  Si discrepancy > threshold ($50):
    - INSERT alert
    - Notificar owner

┌─────────────────────────────────────────────────────┐
│ 6. REPORTE POST-CIERRE                               │
└─────────────────────────────────────────────────────┘
Sistema genera reporte:

  CASH SESSION CLOSURE
  ────────────────────────────────────
  Session ID: session_123
  Opened: 2026-02-13 08:00
  Closed: 2026-02-13 16:00
  Duration: 8 hours

  SALES BREAKDOWN:
  - Cash sales: $3,500
  - Card sales: $2,200
  - Wallet sales: $800
  - MercadoPago: $1,500
  - Total sales: $8,000

  CASH FLOW:
  - Initial cash: $500
  - Cash sales: +$3,500
  - Deposits: +$1,000
  - Withdrawals: -$200
  - Expected cash: $4,800

  ARQUEO:
  - Actual cash: $4,780
  - Discrepancy: -$20 (0.4%)
  - Status: ⚠️ Warning
  - Notes: Cliente se fue sin pagar $20
  ────────────────────────────────────
  ↓
PDF generado, enviado por email a owner
```

---

### FLOW 5: Redimir Reward (Loyalty)

**Actors:** Cliente (customer)

**Steps:**

```
┌─────────────────────────────────────────────────────┐
│ 1. VER REWARDS DISPONIBLES                          │
└─────────────────────────────────────────────────────┘
Cliente abre client/LoyaltyPage.tsx
  ↓
Frontend carga:
  GET /clients WHERE id={client_id}
    → loyalty_points: 150
  GET /loyalty_rewards WHERE store_id={store} AND available=true
  ↓
UI muestra:
  - Your points: 150
  - Available rewards:
    [ ] Café gratis - 100 pts ✅ (puede redimir)
    [ ] Descuento $50 - 80 pts ✅
    [ ] Croissant gratis - 200 pts ❌ (insuficientes)

┌─────────────────────────────────────────────────────┐
│ 2. SELECCIONAR REWARD                                │
└─────────────────────────────────────────────────────┘
Cliente click "Redeem" en "Café gratis - 100 pts"
  ↓
Modal confirmación:
  - Reward: Café gratis (Café Latte)
  - Points required: 100
  - Your points: 150
  - After redemption: 50 pts
  - Confirm?
  ↓
Cliente click "Confirm"

┌─────────────────────────────────────────────────────┐
│ 3. EJECUCIÓN DE REDENCIÓN                           │
└─────────────────────────────────────────────────────┘
Frontend llama: redeem_points RPC
  Params:
    - client_id: {uuid}
    - reward_id: {uuid-cafe-gratis}
  ↓
RPC redeem_points:
  1. Valida puntos suficientes:
     SELECT loyalty_points FROM clients WHERE id={client}
     → 150 >= 100 ✅
  2. Busca reward:
     SELECT * FROM loyalty_rewards WHERE id={reward_id}
     → points_required: 100, product_id: {cafe-latte}
  3. Deduce puntos:
     UPDATE clients
     SET loyalty_points = loyalty_points - 100
     WHERE id={client}
  4. Registra transacción:
     INSERT loyalty_transactions:
       - client_id, order_id: NULL (aún no hay orden)
       - points: -100
       - transaction_type: 'redeem'
       - reward_id
  5. Crea orden con precio $0:
     INSERT orders:
       - client_id, total_amount: 0
       - status: 'paid' (gratis, ya "pagó" con puntos)
       - payment_method: 'loyalty'
     INSERT order_items:
       - product_id: {cafe-latte}
       - quantity: 1
       - unit_price: 0 (gratis)
  6. UPDATE loyalty_transactions
     SET order_id = {nuevo_order_id}
  7. RETURN {success, order_id, new_points: 50}

┌─────────────────────────────────────────────────────┐
│ 4. CONFIRMACIÓN Y TRACKING                          │
└─────────────────────────────────────────────────────┘
Frontend recibe success
  ↓
UI actualiza:
  - Your points: 150 → 50
  ↓
Toast: "✅ Reward redeemed! Your free coffee is ready"
  ↓
Redirige a TrackingPage con order_id
  ↓
Cliente ve orden en estado "paid" → "preparing"
  ↓
Staff ve orden en OrderBoard (con badge "Loyalty Reward")
  ↓
Preparan café gratis
  ↓
Cliente recibe café
  ↓
Stock deducted normalmente (aunque fue gratis)
```

---

## 5. DATABASE SCHEMA OVERVIEW

### Tablas Principales (38 total)

#### Core System
- `stores` - Tenants/stores
- `profiles` - Users (staff + clients linkados a auth.users)
- `cafe_roles` - Custom roles por store
- `cafe_role_permissions` - Permissions granulares

#### Orders
- `orders` - Órdenes
- `order_items` - Line items de órdenes
- `order_events` - Audit trail de eventos (FALTA RLS según auditoría)
- `venue_nodes` - Mesas, barras, zonas
- `zones` - Service areas

#### Inventory
- `inventory_items` - Items de inventario (39 cols - BLOATED)
- `products` - Productos vendibles
- `product_recipes` - Recipes (producto → inventory items)
- `product_variants` - Variantes de productos
- `product_addons` - Addons/extras
- `inventory_location_stock` - Stock por location
- `item_stock_levels` - Niveles de stock
- `storage_locations` - Ubicaciones físicas (warehouse, bar)
- `stock_transfers` - Historial de transfers
- `stock_movements` - Audit trail de movimientos (FALTA store_id)
- `inventory_audit_logs` - Audit logs
- `open_packages` - Paquetes abiertos (FIFO)

#### Payments
- `wallets` - DEPRECATED (usar clients.wallet_balance)
- `wallet_ledger` - Ledger de wallet (audit trail)
- `wallet_topups` - Recargas de wallet
- `payment_transactions` - Transacciones de pago (FALTA audit columns)

#### Cash
- `cash_sessions` - Sesiones de caja
- `cash_closures` - Cierres de caja
- `cash_movements` - Movimientos de efectivo (FALTA store_id)
- `dispatch_sessions` - Sesiones de dispatch
- `day_closures` - Cierres de día
- `fixed_expenses` - Gastos fijos

#### Loyalty
- `loyalty_configs` - Configuración de programa
- `loyalty_rewards` - Catálogo de rewards
- `loyalty_product_rules` - Multipliers por producto
- `loyalty_transactions` - Transacciones de puntos

#### QR & Sessions
- `qr_codes` - QR codes por mesa/zona
- `qr_scan_logs` - Logs de escaneos
- `client_sessions` - Sesiones de cliente

#### Clients
- `clients` - Clientes (customers)

#### Audit
- `email_logs` - Logs de emails
- `retry_metrics` - Métricas de reintentos
- `stock_deduction_errors` - Errores de deducción

---

### Relaciones Clave (Foreign Keys)

```
stores (1) ──────┬────── (N) products
                 ├────── (N) inventory_items
                 ├────── (N) orders
                 ├────── (N) clients
                 ├────── (N) profiles
                 └────── (N) venues_nodes

clients (1) ─────┬────── (N) orders
                 ├────── (1) wallet_ledger
                 └────── (1) loyalty_transactions

orders (1) ──────┬────── (N) order_items
                 ├────── (N) order_events
                 ├────── (1) payment_transactions
                 └────── (1) loyalty_transactions

products (1) ────┬────── (N) order_items
                 ├────── (N) product_variants
                 ├────── (N) product_addons
                 └────── (N) product_recipes

inventory_items (1) ───┬──── (N) product_recipes
                       ├──── (N) inventory_location_stock
                       ├──── (N) stock_transfers
                       ├──── (N) stock_movements
                       └──── (N) open_packages

storage_locations (1) ─┬──── (N) inventory_location_stock
                       └──── (N) stock_transfers

profiles (1) ──────────┬──── (N) cafe_roles
                       └──── (N) cash_sessions

venue_nodes (1) ───────┬──── (1) orders (current_order_id)
                       └──── (1) qr_codes
```

---

### Triggers Principales (73 total)

**Orders table (25 triggers - EXCESIVO según auditoría):**

Wallet-related (5):
- `trg_wallet_credit_on_payment`
- `trg_wallet_debit_on_cancel`
- `trg_wallet_refund_on_edit`
- `trg_wallet_partial_refund`
- `trg_wallet_hold_on_pending`

Stock-related (6):
- `trg_deduct_stock_on_create` (si config enabled)
- `trg_rollback_stock_on_cancel`
- `trg_compensate_stock_on_edit`
- `trg_adjust_stock_on_variant_change`
- `trg_validate_stock_before_confirm`
- `finalize_order_stock` (on delivered)

Cash-related (4):
- `trg_update_cash_on_payment`
- `trg_reverse_cash_on_cancel`
- `trg_adjust_cash_on_edit`
- `trg_sync_cash_session`

Events/Audit (3):
- `trg_create_order_event`
- `trg_log_status_change`
- `trg_update_modified_timestamp`

Loyalty (3):
- `process_loyalty_points` (on delivered)
- `trg_reverse_loyalty_on_cancel`
- `trg_adjust_loyalty_on_edit`

Analytics/Sync (4):
- `sync_node_status_from_order`
- `trg_update_order_metrics`
- `trg_notify_kitchen`
- `trg_update_daily_stats`

**Otras tablas:**
- `wallet_ledger` → `update_wallet_balance_from_ledger`
- `inventory_items` → Sync total stock
- `stock_movements` → Update location stock

---

### Views Importantes

(Verificar cuáles existen con query)

Posibles views:
- `monitoring_wallet_integrity` - Detecta discrepancias wallet
- `order_summary` - Órdenes con aggregates
- `inventory_status` - Stock levels con alertas

---

## 6. API/RPC REFERENCE

### Total de RPCs: 174 (EXCESIVO según auditoría)

**Categorías:**

#### Wallet (18 funciones)
- `pay_with_wallet(client_id, amount, order_id)` - Pagar con wallet
- `complete_wallet_payment(order_id)` - Completar pago wallet
- `credit_wallet(transaction_id, client_id)` - Acreditar wallet
- `admin_add_balance_v2(client_id, amount, description)` - Admin add balance
- `p2p_wallet_transfer(from_client, to_client, amount)` - Transfer P2P
- `wallet_partial_refund_on_edit(order_id, amount)` - Refund parcial
- `wallet_additional_charge_on_edit(order_id, amount)` - Cargo adicional

#### Stock (24 funciones)
- `decrease_stock_atomic_v20(...)` - Deducir stock (versión actual)
- `transfer_stock(from_loc, to_loc, item_id, qty)` - Transfer
- `consume_from_smart_packages(...)` - Consumir de packages
- `sync_inventory_item_total_stock(item_id)` - Sync total stock
- `finalize_order_stock(order_id)` - Finalizar stock en delivery

#### Orders (31 funciones)
- `create_order_with_stock_deduction(...)` - Crear orden
- `confirm_order_delivery(order_id)` - Confirmar delivery
- `validate_order_prices(order_id)` - Validar precios
- `sync_order_status(order_id)` - Sync estado
- `open_table(table_id, client_id)` - Abrir mesa
- `sync_node_status_from_order(order_id)` - Sync mesa

#### Cash (12 funciones)
- `open_cash_session(initial_cash, location_id)` - Abrir caja
- `close_cash_session(session_id, actual_cash)` - Cerrar caja
- `get_session_cash_summary(session_id)` - Resumen sesión
- `get_session_expected_cash(session_id)` - Efectivo esperado
- `register_cash_withdrawal(session_id, amount, reason)` - Retiro
- `register_cash_adjustment(session_id, amount, reason)` - Ajuste
- `register_fixed_expense(name, amount, frequency)` - Gasto fijo

#### Loyalty (15 funciones)
- `redeem_points(client_id, reward_id)` - Redimir puntos
- `process_loyalty_points(order_id)` - Procesar puntos
- `admin_add_points(client_id, points, reason)` - Admin add puntos

#### Analytics (22 funciones)
- `get_financial_metrics(store_id, start, end)` - Métricas financieras
- `get_financial_chart_data(store_id, period)` - Data para charts
- `get_top_products(store_id, limit)` - Top productos
- `get_location_stock(location_id)` - Stock por location

#### Products (funciones en category Orders/Stock)
- `create_recipe_product(product_id, recipes)` - Crear producto con recipe

#### Admin (9 funciones)
- `admin_add_balance_v2(...)` - Ver Wallet
- `admin_add_points(...)` - Ver Loyalty
- `admin_add_client_balance(...)` - Add balance

#### Auth/Validation (14 funciones)
- `validate_order_prices(...)` - Ver Orders
- `validate_order_delivery(...)` - Validar delivery
- `get_user_store_id()` - Obtener store_id del user

---

### Ejemplo de RPC Signature

```sql
-- pay_with_wallet
CREATE FUNCTION pay_with_wallet(
  p_client_id UUID,
  p_amount NUMERIC,
  p_order_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_balance NUMERIC;
  v_new_balance NUMERIC;
  v_store_id UUID;
  v_user_store_id UUID;
  v_entry_id UUID;
BEGIN
  -- Validations
  -- Deduct balance
  -- Insert ledger entry
  -- Return result
  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'ledger_entry_id', v_entry_id
  );
END;
$$;
```

**Security:**
- `SECURITY DEFINER` - Ejecuta con permisos de owner
- `SET search_path = public, pg_temp` - Previene injection
- Store_id validation - Evita cross-tenant access

---

## 7. FRONTEND ARCHITECTURE

### Estructura de Carpetas

```
src/
├── components/          # Componentes reutilizables
│   ├── ui/             # Radix UI components
│   ├── OrderCard.tsx
│   ├── ProductCard.tsx
│   ├── CartItem.tsx
│   └── ...
├── pages/              # Páginas principales (routing)
│   ├── Dashboard.tsx
│   ├── Orders.tsx
│   ├── Products.tsx
│   ├── Clients.tsx
│   ├── Finance.tsx
│   ├── Settings.tsx
│   └── client/         # Customer-facing pages
│       ├── MenuPage.tsx
│       ├── CartPage.tsx
│       ├── CheckoutPage.tsx
│       ├── TrackingPage.tsx
│       ├── WalletPage.tsx
│       └── LoyaltyPage.tsx
├── hooks/              # Custom React hooks
│   ├── useSupabase.ts
│   ├── useAuth.ts
│   ├── useCart.ts
│   ├── useWallet.ts
│   └── useRealtime.ts
├── contexts/           # React contexts
│   ├── AuthContext.tsx
│   ├── CartContext.tsx
│   ├── StoreContext.tsx
│   └── OfflineContext.tsx  # 1000+ líneas (BLOATED)
├── lib/                # Configuración y utils
│   ├── supabase.ts     # Supabase client
│   ├── mercadopago.ts  # MP SDK
│   ├── pagination.ts   # Pagination utils
│   └── utils.ts
├── types/              # TypeScript types
│   ├── database.ts     # ⚠️ FALTA generar desde DB
│   ├── supabase.ts
│   └── custom.ts
├── styles/             # CSS/Tailwind
│   └── globals.css
└── App.tsx             # Main app component
```

---

### Componentes Principales

**Layout Components:**
- `Layout.tsx` - Main layout con sidebar
- `Header.tsx` - Top navigation
- `Sidebar.tsx` - Side navigation menu
- `Footer.tsx`

**Order Components:**
- `OrderCard.tsx` - Card de orden en OrderBoard
- `OrderDetails.tsx` - Detalle completo de orden
- `OrderStatus.tsx` - Badge de estado
- `OrderTimeline.tsx` - Timeline de eventos

**Product Components:**
- `ProductCard.tsx` - Card de producto en menú
- `ProductModal.tsx` - Modal de detalle con variantes
- `ProductGrid.tsx` - Grid de productos
- `CategoryFilter.tsx` - Filtro por categoría

**Cart Components:**
- `CartItem.tsx` - Item en carrito
- `CartSummary.tsx` - Resumen de carrito
- `CartDrawer.tsx` - Drawer lateral de carrito

**Inventory Components:**
- `InventoryTable.tsx` - Tabla de inventory items
- `StockLevel.tsx` - Indicador de nivel de stock
- `TransferModal.tsx` - Modal de transfer

**Finance Components:**
- `CashSessionCard.tsx` - Card de sesión de caja
- `FinancialChart.tsx` - Charts de ventas
- `MetricCard.tsx` - Card de métrica (revenue, orders, etc.)

---

### Contexts

#### AuthContext
```typescript
interface AuthContext {
  user: User | null;
  profile: Profile | null;
  store: Store | null;
  role: string;
  permissions: string[];
  signIn: (email, password) => Promise<void>;
  signOut: () => Promise<void>;
  loading: boolean;
}
```

#### CartContext
```typescript
interface CartContext {
  items: CartItem[];
  addItem: (product, variant?, addons?) => void;
  removeItem: (itemId) => void;
  updateQuantity: (itemId, quantity) => void;
  clear: () => void;
  total: number;
}
```

#### StoreContext
```typescript
interface StoreContext {
  store: Store;
  updateStore: (data) => Promise<void>;
  theme: MenuTheme;
  updateTheme: (theme) => void;
}
```

#### OfflineContext (1000+ líneas - BLOATED según auditoría)
```typescript
interface OfflineContext {
  isOnline: boolean;
  pendingOrders: Order[];
  syncStatus: 'idle' | 'syncing' | 'error';
  queueOrder: (order) => void;
  syncAll: () => Promise<void>;
  // ... muchas más funciones
}
```

**Problema:** OfflineContext tiene demasiadas responsabilidades.

**Solución recomendada:** Split en:
- `OnlineStatusContext` - Solo estado online/offline
- `SyncContext` - Lógica de sync
- `LocalStorageContext` - IndexedDB operations

---

### Hooks Personalizados

**useSupabase**
```typescript
const useSupabase = () => {
  return createClient<Database>(url, key);
}
```

**useAuth**
```typescript
const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be within AuthProvider');
  return context;
}
```

**useCart**
```typescript
const useCart = () => {
  const context = useContext(CartContext);
  return context;
}
```

**useWallet**
```typescript
const useWallet = (clientId: string) => {
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBalance = async () => {
      const { data } = await supabase
        .from('clients')
        .select('wallet_balance')
        .eq('id', clientId)
        .single();
      setBalance(data.wallet_balance);
      setLoading(false);
    };
    fetchBalance();
  }, [clientId]);

  return { balance, loading };
}
```

**useRealtime (Supabase Realtime)**
```typescript
const useRealtime = (table: string, filter?: string) => {
  const [data, setData] = useState([]);

  useEffect(() => {
    const channel = supabase
      .channel(`${table}_changes`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter
      }, (payload) => {
        // Update data on change
        setData(prev => updateData(prev, payload));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter]);

  return data;
}
```

---

### Routing

**React Router v6:**

```typescript
<Routes>
  {/* Staff routes */}
  <Route path="/" element={<Layout />}>
    <Route index element={<Dashboard />} />
    <Route path="orders" element={<Orders />} />
    <Route path="order-board" element={<OrderBoard />} />
    <Route path="products" element={<Products />} />
    <Route path="inventory" element={<InventoryManagement />} />
    <Route path="clients" element={<Clients />} />
    <Route path="finance" element={<Finance />} />
    <Route path="staff" element={<StaffManagement />} />
    <Route path="settings" element={<Settings />} />
  </Route>

  {/* Client routes */}
  <Route path="/client" element={<ClientLayout />}>
    <Route path="menu" element={<MenuPage />} />
    <Route path="cart" element={<CartPage />} />
    <Route path="checkout" element={<CheckoutPage />} />
    <Route path="tracking" element={<TrackingPage />} />
    <Route path="wallet" element={<WalletPage />} />
    <Route path="loyalty" element={<LoyaltyPage />} />
    <Route path="profile" element={<ProfilePage />} />
  </Route>

  {/* Public routes */}
  <Route path="/qr/:code" element={<QRResolver />} />
  <Route path="/auth" element={<AuthPage />} />
</Routes>
```

---

### State Management

**Strategy:** React Context API (NO Redux, NO Zustand)

**Razones:**
- App no es extremadamente compleja
- Context API suficiente para estado global limitado
- Supabase Realtime maneja sync de data

**State distribution:**
- **Server state**: Supabase (queries + Realtime)
- **UI state**: Local component state (useState)
- **Global state**: Contexts (Auth, Cart, Store)
- **Offline state**: IndexedDB (OfflineContext)

---

### Performance Optimizations

**Implementadas:**
- ✅ Pagination en queries (safeQuery wrapper)
- ✅ Batch fetching (evitar N+1)
- ✅ Memoization (React.memo en ProductCard, OrderCard)

**Pendientes (según auditoría):**
- ⚠️ Code splitting (React.lazy para pages)
- ⚠️ Image optimization (lazy loading, webp)
- ⚠️ Virtual scrolling (react-window para listas largas)
- ⚠️ Service Worker caching (PWA)

---

### Type Safety

**Problema actual:** `as any` en 50+ ubicaciones (ver auditoría)

**Solución:**

1. **Generar tipos desde DB:**
```bash
supabase gen types typescript --project-id {project_id} > src/types/database.ts
```

2. **Tipar Supabase client:**
```typescript
import { Database } from './types/database';

const supabase = createClient<Database>(url, key);

// Ahora queries son tipados:
const { data } = await supabase
  .from('orders')  // ✅ Autocomplete
  .select('*');    // ✅ data es tipo Order[]
```

3. **Tipar RPCs:**
```typescript
type GetStockParams = { p_item_id: string };
type GetStockReturn = { quantity: number }[];

const { data } = await supabase.rpc<GetStockReturn>('get_stock', {
  p_item_id: id
} as GetStockParams);
// ✅ data es GetStockReturn
```

---

## 📚 REFERENCIAS

**Documentos relacionados:**
- `AUDITORIA_ARQUITECTONICA_COMPLETA.md` - Auditoría de calidad de código
- `PLAN_LIMPIEZA_ARQUITECTONICA.md` - Plan de cleanup original
- Migraciones en `supabase/migrations/`

**Tech Stack Docs:**
- [Supabase Docs](https://supabase.com/docs)
- [React Docs](https://react.dev)
- [TypeScript Docs](https://www.typescriptlang.org/docs)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [MercadoPago API](https://www.mercadopago.com.ar/developers)

**Repositorio:**
- Path: `C:\Users\eneas\Downloads\livv\Payper\coffe payper`

---

**Generado:** 2026-02-13
**Autor:** Claude Sonnet 4.5
**Versión:** 1.0
**Scope:** Documentación completa de funcionalidades, roles, flows y arquitectura
