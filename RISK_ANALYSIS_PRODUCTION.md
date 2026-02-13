# 🚨 ANÁLISIS DE RIESGOS REALES - PRODUCCIÓN

**Fecha:** 2026-02-13
**Contexto:** Post-auditoría (Rating 9.5/10)
**Objetivo:** Identificar los 8 riesgos que TODAVÍA pueden romper el sistema en producción

---

## 📋 **RESUMEN EJECUTIVO**

| # | Riesgo | Severidad | Mitigado | Acción Requerida |
|---|--------|-----------|----------|------------------|
| 1 | NOWAIT sin retry/backoff | 🟡 MEDIUM | ⚠️ PARCIAL | Agregar retry específico LOCK_TIMEOUT |
| 2 | Deadlocks en caminos alternativos | 🟢 LOW | ✅ SÍ | Auditoría periódica |
| 3 | Idempotencia incompleta | 🔴 HIGH | ⚠️ PARCIAL | Fortalecer idempotency_key |
| 4 | Triggers en cascada | 🟡 MEDIUM | ✅ SÍ | Monitoreo de loops |
| 5 | Métricas infladas | 🟡 MEDIUM | ⚠️ NO | Auditar queries de KPIs |
| 6 | Storage path inconsistente | 🟡 MEDIUM | ❌ NO | Estandarizar uploads |
| 7 | Realtime fuga de datos | 🔴 HIGH | ⚠️ PARCIAL | Auditar subscriptions |
| 8 | Bloat de audit tables | 🟢 LOW | ❌ NO | Cleanup job + partitioning |

**Rating Ajustado:** 8.5/10 → 9.5/10 (si se mitigan los 8)

---

## 🔴 **RIESGO #1: NOWAIT sin Retry/Backoff en Frontend**

### **Descripción del Problema:**
Cuando 2+ tablets intentan modificar el mismo inventory_item simultáneamente:
```sql
-- Tablet A:
SELECT current_stock FROM inventory_items WHERE id = X FOR UPDATE NOWAIT;
-- ✅ Gets lock

-- Tablet B (al mismo tiempo):
SELECT current_stock FROM inventory_items WHERE id = X FOR UPDATE NOWAIT;
-- ❌ ERROR: lock_not_available (55P03)
```

Si el frontend no reintenta, **el usuario ve error "fantasma"** en hora pico.

### **Estado Actual:**

✅ **BACKEND tiene manejo:**
```sql
-- Todas las RPCs retornan:
EXCEPTION
    WHEN lock_not_available THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'LOCK_TIMEOUT',
            'retry_recommended', TRUE
        );
```

⚠️ **FRONTEND tiene retry GENÉRICO:**
```typescript
// OfflineContext.tsx (línea 1053)
const retryDelay = Math.min(5000 * Math.pow(2, failedCount - 1), 60000);
setTimeout(() => triggerSync(), retryDelay);
```

**PERO** el retry es para `syncOrder()`, NO específico para `LOCK_TIMEOUT`.

### **Casos Críticos Sin Retry Específico:**

1. **StockAdjustmentModal.tsx:**
```typescript
// Línea 135-150: Llamadas a RPCs sin retry
const { data, error } = await supabase.rpc('consume_from_smart_packages', {...});
if (error) throw error; // ← NO REINTENTA si es LOCK_TIMEOUT
```

2. **TransferStockModal.tsx:**
```typescript
const { error } = await supabase.rpc('transfer_stock_between_locations', {...});
if (error) throw error; // ← NO REINTENTA
```

3. **Components que usan adjust_inventory:**
```typescript
const { data, error } = await supabase.rpc('adjust_inventory', {...});
if (error) {
    addToast('Error: ' + error.message, 'error');
    return; // ← Usuario ve error, pero podría retry automáticamente
}
```

