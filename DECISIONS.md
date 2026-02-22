# System Design Decisions

## 2026-01-20: Unificación Sistema de Stock

### Problema
- Múltiples triggers conflictivos en `orders` (`trg_legacy`, `trg_deduct`, etc.) causaban inconsistencias.
- Stock no se descontaba al entregar ("Entregado" vs "paid" timing).
- Discrepancias entre ubicaciones (`inventory_location_stock`) y totales globales (`inventory_items`).
- Funciones legacy usaban columna inexistente `unit_size`.

### Solución
1. **Limpieza de Triggers**: Eliminados triggers duplicados en `orders`.
2. **Función Unificada `deduct_order_stock()`**:
   - Detecta automáticamente si un producto tiene receta en `product_recipes`.
   - **Con Receta**: Descuenta cantidades de ingredientes proporcionales.
   - **Sin Receta**: Descuenta el item directo.
   - Soporta variantes (`recipe_overrides`) y addons.
3. **Trigger de Entrega**: `trg_deduct_stock_on_delivery` dispara SOLO cuando `status IN ('Entregado', 'served', 'delivered')`.
4. **Corrección Atómica V20**: `decrease_stock_atomic_v20()` actualizada para usar `package_size` correcto.
5. ** Disponibilidad Strict**: Nueva lógica "Whole vs Ration" donde productos que requieren unidad entera se marcan como agotados si solo hay abiertos.

### Archivos modificados
- Funciones SQL: `deduct_order_stock`, `decrease_stock_atomic_v20`, `check_product_stock_availability`.
- Triggers: `trg_deduct_stock_on_delivery`, `trg_sync_item_stock_unified`, `trg_update_product_availability`.
- Frontend: `ClientContext.tsx` actualizado para usar disponibilidad server-side (RPC + Realtime).

### Testing
- **Caso Receta**: Orden con "Test Cafe" (0.1 Panceta + 0.5 Jamón).
- **Resultado**: Stock descontado correctamente de ingredientes.
- **Trazabilidad**: Movimientos registrados en `stock_movements`.

## 2026-01-20: Fix Creación de Clientes (Auth Trigger)

### Problema
- Fallo en registro de nuevos clientes desde el panel de SaaS (`Clients -> Nuevo Usuario`).
- Error DB: "database error" al crear usuario.
- Causa raíz: Trigger `handle_new_user` intentaba insertar columnas inexistentes y faltaba robustez en tipos de datos.

### Solución (Protocolo 'Cloud Code')
1.  **Auditoría de Schema**: Verificada estructura exacta de `clients` y `profiles`.
2.  **Fix Defensivo `handle_new_user`**:
    - Generación explícita de defaults en código (aunque DB tenga defaults).
    - Mapeo seguro de `store_id` (UUID nullable) y `role` (TEXT).
    - Uso de `ON CONFLICT` con suposición de índice único existente (`auth_user_id`, `store_id`).
3.  **Seguridad**: `SECURITY DEFINER` mantenido para permitir inserción privilegiada desde Auth.

### Archivos
- `supabase/migrations/20260120_fix_clients_creation_v2.sql`

---

## 2026-01-20 — Sistema de Agentes y Protección

**Problema:** Funciones críticas se modificaban sin auditoría, causando regresiones constantes.

**Solución implementada:**
1. Creado `docs/PROTECTED_FUNCTIONS.md` - lista de funciones que NO se tocan sin auditoría
2. Actualizado `AGENTS.md` - definición de agentes y cuándo usar cada uno
3. Creado `docs/ORCHESTRATOR_RULES.md` - reglas de detección automática de agente

**Regla establecida:** Todo prompt que toque DB o código DEBE pasar por el agente correspondiente.

**Estado:** ✅ Implementado
**Fecha:** 2026-01-20

---

## 2026-01-20 — Fix tabla incorrecta en stock (V22)

