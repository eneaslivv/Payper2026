# Payper Fixed Issues Log

## 2026-01-20 — Fix registro de clientes en /m/:slug

**Problema:** "Database error saving new user" al registrar clientes nuevos

**Causa raíz:** 
1. FK `profiles_id_fkey` no era DEFERRABLE (conflicto de timing con trigger)
2. Índice único `clients_auth_user_store_unique` tenía condición WHERE que impedía ON CONFLICT

**Solución aplicada:**
1. ALTER TABLE profiles - FK a DEFERRABLE INITIALLY DEFERRED
2. Recrear índice único en clients sin condición WHERE
3. Actualizar función handle_new_user con manejo robusto

**Archivos/objetos modificados:**
- `profiles_id_fkey` constraint
- `clients_auth_user_store_unique` index
- `handle_new_user()` function

**Estado:** ✅ Resuelto
**Fecha:** 2026-01-20

## 2026-01-20 — Fix Redirect Auth (Email Verification)

**Problema:** Al verificar email, el usuario era redirigido al admin panel o site root en lugar de volver al menú.

**Causa raíz:** falta de parámetro `emailRedirectTo` en `supabase.auth.signUp()`.

**Solución aplicada:**
1. Modificado `pages/client/AuthPage.tsx`:
   - Agregado `emailRedirectTo: \`\${window.location.origin}/#/m/\${slug}\``

**Acción Manual Requerida:**
- Configurar "Redirect URLs" en Supabase Auth Dashboard.
- Agregar: `http://localhost:3005/#/m/*` y dominio producción.

## 2026-01-21 — Fix Stock Additions (Ghost Table Bug)

**Problema:** Discrepancia severa en el stock. Las "Adiciones" o "Restocks" no se reflejaban en el stock global ni en las ubicaciones, mientras que el stock real físico aumentaba.

**Causa raíz:** Error crítico en el trigger `update_inventory_from_movement` (introducido en V20). La rama de lógica para cantidades positivas (Adiciones) intentaba insertar en la tabla `location_stock` (nombre incorrecto) en lugar de `inventory_location_stock`.
- `decrease_stock_atomic_v20` escribía correctamente en `inventory_location_stock`.
- `update_inventory_from_movement` (ADD) escribía en `location_stock` (posiblemente inexistente o huérfana).
- `sync_item_totals_from_locations` leía de `inventory_location_stock`.

Resultado: Adiciones ignoradas por el sistema de sincronización.

**Solución aplicada:**
1. Crear migración `20260121_fix_stock_trigger_table_name_v22.sql` que corrige el nombre de la tabla en el trigger.

**Acción Manual Requerida:**
- Ejecutar migración V22.
- **IMPORTANTE:** El stock agregado anteriormente se "perdió" (no se registró en la tabla correcta). Se requiere un conteo y ajuste manual de stock para los ítems afectados (ej. "Panceta") para corregir los saldos actuales.

## 2026-01-21 — Fix Transfer Stock Modal (Multiple Bugs)

**Problema:** El modal de transferencia de stock entre ubicaciones no funcionaba correctamente:
1. Checkboxes seleccionaban todos los items (bug de `item_id` undefined)
2. Stock disponible siempre mostraba 0
3. La transferencia fallaba con error 404
4. Los movimientos no quedaban trazados en el historial

**Causa raíz (múltiples):**
1. **Checkbox bug:** RPC `get_location_stock_details` devuelve `res_item_id` pero el frontend buscaba `item_id`
2. **Stock 0:** RPC `get_store_stock` declaraba `closed_units integer` pero la columna es `numeric`
3. **404 en transfer:** Frontend usaba parámetros incorrectos (`p_from_location` vs `p_from_location_id`)
4. **Sin trazabilidad:** Función `log_inventory_action` no existía

**Solución aplicada:**
1. `LogisticsView.tsx`: Cambiar mapping de `item.item_id` → `item.res_item_id`
2. SQL: Recrear `get_store_stock` con `closed_units numeric`
3. `TransferStockModal.tsx`: Corregir parámetros de RPC (`p_from_location_id`, `p_to_location_id`, etc.)
4. SQL: Crear función `log_inventory_action` para insertar en `inventory_audit_logs`
5. `TransferStockModal.tsx`: Usar `createPortal` para centrar modal correctamente