### **Impacto:**
- **Frecuencia:** Alta en hora pico (10-20 órdenes/min)
- **Experiencia:** Usuario ve "Error de base de datos" cuando debería retry automático
- **Data loss:** No (el error previene escritura corrupta)

### **Solución Recomendada:**

**CRÍTICO - Implementar retry wrapper:**

```typescript
// lib/retryRpc.ts
export async function retryRpc<T>(
  rpcCall: () => Promise<{ data: T | null; error: any }>,
  options = { maxRetries: 3, baseDelay: 200 }
): Promise<{ data: T | null; error: any }> {
  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    const { data, error } = await rpcCall();

    // Success
    if (!error) return { data, error: null };

    // LOCK_TIMEOUT específico → retry con backoff
    if (error.code === '55P03' || error.message?.includes('LOCK_TIMEOUT')) {
      const delay = options.baseDelay * Math.pow(2, attempt);
      console.warn(`[retryRpc] LOCK_TIMEOUT, retry ${attempt + 1}/${options.maxRetries} in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    // Otro error → fail fast
    return { data: null, error };
  }

  return { data: null, error: { message: 'Max retries exceeded' } };
}

// Uso en StockAdjustmentModal.tsx:
const { data, error } = await retryRpc(() =>
  supabase.rpc('consume_from_smart_packages', {...})
);
```

**Prioridad:** 🔴 **ALTA** (afecta UX en hora pico)
**Esfuerzo:** 2-3 horas
**Testing:** Simular locks con 2 tablets + mismo producto

---

## 🟢 **RIESGO #2: Deadlocks en Caminos Alternativos**

### **Descripción del Problema:**
Aunque aplicamos `ORDER BY inventory_item_id` en `finalize_order_stock()`, si HAY otro código path que lockea en orden diferente → deadlock.

### **Caminos de Lock Identificados:**

1. ✅ **finalize_order_stock()** - Locks ordenados
```sql
ORDER BY pr.inventory_item_id  -- ← FIX APLICADO
```

2. ✅ **rollback_stock_on_cancellation()** - No lockea (solo inserta movements)
```sql
INSERT INTO stock_movements (...);  -- ← No hay FOR UPDATE
```

3. ✅ **compensate_stock_on_order_edit()** - Calcula delta, no lockea directamente
```sql
-- Solo inserta movimientos, el trigger de stock_movements hace el UPDATE
```

4. ⚠️ **adjust_inventory()** - Lockea 1 solo item
```sql
PERFORM 1 FROM inventory_items WHERE id = p_inventory_item_id FOR UPDATE NOWAIT;
```
**Riesgo:** Si se llama a `adjust_inventory()` en loop sobre múltiples items sin ordenar → deadlock posible

5. ⚠️ **transfer_stock_between_locations()** - Lockea 1 solo item
```sql
PERFORM 1 FROM inventory_items WHERE id = p_inventory_item_id FOR UPDATE NOWAIT;
```

### **Análisis de Riesgo:**

**Escenario de Deadlock Posible:**
```javascript
// Frontend hace batch adjustment en loop:
for (const item of [itemB, itemA]) {  // ← Orden B, A
    await supabase.rpc('adjust_inventory', { item_id: item.id });
}

// Otro usuario hace:
for (const item of [itemA, itemB]) {  // ← Orden A, B
    await supabase.rpc('adjust_inventory', { item_id: item.id });
}
```

**PERO:**
- `adjust_inventory` usa `NOWAIT` → segundo falla inmediato
- Frontend tiene retry → eventualmente resuelve
- NO es deadlock clásico (lock wait timeout), es lock fail-fast

### **Estado:** ✅ **MITIGADO**
- `NOWAIT` previene deadlock wait
- Retry logic eventual consistency
- Casos edge muy raros (bulk adjustments)

### **Acción:**
⚠️ **Auditar batch operations:**
```sql
-- Query para detectar bulk adjustments:
SELECT
    created_by,
    COUNT(*) as adjustments_in_5min,
    array_agg(DISTINCT inventory_item_id) as items_affected