**Problema:** Restocks no se guardaban porque `update_inventory_from_movement` usaba tabla `location_stock` (inexistente)

**Causa raíz:** Migración V20 introdujo nombre de tabla incorrecto

**Solución:** Corregir a `inventory_location_stock` en V22

**Funciones modificadas:**
- `update_inventory_from_movement()` → V22

**Estado:** ✅ Aplicado
**Fecha:** 2026-01-20

---

## 2026-01-20 — Fix función transfer_stock missing

**Problema:** Restock fallaba con "function does not exist"

**Causa raíz:** Migración `20260110012800_fix_transfer_stock_final.sql` nunca fue aplicada a producción

**Solución:** Ejecutar migración manualmente en Supabase SQL Editor

**Estado:** ✅ Aplicado
**Fecha:** 2026-01-20

---

## 2026-01-21 — Fix Stock Display Inconsistencies

**Problema:** UI mostraba valores de stock inconsistentes:
- Stock cerrado truncado (8.9 → 8)
- Porcentaje de paquete abierto incorrecto (60% → 70%)
- Discrepancia entre valores en diferentes partes de la UI

**Causa raíz (múltiples):**
1. RPC `get_item_stock_by_locations` declaraba `closed_units integer` pero columna es `numeric`
2. Frontend usaba `Math.floor()` adicional en `LocationStockBreakdown`
3. Porcentaje calculado con fórmula derivada incorrecta

**Solución:**
1. **SQL:** Recrear `get_item_stock_by_locations` con `closed_units numeric` + nuevo campo `open_remaining_sum numeric`
2. **Frontend:** Eliminar `Math.floor()`, usar `open_remaining_sum` directamente para cálculo de porcentaje

**Decisión sobre fuente de datos:**
- Usar JSONB `inventory_location_stock.open_packages` como fuente principal
- Tabla separada `open_packages` queda como histórico/backup

**Funciones modificadas:**
- `get_item_stock_by_locations()` → Tipo corregido + campo agregado
- `pages/InventoryManagement.tsx` → `LocationStockBreakdown` component

**Estado:** ✅ Aplicado
**Fecha:** 2026-01-21

---

## 2026-01-21 — Implementar Sección de Auditoría

**Problema:** La sección de Auditoría (`AuditLog.tsx`) consultaba tabla `audit_logs` que no existía, resultando en vista vacía.

**Causa raíz:** El frontend esperaba una tabla unificada que nunca fue creada.

**Diagnóstico:**
- Tablas con datos: `stock_movements` (137), `inventory_audit_logs` (79)
- Tablas vacías pero estructuradas: `wallet_transactions`, `loyalty_transactions`
- Tabla requerida: `audit_logs` (no existía)

**Solución:** Crear VIEW SQL `audit_logs` que unifica todas las tablas de log:
- `stock_movements` → Movimientos de stock (consumo, waste, transfers)
- `inventory_audit_logs` → Acciones de inventario detalladas
- `wallet_transactions` → Transacciones de wallet/pagos
- `loyalty_transactions` → Puntos de fidelidad

**Funciones creadas:**
- VIEW `audit_logs` → Unifica 4 fuentes de datos con campos compatibles

**Pendiente para FASE 2:**
- Agregar triggers para: pedidos (creación/cancelación), staff (login/logout), sistema (cambios de config/precios)

**Estado:** ✅ Aplicado
**Fecha:** 2026-01-21


## 2026-01-21 — Fix Menu Filtering Logic (Phase 4)

**Problema:** La selección de mesas en `MenuDesign` no afectaba qué menú se muestra al escanear QR.
**Causa:** El backend `resolve_menu` usaba lógica obsoleta (columna `menu_id` en `venue_nodes`) ignorando la nueva tabla `menu_rules`.

**Solución Implementada:**
1.  **Migración SQL**: Actualizado `resolve_menu` para consultar `menu_rules` con prioridad:
    -   Priority 1: Regla de Mesa (Table Rule)
    -   Priority 2: Menú Fallback (Default)
    -   Priority 3: Cualquier Menú activo
