# fixed-issues.md — Problemas Resueltos
**Última actualización**: 2026-02-18

---

## 2026-02-18 — BUG-W5: Wallet idempotency & ledger-driven architecture
**Migración**: `supabase/migrations/20260218200000_fix_wallet_idempotency_and_ledger_driven.sql`
**Bugs corregidos**: 5 (W5-A/B/C/D/E) + CHECK constraints extendidos

**W5-A/B** — `credit_wallet(uuid,text,text)` OL2: doble-crédito en retry, namespace colisionaba con OL1.
- Fix: idempotency check ANTES de toda mutación; nuevo namespace `'mp_credit_'`; FOR UPDATE; INSERT ledger only.

**W5-C** — `complete_wallet_payment()`: `source='app'` violaba CHECK → función rota. UPDATE-primero.
- Fix: idempotency-first `'order_payment_'||order_id`; FOR UPDATE; `source='system'`; ledger-driven.

**W5-D** — `verify_wallet_integrity()`: leía `wallet_transactions` en vez de `wallet_ledger`.
- Fix: LATERAL JOIN a `wallet_ledger` con último `balance_after` por cliente.

**W5-E** — `pay_with_wallet()`: sin FOR UPDATE (TOCTOU), `source='wallet'` violaba CHECK → función rota.
- Fix: NULL guard para `p_order_id`, FOR UPDATE lock, `source='wallet'` habilitado en CHECK.

**PASO 0** — `wallet_ledger` CHECK constraints extendidos:
- `entry_type`: +debit, +admin_credit, +admin_adjustment
- `source`: +wallet, +admin

**Verificación**: `ol2_idempotency_first=true, ol2_no_direct_update=true, cwp_idempotency_first=true, integrity_uses_ledger=true, pww_null_guard=true, pww_for_update=true, entry_type_check_ok=true, source_check_ok=true` ✅

---

## 2026-02-18 — BUG-S1/S2: Admin wallet functions sin auth + staff_id spoofable
**Migración**: `supabase/migrations/20260218210000_fix_admin_wallet_auth_s1s2.sql`
**Bugs corregidos**: 4 (S1-A/B, S2-A/B)

**S1-A** — `admin_add_client_balance(uuid, numeric)`: SECURITY DEFINER sin check `is_super_admin()` → cualquier usuario autenticado podía acreditar saldo.

**S1-B** — `admin_add_client_balance(uuid, numeric, uuid, text)`: zombie overload sin auth check + UPDATE directo (no usa ledger).

**S2-A** — `admin_adjust_client_balance(uuid, numeric, text, uuid)`: zombie overload, UPDATE directo, `p_staff_id` spoofable en audit_logs.

**S2-B** — `admin_adjust_client_balance(uuid, numeric, uuid, text)`: `p_staff_id` spoofable en 3 lugares:
- Validación de permisos (lee role del spoofed staff)
- `performed_by` en wallet_ledger
- `user_id` en audit_logs

**Fix aplicado**:
- DROP 4 overloads → CREATE 2 funciones canónicas (1 por endpoint)
- Guard `is_super_admin()` strict al inicio de ambas
- Parámetro `p_staff_id` eliminado (S2 fix)
- `auth.uid()` directo en `performed_by` y `user_id` (no COALESCE)
- Ledger-first obligatorio (INSERT wallet_ledger → trigger → clients.wallet_balance)
- Idempotency keys deterministas:
  - `admin_add_client_balance`: `'admin_credit_' + client_id + md5(amount||desc||second)`
  - `admin_adjust_client_balance`: `'admin_adjust_' + client_id + md5(amount||reason||second)`

**Firmas canónicas**:
- `admin_add_client_balance(target_client_id uuid, amount numeric, description text DEFAULT)`
- `admin_adjust_client_balance(p_client_id uuid, p_amount numeric, p_reason text DEFAULT)`

**Verificación**: `add_has_guard=true, add_no_old_overload=true, adjust_has_guard=true, adjust_no_staff_id=true, total_functions=2` ✅

