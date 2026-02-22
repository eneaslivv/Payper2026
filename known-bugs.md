# known-bugs.md — Bugs Conocidos Payper
**Última actualización**: 2026-02-18 | Auditoría Sistémica v1.0

---

## 🔴 CRÍTICOS (Acción inmediata)

### ✅ BUG-C1: Doble rollback de stock en cancelación de orden — RESUELTO
**Estado**: RESUELTO — 2026-02-18
**Migración**: `supabase/migrations/20260218100000_fix_double_rollback_trigger.sql`
**Detectado**: 2026-02-18 (Auditoría Sistémica v1.0)
**Módulo**: stock-agent + orders-agent
**Agente**: core-guardian (cross-módulo)

**Descripción**:
Al cancelar una orden, el stock se restaura DOS VECES porque existen dos triggers que llaman a la misma función:
- `trg_rollback_stock_on_cancel` → `BEFORE UPDATE` (cualquier columna)
- `trg_rollback_stock_on_cancellation` → `BEFORE UPDATE OF status`

Cuando `status` cambia a `'cancelled'`, ambos triggers disparan en la misma transacción. La función `rollback_stock_on_cancellation()` no tiene guarda de idempotency (`stock_rolled_back` no se chequea antes de ejecutar), y `apply_stock_delta()` genera un UUID nuevo cada llamada. Resultado: doble inserción en `stock_movements` con reason `'order_cancelled_restock'`.

**Evidencia**:
```sql
-- Ambos confirman mismo evento:
CREATE TRIGGER trg_rollback_stock_on_cancel
  BEFORE UPDATE ON orders FOR EACH ROW
  EXECUTE FUNCTION rollback_stock_on_cancellation()

CREATE TRIGGER trg_rollback_stock_on_cancellation
  BEFORE UPDATE OF status ON orders FOR EACH ROW
  EXECUTE FUNCTION rollback_stock_on_cancellation()
```

**Fix propuesto** (PENDIENTE APROBACIÓN):
```sql
-- Opción A: DROP el trigger genérico (preferida)
DROP TRIGGER trg_rollback_stock_on_cancel ON orders;

-- Opción B: Agregar guarda en la función
-- IF NEW.stock_rolled_back = FALSE OR NEW.stock_rolled_back IS NULL THEN
```

**Riesgo del fix**: Bajo — el trigger a eliminar es el redundante. `trg_rollback_stock_on_cancellation` (UPDATE OF status) es el correcto.
**Reversibilidad**: Recrear con `CREATE TRIGGER ... BEFORE UPDATE ON orders ...`

---

### ✅ BUG-C2: RLS DELETE habilitada en stock_movements — RESUELTO
**Estado**: RESUELTO — 2026-02-18
**Migración**: `supabase/migrations/20260218110000_fix_rls_delete_stock_movements.sql`
**Detectado**: 2026-02-18
**Módulo**: security-agent

**Descripción**:
Existe la política RLS `stock_movements_delete_by_store` que permite a cualquier usuario autenticado de la tienda hacer DELETE en el ledger de stock. El trigger `trg_protect_stock_movements` (BEFORE DELETE OR UPDATE) actualmente bloquea esto con EXCEPTION. Sin embargo, si el trigger es eliminado por una migration futura, la RLS abre el ledger.

**Evidencia**:
```sql
-- RLS que NO debería existir:
"policyname": "stock_movements_delete_by_store",
"cmd": "DELETE",
"qual": "(store_id = get_user_store_id())"

-- Trigger que lo bloquea HOY:
BEFORE DELETE OR UPDATE ON stock_movements → protect_ledger_row() → RAISE EXCEPTION
```

**Fix propuesto** (PENDIENTE APROBACIÓN):
```sql
DROP POLICY IF EXISTS stock_movements_delete_by_store ON stock_movements;
```

**Riesgo del fix**: Muy bajo — refuerza lo que el trigger ya garantiza. Defensa en profundidad.

---

### ✅ BUG-C3: clients.wallet_balance actualizado directamente desde frontend — FALSO POSITIVO
**Estado**: FALSO POSITIVO — 2026-02-18 (auditoría payments-agent)
**El `.upsert()` original ya fue eliminado en migración P0 FIX.** `CheckoutPage.tsx` usa `create_order_atomic` RPC que pasa por `wallet_ledger`. No hay acción requerida para C3.

**Hallazgos de la auditoría (nuevos bugs documentados como W1/W2 abajo).**