2.  **UX Improvements**:
    -   Restricción de configuración para Menús Default (Globales).
    -   Iconos visuales (Mapa, Reloj, Calendario) en lista de menús.

**Estado:** ✅ Aplicado
**Fecha:** 2026-01-21

---

## 2026-01-21 — Stock Sync Fix (V23)

**Problema:** El stock global (`inventory_items.current_stock`) no se actualizaba cuando un movimiento tenía `location_id` (venta normal).
**Causa:** La función `update_inventory_from_movement` tenía un IF/ELSE que excluía la actualización global si entraba en la rama de `location_id`.
**Impacto:** Divergencia masiva entre stock global (312k) y real en ubicaciones (2k).

**Solución Implementada:**
1.  **Logic Update:** Se modificó `update_inventory_from_movement` para sincronizar SIEMPRE el `current_stock` sumando `inventory_location_stock`.
2.  **Self-Healing:** La función ahora recalcula el total basado en ubicaciones, impidiendo drift futuro.
3.  **Data Repair:** Se ejecutó un UPDATE masivo para corregir todos los ítems existentes.

**Estado:** ✅ Aplicado y Verificado (TEST item corregido de 312740 a 2084).

---

## 2026-01-21 — Fix Direct Sale Stock Logic (V24)

**Problema:**
- El sistema trataba la venta directa de un producto "Cerrado" (ej: Barril TEST 150L, Panceta 1Kg) como si fuera consumo fraccionado.
- Intentaba descontar del `open_package`, resultando en bugs (descontar 1L de un barril de 150L, o intentar abrir paquete para venta de unidad).

**Definición de Negocio:**
- **Venta SIN receta** = Venta de unidad cerrada (Caja/Paquete/Lata). Se descuenta directo de `closed_units`.
- **Venta CON receta** = Consumo de insumo (Cocktail, Sandwich). Se usa lógica fraccionada (`open_packages`).

**Solución Implementada:**
1.  **Tagging en `deduct_order_stock`**:
    -   Si no hay receta, el movimiento se marca como `reason = 'direct_sale'`.
    -   Si hay receta, se marca como `reason = 'recipe_consumption'`.
2.  **Routing en `update_inventory_from_movement`**:
    -   `IF reason = 'direct_sale'` → `UPDATE ... SET closed_units = closed_units - qty`.
    -   `ELSE` → Llamada a `decrease_stock_atomic_v20` (lógica compleja).

**Estado:** ✅ Aplicado
**Fecha:** 2026-01-21

---

## 2026-01-28 — Implementadas políticas RLS faltantes

**Decisión:** Implementadas políticas RLS faltantes
**Contexto:** Auditoría detectó gap en payment_webhooks y wallet_transactions
**Solución:** 7 políticas granulares (store members, clients, super_admin, service_role)
**Impacto:** Protección multi-tenant completa

**Estado:** ✅ DEPLOYED
**Fecha:** 2026-01-28

---

## 2026-02-17 — SSSMA: Single Source Stock Mutation Architecture

**Decisión arquitectónica central:**
`apply_stock_delta()` es la ÚNICA función autorizada para mutar `inventory_items.current_stock` y escribir en `stock_movements`. Ninguna otra función puede hacerlo directamente.

**Jerarquía de autoridad:**
- `stock_movements` = fuente de verdad (ledger append-only)
- `inventory_items.current_stock` = CACHE materializado
- `inventory_location_stock.closed_units` = fuente para paquetes cerrados

**Fases implementadas:**

### Fase 1 (2026-02-17) — apply_stock_delta + validate_stock_integrity
- `apply_stock_delta()` → función atómica: INSERT ledger + UPDATE cache
- `validate_stock_integrity()` → drift detection (cache vs ledger)
- `adjust_inventory()` → migrada a `apply_stock_delta()`
- Constraint `chk_nonzero_delta` en stock_movements
- Migración: `20260217200000_sssma_phase1.sql`
- **Estado:** ✅ DEPLOYED