---

## 2026-02-17 — P4: Stock Adjustment Bug Fixes (9 bugs)
**Migración**: `supabase/migrations/20260217150000_p4_stock_adjustment_fixes.sql`
**Bugs corregidos**:
1. CHECK constraint incorrecto en stock_movements
2. Missing FOR UPDATE (race condition)
3. Cross-store validation en consume_from_smart_packages
4. inventory_movements schema mismatch (tipo enum)
5. Trigger double-counting en update_inventory_from_movement
6. inventory_location_stock columna item_id (no inventory_item_id)
7. Missing tenant_id en inventory_movements
8. Search_path hardening en funciones SECURITY DEFINER
9. Idempotency key en consume_from_smart_packages

**Estado**: ✅ DEPLOYED

---

## 2026-02-17 — SSSMA Fase 1: apply_stock_delta + validate_stock_integrity
**Migración**: `supabase/migrations/20260217200000_sssma_phase1.sql`
**Cambios**:
- Creada `apply_stock_delta()` — función atómica única para mutar stock (INSERT ledger + UPDATE cache)
- Creada `validate_stock_integrity()` — detección de drift cache vs ledger
- Fixed `adjust_inventory()` — estaba rota, ahora usa `apply_stock_delta()`
- Agregado constraint `chk_nonzero_delta` en stock_movements
- Eliminado constraint duplicado `check_current_stock_non_negative`

**Estado**: ✅ DEPLOYED

---

## 2026-02-17 — SSSMA Fase 2: Migración de funciones críticas
**Migración**: `supabase/migrations/20260217210000_sssma_phase2.sql`
**Cambios**:
- `apply_stock_delta()` — agregado parámetro `p_notes`
- `transfer_stock()` — path RESTOCK ahora delega a `apply_stock_delta()`; path TRANSFER sin cambios
- `update_inventory_from_movement` trigger — eliminado 'restock' de skip list
- `rollback_stock_on_cancellation()` — reemplazado INSERT+UPDATE por `apply_stock_delta()` por movimiento
- `finalize_order_stock()` — cada deducción (recipe, direct_sale, variant_override, addon) llama `apply_stock_delta()`

**Estado**: ✅ DEPLOYED

---

## 2026-02-18 — SSSMA Fase 3: Eliminar cascade trigger + unificar fuente closed_units
**Migración**: `supabase/migrations/20260218000000_sssma_phase3.sql`
**Cambios**:
- `calculate_total_stock()` — ahora lee `inventory_location_stock.closed_units` en vez de `inventory_items.closed_stock` (stale)
- `consume_from_smart_packages()` — al abrir paquete cerrado, también decrementa `inventory_location_stock.closed_units`
- DROP TRIGGER `trg_sync_open_pkg_to_item` — eliminado cascade overwrite de current_stock

**Estado**: ✅ DEPLOYED

---

## 2026-02-18 — BUG-C2: RLS DELETE en stock_movements (defensa en profundidad)
**Migración**: `supabase/migrations/20260218110000_fix_rls_delete_stock_movements.sql`
**Problema**: Política `stock_movements_delete_by_store` (PERMISSIVE, rol `authenticated`) permitía DELETE en el ledger de stock. Riesgo latente: si `trg_protect_stock_movements` fuera eliminado por error, el ledger quedaría borrable.
**Fix**: `DROP POLICY stock_movements_delete_by_store ON stock_movements` — sin policy = deny by default para authenticated.
**Verificación post-deploy**:
- Sin policy DELETE en stock_movements ✅ (solo SELECT, INSERT, UPDATE)
- `trg_protect_stock_movements` activo ✅
- DELETE bloqueado con: `ERROR: Operación DELETE bloqueada en tabla ledger "stock_movements"` ✅
**Resultado**: Defensa en doble capa — Layer 1 RLS deny + Layer 2 trigger BEFORE DELETE.
**Estado**: ✅ DEPLOYED

---