FROM stock_movements
WHERE reason IN ('physical_count', 'manual_adjustment')
  AND created_at > NOW() - interval '5 minutes'
GROUP BY created_by
HAVING COUNT(*) > 5;
```

**Prioridad:** 🟢 **BAJA** (muy edge case)

---

## 🔴 **RIESGO #3: Idempotencia Incompleta (Timeouts/Retries)**

### **Descripción del Problema:**
Cliente envía request → Timeout → Cliente retry → **Duplicado**

### **Escenarios Críticos:**

#### 3.1 **Webhook de Mercado Pago**
```
1. MP envía webhook → Backend procesa → UPDATE orders
2. Timeout en response (pero UPDATE ya ocurrió)
3. MP reintenta webhook (según spec, hasta 25 veces)
4. ¿Se procesa 2 veces?
```

**Código Actual (mp-webhook):**
```typescript
// supabase/functions/mp-webhook/index.ts
UPDATE orders
SET payment_status = 'approved',
    is_paid = true
WHERE payment_id = {id};
```

✅ **IDEMPOTENTE:** UPDATE es idempotente (set mismo valor múltiples veces = ok)

**PERO** si hay trigger `ON UPDATE` que ejecuta lógica (ej: loyalty points):
```sql
-- ¿Loyalty points se otorgan 2 veces?
CREATE TRIGGER on_payment_approved
AFTER UPDATE ON orders
FOR EACH ROW
WHEN (NEW.payment_status = 'approved' AND OLD.payment_status != 'approved')
EXECUTE FUNCTION grant_loyalty_points();
```

**Verificación Necesaria:**
```sql
SELECT * FROM loyalty_transactions
WHERE order_id IN (
    SELECT id FROM orders WHERE payment_status = 'approved'
)
GROUP BY order_id
HAVING COUNT(*) > 1;  -- ← Si hay filas, loyalty duplicado
```

#### 3.2 **sync_offline_order()**
```typescript
// Tablet envía orden → Timeout → Retry
supabase.rpc('sync_offline_order', { order_data: {...}, idempotency_key: 'X' });
```

**Código Actual:**
```sql
-- sync_offline_order NO usa idempotency_key en INSERT
IF EXISTS (SELECT 1 FROM orders WHERE id = v_order_id) THEN
    UPDATE orders ...
ELSE
    INSERT INTO orders ...  -- ← Si retry con mismo UUID, falla por PK
END IF;
```

✅ **IDEMPOTENTE:** UUID conflict previene duplicado

**PERO** si stock_movements se inserta antes del check:
```sql
-- ¿Stock se descuenta 2 veces antes de detectar duplicado?
```

**Verificación:**
```sql
-- Detectar órdenes con doble deducción:
SELECT
    order_id,
    SUM(qty_delta) as total_deducted,
    COUNT(*) as movement_count
FROM stock_movements
WHERE reason = 'direct_sale'
  AND order_id IS NOT NULL
GROUP BY order_id
HAVING COUNT(*) > (
    SELECT COUNT(*) FROM order_items WHERE order_id = stock_movements.order_id
);
```

#### 3.3 **wallet_ledger duplicados**
```sql
-- Wallet debit en orden:
INSERT INTO wallet_ledger (wallet_id, amount, reference_id) ...;
-- ¿Qué pasa si retry?
```

**DEBE tener:**
```sql
CREATE UNIQUE INDEX idx_wallet_ledger_idempotency
ON wallet_ledger(wallet_id, reference_id, entry_type, ABS(amount))
WHERE reference_id IS NOT NULL;
```

### **Solución Recomendada:**

**CRÍTICO - Agregar idempotency constraints:**

```sql
-- 1. Wallet ledger idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_idempotency
ON wallet_ledger(wallet_id, reference_id, entry_type)
WHERE reference_id IS NOT NULL;