### Fase 2 (2026-02-17) — Migración de funciones críticas
- `transfer_stock()` → path RESTOCK delega a `apply_stock_delta()`
- `rollback_stock_on_cancellation()` → usa `apply_stock_delta()` por movimiento
- `finalize_order_stock()` → cada deducción llama `apply_stock_delta()`
- Trigger `update_inventory_from_movement` → removido 'restock' del skip list
- Migración: `20260217210000_sssma_phase2.sql`
- **Estado:** ✅ DEPLOYED

### Fase 3 (2026-02-18) — Eliminar cascade trigger
- DROP TRIGGER `trg_sync_open_pkg_to_item` → eliminado overwrite de current_stock
- `calculate_total_stock()` → lee `inventory_location_stock.closed_units` (no stale closed_stock)
- `consume_from_smart_packages()` → sincroniza closed_units al abrir paquete
- Migración: `20260218000000_sssma_phase3.sql`
- **Estado:** ✅ DEPLOYED

### Fase 4 (PENDIENTE)
- Migrar: `consume_from_smart_packages()`, `compensate_stock_on_order_edit()`, `sync_offline_order()`, `transfer_stock_between_locations()`
- Ver `pending-decisions.md` → PD-002

---

## 2026-02-17 — P4: Stock Adjustment Fixes (9 bugs críticos)

**Problema:** 9 bugs en operaciones de pérdida/re-ingreso de stock
**Solución:** Migración `20260217150000_p4_stock_adjustment_fixes.sql`
**Fixes:** CHECK constraint, FOR UPDATE, cross-store validation, inventory_movements schema, trigger double-counting, search_path hardening, idempotency

**Estado:** ✅ DEPLOYED
**Fecha:** 2026-02-17

---

## 2026-02-18 — Auditoría Sistémica Payper v1.0

**Alcance:** 66 tablas, 100+ funciones, 66+ triggers, frontend completo
**Hallazgos críticos:**
1. Doble trigger rollback stock (BUG-C1) — ver `known-bugs.md`
2. RLS DELETE en stock_movements (BUG-C2) — ver `known-bugs.md`
3. clients.wallet_balance sin ledger (BUG-C3) — ver `known-bugs.md`

**Multi-source-of-truth detectado:**
- Stock: 3 fuentes (ledger, cache, location_stock)
- Wallet: 3 fuentes (wallet_ledger, wallets.balance, clients.wallet_balance)
- Cash: 1 fuente correcta (cash_events → ledger)

**Decisiones pendientes:** Ver `pending-decisions.md`
**Fecha:** 2026-02-18

---

## 2026-02-18 — Fix BUG-C1: DROP TRIGGER trg_rollback_stock_on_cancel

**Decisión**: DROP del trigger redundante de rollback
**Aprobado por**: usuario (2026-02-18)
**Migración**: `20260218100000_fix_double_rollback_trigger.sql`

**Contexto**: Dos triggers BEFORE UPDATE sobre `orders` llamaban `rollback_stock_on_cancellation()`. Al cancelar, stock se restauraba x2 (apply_stock_delta genera UUID único por llamada, sin idempotency cross-trigger).

**Trigger eliminado**: `trg_rollback_stock_on_cancel` (BEFORE UPDATE genérico — redundante)
**Trigger conservado**: `trg_rollback_stock_on_cancellation` (BEFORE UPDATE OF status — correcto)

**Verificación post-deploy**:
- `trg_rollback_stock_on_cancellation` presente ✅
- `trg_rollback_stock_on_cancel` eliminado ✅
- validate_stock_integrity(): 3 drifts pre-existentes conocidos (no relacionados)

**Estado:** ✅ DEPLOYED
**Fecha:** 2026-02-18