---

### ✅ BUG-W1: pay_with_wallet versión zombie sin ledger — RESUELTO
**Estado**: RESUELTO — 2026-02-18
**Migración**: `supabase/migrations/20260218120000_drop_pay_with_wallet_zombie.sql`
**Detectado**: 2026-02-18
**Módulo**: payments-agent

**Descripción**:
Existían DOS overloads de `pay_with_wallet`. La versión zombie de 2 params (`p_client_id, p_amount`) hacía UPDATE directo sin wallet_ledger. Dropeada. Solo queda la versión de 3 params con ledger.

**Verificación post-deploy**: `pronargs=3` — único overload restante ✅

---

### ✅ BUG-W2: Dos caches de saldo de wallet desincronizados — RESUELTO
**Estado**: RESUELTO — 2026-02-18
**Migración**: `supabase/migrations/20260218150000_fix_wallet_order_triggers.sql`
**Detectado**: 2026-02-18
**Módulo**: payments-agent

**Causa raíz encontrada**: `wallet_ledger.wallet_id` se usaba inconsistentemente — las funciones de pago pasaban `clients.id` (correcto para el trigger) pero las 3 funciones de órdenes pasaban `wallets.id` → el trigger `update_wallet_balance_from_ledger` (WHERE clients.id = wallet_id) golpeaba 0 filas → `clients.wallet_balance` nunca se actualizaba tras edición/cancelación.

**Fix**: En las 3 funciones, `wallet_id` en el INSERT a `wallet_ledger` cambiado de `v_wallet_id` (wallets.id) a `v_client_id` (clients.id). `wallets.balance` se mantiene como cache secundario vía UPDATE directo.

**Post-deploy**: `uses_client_id=true`, `still_uses_wallet_id=false` en las 3 funciones ✅

**Pendiente (deuda técnica)**: Renombrar `wallet_ledger.wallet_id` → `owner_id` para reflejar que es `clients.id`. No urgente.

---

### ✅ BUG-W3: admin_add_client_balance y admin_adjust_client_balance bypasean ledger — RESUELTO
**Estado**: RESUELTO — 2026-02-18
**Migración**: `supabase/migrations/20260218140000_fix_admin_wallet_ledger.sql`
**Detectado**: 2026-02-18
**Módulo**: payments-agent

**Descripción**:
Ambas funciones admin ahora insertan en `wallet_ledger` (`entry_type='admin_credit'` / `'admin_adjustment'`). El trigger `update_wallet_balance_from_ledger()` actualiza `clients.wallet_balance` automáticamente. Se agregó `FOR UPDATE` a `admin_add_client_balance`. Se mantienen `audit_logs` y validación de rol en `admin_adjust_client_balance`.

**Verificación**: `uses_ledger=true`, `has_for_update=true` en ambas funciones ✅

---

### ✅ BUG-W4: get_financial_metrics lee wallets.balance (siempre $0) → pasivo incorrecto — RESUELTO
**Estado**: RESUELTO — 2026-02-18
**Migración**: `supabase/migrations/20260218130000_fix_financial_metrics_liability.sql`
**Detectado**: 2026-02-18
**Módulo**: payments-agent

**Descripción**:
`get_financial_metrics()` Overload 1 calculaba `total_liability` desde `wallets.balance` (siempre $0). Reescrita para leer `SUM(clients.wallet_balance)`.

**Verificación post-deploy**: `total_liability = $1.154.470,97` coincide exactamente con `SUM(clients.wallet_balance)` ✅

---

### ✅ BUG-W5: Wallet idempotency & ledger-driven — RESUELTO
**Estado**: RESUELTO — 2026-02-18
**Migración**: `supabase/migrations/20260218200000_fix_wallet_idempotency_and_ledger_driven.sql`
**Detectado**: 2026-02-18
**Módulo**: payments-agent

