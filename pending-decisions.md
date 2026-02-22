# pending-decisions.md — Decisiones Pendientes de Aprobación
**Última actualización**: 2026-02-18

---

## PD-001: Payper Integrity Lockdown v1
**Estado**: PROPUESTA — esperando aprobación
**Fecha propuesta**: 2026-02-18
**Agente**: core-guardian
**Riesgo**: Bajo

**Descripción**:
Migración `20260218100000_integrity_lockdown_v1.sql` con 3 cambios atómicos:

**L1**: `DROP TRIGGER trg_rollback_stock_on_cancel ON orders;`
- Elimina el trigger redundante de rollback (bug C1)
- El trigger correcto `trg_rollback_stock_on_cancellation` se mantiene

**L2**: `DROP POLICY IF EXISTS stock_movements_delete_by_store ON stock_movements;`
- Elimina RLS DELETE del ledger (bug C2)
- El trigger `trg_protect_stock_movements` seguirá bloqueando DELETEs

**L3**: Agregar guarda adicional en `rollback_stock_on_cancellation()`:
```sql
AND (NEW.stock_rolled_back IS NULL OR NEW.stock_rolled_back = FALSE)
```
- Protección futura contra doble-fire aunque reaparezca un segundo trigger

**Reversibilidad**:
- L1: Recrear con `CREATE TRIGGER trg_rollback_stock_on_cancel BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION rollback_stock_on_cancellation();`
- L2: Recrear con `CREATE POLICY stock_movements_delete_by_store ON stock_movements FOR DELETE TO authenticated USING (store_id = get_user_store_id());`
- L3: Revertir la función a versión anterior

**Decisión**: PENDIENTE

---

## PD-002: SSSMA Fase 4 — Migración completa de funciones restantes
**Estado**: DEFERRED — no urgente
**Fecha identificada**: 2026-02-17/18
**Agente**: stock-agent → core-guardian

**Descripción**:
Migrar las funciones que aún no usan `apply_stock_delta()`:
- `consume_from_smart_packages()` → lógica FIFO con paquetes
- `compensate_stock_on_order_edit()` → trigger en orders
- `sync_offline_order()` → sincronización offline
- `transfer_stock_between_locations()` → transferencia entre ubicaciones

**Impacto**: Cierra los últimos entry points de mutación directa a `current_stock`
**Bloqueo**: Ninguno técnico. Requiere planificación para no romper offline sync.
**Decisión**: PENDIENTE (deferred a próximo sprint)

---

## PD-003: Limpieza de funciones zombie
**Estado**: PROPUESTA — esperando investigación adicional
**Fecha identificada**: 2026-02-18
**Agente**: stock-agent

**Descripción**:
Confirmar si las siguientes funciones están en uso y actuar:
1. `handle_new_order_inventory()` — referencia tabla inexistente → DROP si no hay trigger
2. `decrease_stock_atomic()` — JSONB deprecated → DROP o documentar como legacy
3. `deduct_order_stock_unified()` — llama `consume_from_open_packages()` → verificar si existe el callee

**Paso previo requerido**: Confirmar que ningún trigger las invoca actualmente.

**Decisión**: PENDIENTE (requiere query de verificación)

---

## PD-004: Wallet Unification — W1 a W5 como bloque
**Estado**: PROPUESTA — esperando aprobación
**Fecha identificada**: 2026-02-18
**Agente**: payments-agent
**Riesgo**: Medio

**Descripción**:
5 bugs en el dominio wallet con causa raíz común (ledger desconectado de ciertas mutaciones). Orden propuesto de resolución:

**W1** (riesgo cero): `DROP FUNCTION pay_with_wallet(uuid, numeric)` — zombie sin ledger. Pre-check: confirmar que ningún trigger/función la invoca.

**W4** (1 línea, fix inmediato del dashboard): `get_financial_metrics()` → cambiar `SUM(wallets.balance)` por `SUM(clients.wallet_balance)`.

**W3** (reescritura): `admin_add_client_balance()` y `admin_adjust_client_balance()` → insertar en `wallet_ledger` en vez de UPDATE directo.

**W5** (DROP simple): Identificar duplicado incorrecto de `credit_wallet` y eliminarlo. Mantener la versión con ledger.

**W2** (más complejo, requiere pre-check): Unificar `wallet_partial_refund_on_edit`, `wallet_additional_charge_on_edit`, `wallet_refund_on_cancellation` para pasar por `wallet_ledger`. Al terminar, `wallets.balance` puede deprecarse.

**Paso previo requerido para W2**: Confirmar qué columna usa el frontend para mostrar saldo (`clients.wallet_balance` vs `wallets.balance`).

**Decisión**: ⏸️ PENDIENTE

---

## PD-005: Auditar Edge Functions antes de refactorizar credit_wallet Overload 2
**Estado**: BLOQUEADO — requiere auditoría previa
**Fecha identificada**: 2026-02-18
**Agente**: payments-agent
**Riesgo**: Medio

**Descripción**:
`credit_wallet` Overload 2 (MercadoPago webhook) tiene doble-write, shared idempotency key, y sin store validation. No se puede tocar sin saber qué Edge Function la invoca.

**Paso previo requerido**:
1. Auditar Edge Functions en Supabase (`supabase/functions/`) para identificar el caller de `credit_wallet`
2. Confirmar cuál overload resuelve PostgreSQL para cada forma de llamada
3. Evaluar si hay riesgo de regresión en el flujo de MP

**Fix propuesto post-auditoría**: Refactorizar Overload 2 para eliminar el UPDATE directo y usar solo INSERT wallet_ledger (como Overload 1). Separar idempotency keys de ambos overloads.

**Decisión**: ⏸️ BLOQUEADO — auditar primero

---

## DECISIONES YA TOMADAS (histórico)
Ver `DECISIONS.md`