## 2026-02-18 — BUG-C1: Doble rollback trigger en cancelación de orden
**Migración**: `supabase/migrations/20260218100000_fix_double_rollback_trigger.sql`
**Problema**: `trg_rollback_stock_on_cancel` (BEFORE UPDATE genérico) + `trg_rollback_stock_on_cancellation` (BEFORE UPDATE OF status) ambos llamaban `rollback_stock_on_cancellation()`. Al cancelar una orden, stock se restauraba x2.
**Fix**: `DROP TRIGGER trg_rollback_stock_on_cancel ON orders` — eliminado el trigger redundante.
**Verificación post-deploy**:
- `trg_rollback_stock_on_cancellation` existe ✅
- `trg_rollback_stock_on_cancel` eliminado ✅
- `validate_stock_integrity()`: 3 drifts pre-existentes (no relacionados con este fix)
**Estado**: ✅ DEPLOYED

---

## 2026-02-17 — Drift detectado y documentado
**No es fix, es documentación de estado**:
- TEST Coca Cola Lata: cache=0 vs ledger=15 (drift -15, datos de test P4)
- Panceta Tapalque: cache=0.1 vs ledger=0 (drift +0.1, UPDATE directo sin movimiento)
- AUDIT TEST Gin Tonic: alineado manualmente a ledger (14)

**Estado**: ✅ DOCUMENTADO — drift de test, no afecta producción real

---

## 2026-02-18 — BUG-M4: DROP funciones zombie pre-SSSMA
**Migración**: `supabase/migrations/20260218190000_drop_zombie_stock_functions.sql`
**Funciones eliminadas**: `decrease_stock_atomic` (bypass ledger — riesgo activo), `handle_new_order_inventory` (tabla inexistente), `deduct_order_stock_unified` (zombie reemplazada por trigger).
**Verificación pre-drop**: 0 triggers activos, 0 callers, 0 frontend .rpc() ✅. Post-drop: `remaining=0` ✅
**Estado**: ✅ DEPLOYED

---

## 2026-02-18 — BUG-M1: compensate_stock_on_order_edit() — drift en ediciones de orden
**Migración**: `supabase/migrations/20260218170000_fix_compensate_stock_on_order_edit.sql`
**Problema**: INSERT directo en `stock_movements` sin UPDATE `current_stock` → drift en cache. `idempotency_key = gen_random_uuid()` → duplicados en retry.
**Fix**: `apply_stock_delta()` en paths recipe y direct. Key determinista: `'edit_comp_' || order_id || '_' || item_id || '_' || md5(old_qty||new_qty)`. `SET search_path = public`.
**Verificación**: `calls_apply_delta=true`, `has_deterministic_key=true`, `no_random_key=true` ✅
**Estado**: ✅ DEPLOYED

---

## 2026-02-18 — BUG-M3: transfer_stock_between_locations() — completamente roto
**Migración**: `supabase/migrations/20260218180000_fix_transfer_stock_between_locations.sql`
**Problema**: 3 bugs acumulados: (1) idempotency key collision → unique_violation en 2do INSERT → función nunca completó en producción; (2) `inventory_location_stock` nunca actualizado; (3) sin validación de stock negativo en from_location. Bug adicional: columna `notes` no existe en `stock_movements`.
**Fix**: Keys `_from`/`_to` distintas con `ON CONFLICT DO NOTHING`. Negative-stock guard: `SELECT closed_units FOR UPDATE NOWAIT` antes de operar. UPSERT en `inventory_location_stock` para ambas ubicaciones. `current_stock` no tocado (net-zero). Views `stock_movements_audit` y `stock_transfer_history` actualizadas para nuevo formato de keys.
**Verificación**: `has_distinct_keys=true`, `has_guard=true`, `updates_loc_stock=true`, `config=[search_path=public]` ✅
**Estado**: ✅ DEPLOYED

---