**Bugs corregidos (5)**:
- **W5-A/B**: `credit_wallet(uuid,text,text)` OL2 — direct UPDATE antes del idempotency check → doble-crédito en retry/colisión. Key namespace compartida `'credit_wallet_'` con OL1. **Fix**: idempotency-first (`EXISTS` check antes de toda mutación), nuevo namespace `'mp_credit_'`, FOR UPDATE, solo INSERT ledger.
- **W5-C**: `complete_wallet_payment()` — `source='app'` violaba CHECK constraint → función completamente rota. Mismo patrón UPDATE-primero. **Fix**: idempotency-first `'order_payment_'||order_id`, FOR UPDATE, `source='system'`, ledger-driven.
- **W5-D**: `verify_wallet_integrity()` — leía `wallet_transactions` (tabla de intenciones MP) en vez de `wallet_ledger` (fuente de verdad). Auditoría siempre incorrecta. **Fix**: LATERAL JOIN a wallet_ledger con último `balance_after` por cliente.
- **W5-E**: `pay_with_wallet()` — sin FOR UPDATE (TOCTOU race), `source='wallet'` violaba CHECK constraint → función completamente rota. `p_order_id=NULL` usaba `gen_random_uuid()` como key (no determinista). **Fix**: NULL guard, FOR UPDATE, `source='wallet'` ahora válido en CHECK.
- **PASO 0**: CHECK constraints de `wallet_ledger` extendidos (`entry_type`: +debit, +admin_credit, +admin_adjustment; `source`: +wallet, +admin).

**Key namespaces post-fix** (no se solapan):
- OL1 admin: `'credit_wallet_' || txn_id`
- OL2 MP: `'mp_credit_' || txn_id`
- order payment: `'order_payment_' || order_id`
- pay_with_wallet: `'pay_with_wallet_' || order_id`

**Verificación**: `ol2_idempotency_first=true, ol2_no_direct_update=true, cwp_idempotency_first=true, integrity_uses_ledger=true, pww_null_guard=true, pww_for_update=true, entry_type_check_ok=true, source_check_ok=true` ✅

---

## 🟡 MEDIOS (Próximo sprint)

### ✅ BUG-M1: compensate_stock_on_order_edit() sin SSSMA — RESUELTO
**Estado**: RESUELTO — 2026-02-18
**Migración**: `supabase/migrations/20260218170000_fix_compensate_stock_on_order_edit.sql`
**Detectado**: 2026-02-18
**Módulo**: stock-agent

**Causa raíz**: INSERT directo en `stock_movements` sin UPDATE a `current_stock` → drift en cada edición. `idempotency_key = gen_random_uuid()` → duplicados en retry.

**Fix**: Reemplazado INSERT por `apply_stock_delta()` en paths recipe y direct. Idempotency key determinista: `'edit_comp_' || order_id || '_' || item_id || '_' || md5(old_qty||new_qty)`. `SET search_path = public`. NOWAIT mantenido.

**Verificación**: `calls_apply_delta=true`, `has_deterministic_key=true`, `no_random_key=true` ✅

---

### ✅ BUG-M2: sync_offline_order() no deducía stock (SSSMA bypass crítico) — RESUELTO
**Estado**: RESUELTO — 2026-02-18
**Migración**: `supabase/migrations/20260218160000_fix_sync_offline_order_stock.sql`
**Detectado**: 2026-02-18
**Módulo**: stock-agent + orders-agent

**Causa raíz**: La función validaba stock (FOR UPDATE NOWAIT) e insertaba la orden, pero NUNCA llamaba `apply_stock_delta()`. Órdenes offline se registraban como completas con inventario intacto.

**Fix**: Loop post-INSERT llama `apply_stock_delta()` por cada item con idempotency key `'offline_sync_<order_id>_<product_id>'`. Fallback para `allow_negative=true`: INSERT directo con `reason='offline_order_forced_negative'` + ON CONFLICT DO NOTHING. Se agregó `SET search_path = public`. Se actualizó `stock_movements_reason_check` con los nuevos reasons.

**Verificación**: `calls_apply_delta=true`, `has_forced_path=true`, constraint actualizado con 22 reasons ✅

---

### BUG-M3: transfer_stock_between_locations() completamente roto
**Estado**: ✅ RESUELTO — 2026-02-18
**Detectado**: 2026-02-18
**Módulo**: stock-agent
**Migración**: `supabase/migrations/20260218180000_fix_transfer_stock_between_locations.sql`

**Descripción real (post-auditoría)**:
- Idempotency key collision: ambos INSERTs usaban mismo `v_transfer_id` → unique_violation → función nunca pudo completar
- Nunca actualizaba `inventory_location_stock`
- Sin validación de stock negativo en from_location
- Columna `notes` referenciada no existía en `stock_movements` (bug adicional silencioso)
**Fix**: Keys `_from`/`_to` distintas, negative-stock guard con FOR UPDATE NOWAIT, UPSERT en inventory_location_stock, views actualizadas.