-- 2. Stock movements idempotency (ya existe idempotency_key, pero sin constraint)
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_idempotency
ON stock_movements(idempotency_key)
WHERE order_id IS NOT NULL;

-- 3. Loyalty transactions idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_loyalty_tx_idempotency
ON loyalty_transactions(client_id, order_id, transaction_type)
WHERE order_id IS NOT NULL;
```

**Prioridad:** 🔴 **CRÍTICA** (afecta integridad financiera)
**Esfuerzo:** 1 hora (solo SQL)

---

## 🟡 **RIESGO #4: Triggers en Cascada (Loops/Doble Ejecución)**

### **Estado Actual:**
✅ **TODOS los triggers tienen guards** (verificado en auditoría)

```sql
✅ finalize_order_stock: IF NEW.stock_deducted = FALSE
✅ rollback_stock: IF NEW.status = 'cancelled' AND stock_deducted = TRUE
✅ compensate_stock: IF NEW.items::text != OLD.items::text
✅ wallet_refund: IF payment_method = 'wallet' AND total_amount changed
```

### **Casos Edge Posibles:**

#### 4.1 **Orden editada múltiples veces rápido:**
```
1. Orden creada ($100) → stock deducted
2. Edit rápido ($90) → compensate_stock (+$10 stock)
3. Edit rápido ($80) → compensate_stock (+$10 stock)
4. Cancelación → rollback_stock (¿cuánto devuelve?)
```

**Verificación:**
```sql
-- Ver órdenesmás con múltiples compensaciones:
SELECT
    o.id,
    o.order_number,
    COUNT(DISTINCT sm.id) FILTER (WHERE sm.reason = 'order_edit_compensation') as compensations,
    SUM(sm.qty_delta) FILTER (WHERE sm.reason = 'order_edit_compensation') as total_compensated,
    SUM(sm.qty_delta) FILTER (WHERE sm.reason = 'order_cancelled_restock') as total_rolled_back
FROM orders o
LEFT JOIN stock_movements sm ON sm.order_id = o.id
WHERE o.status = 'cancelled'
  AND o.created_at > NOW() - interval '7 days'
GROUP BY o.id, o.order_number
HAVING COUNT(DISTINCT sm.id) FILTER (WHERE sm.reason = 'order_edit_compensation') > 1;
```

### **Acción:**
⚠️ **Monitoreo semanal:**
```sql
-- View de órdenes con actividad sospechosa:
CREATE OR REPLACE VIEW monitoring_trigger_loops AS
SELECT
    o.id,
    o.order_number,
    COUNT(*) as total_stock_movements,
    array_agg(DISTINCT sm.reason) as reasons,
    CASE
        WHEN COUNT(*) > 10 THEN '❌ SUSPICIOUS: Too many movements'
        WHEN COUNT(*) > 5 THEN '⚠️ WARN: High activity'
        ELSE '✅ OK'
    END as status
FROM orders o
JOIN stock_movements sm ON sm.order_id = o.id
WHERE o.created_at > NOW() - interval '7 days'
GROUP BY o.id, o.order_number
HAVING COUNT(*) > 5
ORDER BY COUNT(*) DESC;
```

**Prioridad:** 🟡 **MEDIA** (guards previenen loops, pero monitoreo útil)

---

## 🟡 **RIESGO #5: Métricas Infladas (KPI Queries Incorrectos)**

### **Descripción del Problema:**
Dashboard muestra revenue inflado porque incluye órdenes `pending` o `cancelled`.

### **Queries Críticos a Auditar:**

#### 5.1 **get_financial_metrics RPC**
```sql
-- ¿Filtra correctamente?
revenue_today: SUM(orders.total_amount) WHERE DATE(created_at) = TODAY
```

**DEBE SER:**
```sql
revenue_today: SUM(orders.total_amount)
WHERE DATE(created_at) = TODAY
  AND is_paid = TRUE  -- ← CRÍTICO
  AND status NOT IN ('cancelled', 'refunded')