## 2026-02-18 — BUG-M2: sync_offline_order() — stock nunca deducido (CRÍTICO ESTRUCTURAL)
**Migración**: `supabase/migrations/20260218160000_fix_sync_offline_order_stock.sql`
**Problema**: `sync_offline_order()` validaba stock y creaba la orden pero nunca llamaba `apply_stock_delta()`. Cada orden offline dejaba el inventario intacto — 0 registros en `stock_movements`.
**Fix**: Loop post-INSERT que llama `apply_stock_delta('offline_order_sync')` por cada item con idempotency key. Fallback forzado con `reason='offline_order_forced_negative'` para path allow_negative. `SET search_path = public` agregado. `stock_movements_reason_check` actualizado.
**Verificación**: `calls_apply_delta=true`, `has_forced_path=true`, constraint con 22 reasons ✅
**Estado**: ✅ DEPLOYED

---

## 2026-02-18 — BUG-W2: Fix wallet_ledger.wallet_id inconsistente en triggers de órdenes
**Migración**: `supabase/migrations/20260218150000_fix_wallet_order_triggers.sql`
**Causa raíz**: `wallet_partial_refund_on_edit`, `wallet_additional_charge_on_edit` y `wallet_refund_on_cancellation` insertaban `wallet_id = wallets.id` en `wallet_ledger`. El trigger `update_wallet_balance_from_ledger` espera `clients.id` → golpeaba 0 filas → `clients.wallet_balance` nunca se actualizaba tras edición/cancelación.
**Fix**: Cambio de `v_wallet_id` → `v_client_id` en el INSERT a `wallet_ledger` en las 3 funciones. `wallets.balance` se mantiene como cache secundario.
**Verificación**: `uses_client_id=true`, `still_uses_wallet_id=false` en las 3 funciones ✅
**Estado**: ✅ DEPLOYED

---

## 2026-02-18 — BUG-W3: admin wallet functions — INSERT ledger en vez de UPDATE directo
**Migración**: `supabase/migrations/20260218140000_fix_admin_wallet_ledger.sql`
**Problema**: `admin_add_client_balance()` y `admin_adjust_client_balance()` modificaban `clients.wallet_balance` directamente sin registro en `wallet_ledger`.
**Fix**: Ambas funciones ahora insertan en `wallet_ledger` → trigger → `clients.wallet_balance`. Agregado `FOR UPDATE` a la primera función. Mantenido `audit_logs` en la segunda.
**Verificación**: `uses_ledger=true`, `has_for_update=true` en ambas ✅
**Estado**: ✅ DEPLOYED

---

## 2026-02-18 — BUG-W4: Fix get_financial_metrics total_liability ($0 → correcto)
**Migración**: `supabase/migrations/20260218130000_fix_financial_metrics_liability.sql`
**Problema**: `get_financial_metrics()` Overload 1 calculaba `total_liability` desde `wallets.balance` (nunca actualizado por pagos principales → siempre $0). Dashboard financiero mostraba pasivo incorrecto.
**Fix**: `CREATE OR REPLACE` del Overload 1 cambiando `FROM wallets WHERE balance > 0` → `FROM clients WHERE wallet_balance > 0`.
**Verificación**: `total_liability = $1.154.470,97` = `SUM(clients.wallet_balance)` ✅
**Estado**: ✅ DEPLOYED

---

## 2026-02-18 — BUG-W1: Drop pay_with_wallet zombie (sin ledger)
**Migración**: `supabase/migrations/20260218120000_drop_pay_with_wallet_zombie.sql`
**Problema**: Existían 2 overloads de `pay_with_wallet`. La versión de 2 params hacía UPDATE directo sobre `clients.wallet_balance` sin insertar en `wallet_ledger` — sin audit trail.
**Fix**: `DROP FUNCTION pay_with_wallet(uuid, numeric)`. La versión de 3 params (con ledger) queda intacta.
**Verificación**: `pronargs=3` — único overload en DB ✅
**Estado**: ✅ DEPLOYED

---

## Anteriores (resueltos antes de 2026-02-17)
Ver `DECISIONS.md` para historial desde 2026-01-20 en adelante.