---

### BUG-M4: Funciones zombie activas en DB
**Estado**: ✅ RESUELTO — 2026-02-18
**Detectado**: 2026-02-18
**Módulo**: core-guardian
**Migración**: `supabase/migrations/20260218190000_drop_zombie_stock_functions.sql`

**Funciones eliminadas**:
1. `handle_new_order_inventory()` — tabla `inventory` inexistente, rota, not SECURITY DEFINER. DROP directo.
2. `decrease_stock_atomic(uuid,uuid,uuid,numeric,text)` — SECURITY DEFINER, bypass total de `stock_movements`, mutación directa JSONB pre-SSSMA. Riesgo activo. DROP directo.
3. `deduct_order_stock_unified(uuid,text)` — SECURITY DEFINER, zombie (reemplazada por `finalize_order_stock()`). DROP directo.

**Verificación**: `remaining=0` — las 3 funciones eliminadas de `pg_proc`. Pre-check confirmó 0 triggers y 0 callers antes del DROP.

---

## 🟢 BAJOS (Deuda técnica)

### BUG-B1: wallet_transactions y wallet_ledger posiblemente redundantes
**Estado**: ACTIVO — bajo impacto
**Detectado**: 2026-02-18
**Descripción**: Dos tablas de historial de wallet. No está claro si ambas son necesarias o si generan conflicto.

### BUG-B2: create_order_secure — estado desconocido
**Estado**: INVESTIGAR
**Detectado**: 2026-02-18
**Descripción**: Existe función `create_order_secure` en DB pero no se encontró uso en frontend. Puede ser código muerto o variante de seguridad sin conectar.

### BUG-B3: package_size aplicado localmente en StockAdjustmentModal
**Estado**: ACTIVO — bajo impacto
**Detectado**: 2026-02-18
**Archivo**: `components/StockAdjustmentModal.tsx:100-106`
**Descripción**: Multiplica `qty * item.package_size` en frontend antes de llamar RPC. Si `package_size` cambia en DB, el frontend quedaría desincronizado hasta reload.

### ✅ BUG-S1: admin_add_client_balance sin verificación de autorización — RESUELTO
**Estado**: RESUELTO — 2026-02-18
**Migración**: `supabase/migrations/20260218210000_fix_admin_wallet_auth_s1s2.sql`
**Detectado**: 2026-02-18
**Módulo**: security-agent

**Bugs corregidos**:
- **S1-A**: `admin_add_client_balance(uuid, numeric)` — SECURITY DEFINER sin check `is_super_admin()` → cualquier usuario autenticado podía acreditar saldo.
- **S1-B**: `admin_add_client_balance(uuid, numeric, uuid, text)` — zombie overload sin auth check + UPDATE directo (no usa ledger).

**Fix**: DROP 2 overloads → CREATE 1 canónica `(target_client_id, amount, description DEFAULT)` con guard `is_super_admin()` strict, ledger-first, idempotency key determinista (`admin_credit_` + md5).

**Verificación**: `add_has_guard=true, add_no_old_overload=true` ✅

### ✅ BUG-S2: p_staff_id spoofable en admin_adjust_client_balance — RESUELTO
**Estado**: RESUELTO — 2026-02-18
**Migración**: `supabase/migrations/20260218210000_fix_admin_wallet_auth_s1s2.sql`
**Detectado**: 2026-02-18
**Módulo**: security-agent

**Bugs corregidos**:
- **S2-A**: `admin_adjust_client_balance(uuid, numeric, text, uuid)` — zombie overload, UPDATE directo, `p_staff_id` spoofable en audit_logs.
- **S2-B**: `admin_adjust_client_balance(uuid, numeric, uuid, text)` — `p_staff_id` spoofable en 3 lugares: validación de permisos (lee role del spoofed staff), `performed_by` en wallet_ledger, `user_id` en audit_logs.

**Fix**: DROP 2 overloads → CREATE 1 canónica `(p_client_id, p_amount, p_reason DEFAULT)` con guard `is_super_admin()` strict, **parámetro p_staff_id eliminado**, `auth.uid()` directo en performed_by y user_id, ledger-first, idempotency key determinista (`admin_adjust_` + md5).

**Verificación**: `adjust_has_guard=true, adjust_no_staff_id=true, total_functions=2` ✅

---

## ✅ RESUELTOS (referencia)
Ver `fixed-issues.md`