```

#### 5.2 **Cash sessions expected_cash**
```sql
-- ¿Incluye órdenes canceladas?
SELECT SUM(o.total_amount)
FROM orders o
WHERE o.session_id = cs.id
  AND o.payment_method = 'cash'
```

**DEBE SER:**
```sql
AND o.is_paid = true
AND o.status NOT IN ('cancelled', 'refunded')
```

### **Auditoría Necesaria:**

```sql
-- Query para detectar inflación:
WITH metrics_comparison AS (
    SELECT
        'Including Pending' as metric_type,
        SUM(total_amount) as revenue
    FROM orders
    WHERE DATE(created_at) = CURRENT_DATE
      AND payment_method = 'cash'

    UNION ALL

    SELECT
        'Only Paid',
        SUM(total_amount)
    FROM orders
    WHERE DATE(created_at) = CURRENT_DATE
      AND payment_method = 'cash'
      AND is_paid = true
      AND status NOT IN ('cancelled', 'refunded')
)
SELECT
    *,
    ABS((SELECT revenue FROM metrics_comparison WHERE metric_type = 'Including Pending') -
        (SELECT revenue FROM metrics_comparison WHERE metric_type = 'Only Paid')) as inflation_amount
FROM metrics_comparison;
```

### **Solución:**

**CRÍTICO - Revisar TODOS los RPCs de métricas:**

```sql
-- Lista de funciones a auditar:
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
  AND (
      routine_name LIKE '%financial%'
      OR routine_name LIKE '%metrics%'
      OR routine_name LIKE '%stats%'
      OR routine_name LIKE '%revenue%'
  )
ORDER BY routine_name;
```

**Prioridad:** 🟡 **MEDIA-ALTA** (afecta reporting, no integridad)
**Esfuerzo:** 3-4 horas (audit todas las queries)

---

## 🟡 **RIESGO #6: Storage Path Inconsistente**

### **Descripción del Problema:**
Upload de archivo sin `{store_id}/` en path → RLS policy bloquea "random".

### **RLS Policy Actual:**
```sql
-- Storage policy (aplicada):
CREATE POLICY "staff_upload_own_store_images"
ON storage.objects FOR INSERT
USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = (
        SELECT store_id::text FROM profiles WHERE id = auth.uid()
    )
);
```

**Path esperado:** `product-images/{store_id}/{filename}.jpg`
**Path problemático:** `product-images/{filename}.jpg` ← **RECHAZADO**

### **Código de Upload a Auditar:**

```typescript
// Buscar todos los uploads:
const { data, error } = await supabase.storage
    .from('product-images')
    .upload(`${filename}`, file);  // ← MALO: sin store_id

// DEBE SER:
.upload(`${storeId}/${filename}`, file);
```

### **Auditoría:**

```bash
grep -r "supabase.storage" --include="*.tsx" --include="*.ts" | grep -v "store_id"
```

### **Solución:**

**Wrapper obligatorio:**
```typescript
// lib/storage.ts
export async function uploadStoreFile(
    bucket: string,
    filename: string,
    file: File,
    storeId: string
) {
    const path = `${storeId}/${Date.now()}_${filename}`;
    return supabase.storage.from(bucket).upload(path, file);
}
```

**Prioridad:** 🟡 **MEDIA** (UX afectada si falla upload)
**Esfuerzo:** 2 horas (refactor uploads)

---

## 🔴 **RIESGO #7: Realtime Fuga de Datos**

### **Descripción del Problema:**
Cliente se subscribe a channel sin filtro → ve órdenes de otras tiendas.

### **Código a Auditar:**

```typescript
// MALO:
supabase
    .channel('orders_realtime')
    .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders'
    }, (payload) => {
        // ← Recibe TODAS las órdenes (RLS no aplica en realtime)
    })
    .subscribe();

// BUENO:
supabase
    .channel(`orders_realtime_${storeId}`)
    .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `store_id=eq.${storeId}`  // ← CRÍTICO
    }, (payload) => {
        // Solo órdenes de esta tienda
    })
    .subscribe();
```

### **Subscriptions a Auditar:**

```bash
grep -r "\.on('postgres_changes'" --include="*.tsx" --include="*.ts"
```

### **Verificación:**

```sql
-- Tabla de realtime broadcast (si existe):
SELECT
    channel_name,
    COUNT(*) as message_count,
    COUNT(DISTINCT user_id) as unique_subscribers
FROM realtime.messages
WHERE created_at > NOW() - interval '1 hour'
GROUP BY channel_name;
```

### **Solución:**

**CRÍTICO - Audit de subscriptions:**

```typescript
// Pattern enforcement:
export function subscribeToStoreTable<T>(
    table: string,
    storeId: string,
    callback: (payload: T) => void
) {
    return supabase
        .channel(`${table}_${storeId}`)
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table,
            filter: `store_id=eq.${storeId}`
        }, callback)
        .subscribe();
}
```

**Prioridad:** 🔴 **CRÍTICA** (security breach)
**Esfuerzo:** 3-4 horas (audit + refactor)

---

## 🟢 **RIESGO #8: Bloat de Audit Tables**

### **Descripción del Problema:**
Tablas de audit crecen sin límite → queries lentas.

### **Tablas Afectadas:**

```sql
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
    (SELECT COUNT(*) FROM stock_movements) as stock_movements_rows,
    (SELECT COUNT(*) FROM wallet_ledger) as wallet_ledger_rows,
    (SELECT COUNT(*) FROM stock_alerts) as stock_alerts_rows,
    (SELECT COUNT(*) FROM cash_movements) as cash_movements_rows
FROM pg_tables
WHERE tablename IN ('stock_movements', 'wallet_ledger', 'stock_alerts', 'cash_movements');
```

### **Proyección de Crecimiento:**

**Asumiendo:**
- 500 órdenes/día
- Promedio 3 items/orden
- 30% editadas (1 compensación)
- 10% canceladas (rollback)

**Stock_movements por día:**
```
500 orders × 3 items × 2 movements (deduct + auto) = 3,000
500 × 30% edits × 3 items = 450 compensations
500 × 10% cancels × 3 items = 150 rollbacks
---
Total: ~3,600 rows/día
```

**En 1 año:** 1.3M rows
**En 3 años:** 4M rows (sin indexes = queries lentas)

### **Solución:**

#### 8.1 **Partitioning por mes:**
```sql
CREATE TABLE stock_movements (
    id UUID DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    ...
) PARTITION BY RANGE (created_at);

CREATE TABLE stock_movements_2026_02 PARTITION OF stock_movements
FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- Auto-create partitions:
CREATE OR REPLACE FUNCTION create_monthly_partition()
RETURNS void AS $$
DECLARE
    start_date DATE := date_trunc('month', NOW() + interval '1 month');
    end_date DATE := start_date + interval '1 month';
    partition_name TEXT := 'stock_movements_' || to_char(start_date, 'YYYY_MM');
BEGIN
    EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF stock_movements
         FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
    );
END;
$$ LANGUAGE plpgsql;

-- Cron job: ejecutar mensualmente
```

#### 8.2 **Cleanup de alertas viejas:**
```sql
-- Archivar alertas acknowledged > 90 días
CREATE TABLE stock_alerts_archive (LIKE stock_alerts INCLUDING ALL);

INSERT INTO stock_alerts_archive
SELECT * FROM stock_alerts
WHERE acknowledged = true
  AND acknowledged_at < NOW() - interval '90 days';

DELETE FROM stock_alerts
WHERE acknowledged = true
  AND acknowledged_at < NOW() - interval '90 days';
```

#### 8.3 **Indices selectivos:**
```sql
-- Solo indexar datos recientes:
CREATE INDEX idx_stock_movements_recent
ON stock_movements(created_at DESC, order_id)
WHERE created_at > NOW() - interval '90 days';

-- Drop index viejo:
DROP INDEX IF EXISTS idx_stock_movements_created_at;
```

### **Acción:**

**Job mensual (pg_cron o Edge Function scheduled):**
```sql
-- cleanup_audit_tables.sql
BEGIN;
    -- 1. Archivar alertas viejas
    INSERT INTO stock_alerts_archive
    SELECT * FROM stock_alerts
    WHERE acknowledged = true AND acknowledged_at < NOW() - interval '90 days';

    DELETE FROM stock_alerts
    WHERE acknowledged = true AND acknowledged_at < NOW() - interval '90 days';

    -- 2. Vacuum
    VACUUM ANALYZE stock_movements;
    VACUUM ANALYZE wallet_ledger;
    VACUUM ANALYZE stock_alerts;
COMMIT;
```

**Prioridad:** 🟢 **BAJA-MEDIA** (no urgente, pero previene problema futuro)
**Esfuerzo:** 4-6 horas (partitioning + cron setup)

---

## 📊 **PLAN DE ACCIÓN PRIORIZADO**

### **🔴 CRÍTICO (Hacer ANTES de go-live):**

1. **Riesgo #3: Idempotencia**
   - Agregar constraints UNIQUE en wallet_ledger, loyalty_transactions
   - Esfuerzo: 1h
   - Testing: Enviar webhook duplicado

2. **Riesgo #7: Realtime fuga**
   - Audit de subscriptions
   - Forzar filter `store_id=eq.{storeId}`
   - Esfuerzo: 3-4h
   - Testing: 2 usuarios diferentes tiendas

### **🟡 ALTA (Primera semana post-launch):**

3. **Riesgo #1: NOWAIT retry**
   - Implementar `retryRpc()` wrapper
   - Esfuerzo: 2-3h
   - Testing: 2 tablets + mismo producto

4. **Riesgo #5: Métricas infladas**
   - Auditar RPCs de financial_metrics
   - Agregar filtros `is_paid = true`
   - Esfuerzo: 3-4h
   - Testing: Comparar revenue con/sin filtro

5. **Riesgo #6: Storage paths**
   - Refactor uploads con wrapper
   - Esfuerzo: 2h
   - Testing: Upload sin store_id debe fallar

### **🟢 MEDIA (Primer mes):**

6. **Riesgo #4: Trigger loops**
   - Crear view `monitoring_trigger_loops`
   - Revisar semanalmente
   - Esfuerzo: 1h

7. **Riesgo #2: Deadlocks alternativos**
   - Query de auditoría batch adjustments
   - Revisar mensualmente
   - Esfuerzo: 1h

8. **Riesgo #8: Bloat**
   - Setup partitioning (opcional)
   - Cleanup job mensual
   - Esfuerzo: 4-6h

---

## 📈 **RATING AJUSTADO**

| Condición | Rating |
|-----------|--------|
| **Sin mitigaciones** | 8.5/10 ⚠️ |
| **Con críticos (1,7)** | 9.2/10 ✅ |
| **Con alta (1,5,6,7)** | 9.5/10 ✅ |
| **Con todos** | 9.7/10 🏆 |

---

## 📋 **CHECKLIST PRE-GO-LIVE**

```
[ ] Riesgo #3: UNIQUE constraints en wallet/loyalty
[ ] Riesgo #7: Audit de realtime subscriptions
[ ] Riesgo #1: Retry wrapper para LOCK_TIMEOUT
[ ] Riesgo #5: Audit de financial_metrics RPC
[ ] Riesgo #6: Storage upload wrapper
[ ] Crear monitoring views (trigger_loops, etc)
[ ] Documentar runbook de troubleshooting
[ ] Setup alerting (Discord/Slack cuando monitoring_wallet_integrity != empty)
```

---

**Fin del Análisis de Riesgos**
