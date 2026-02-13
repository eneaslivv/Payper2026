# 💰 WALLET LEDGER - PLAN DE IMPLEMENTACIÓN POST-MVP

**Fecha:** 2026-02-13
**Contexto:** Sistema funcional con topups manuales (admin) pero sin audit trail
**Objetivo:** Implementar ledger completo para compliance y auditabilidad
**Prioridad:** POST-MVP (no bloqueante para go-live)

---

## 📊 **ESTADO ACTUAL (MVP)**

### ✅ Lo que funciona:
- Topups manuales desde admin → UPDATE directo a `clients.wallet_balance`
- Pagos con wallet → Resta de balance directo
- Refunds automáticos → Triggers actualizan balance
- P2P transfers → `p2p_wallet_transfer()` actualiza balances
- RLS multi-tenant correctamente implementado

### ❌ Lo que falta (para auditoría completa):
- **NO hay audit trail** de transacciones
- **NO hay source of truth** inmutable
- **NO se puede reconciliar** con contabilidad externa
- **Difícil investigar** discrepancias o disputas

---

## 🎯 **FASES DE IMPLEMENTACIÓN**

### **FASE 1: Setup Infraestructura** (2-3 horas)
**Sin impacto en producción** - Solo preparación

#### 1.1: Decidir tabla principal
**Opción A:** `wallet_ledger` (más completa, ideal para auditoria)
```sql
-- Campos actuales:
wallet_id UUID
amount NUMERIC
entry_type TEXT (payment, refund, topup, p2p_send, p2p_receive)
reference_id UUID (order_id, transfer_id, etc)
reference_type TEXT
idempotency_key TEXT
balance_after NUMERIC -- ← calculado post-insert
created_at TIMESTAMPTZ
```

**Opción B:** `wallet_transactions` (más simple)
```sql
-- Campos actuales:
client_id UUID
amount NUMERIC
type TEXT
status TEXT (pending, completed, failed)
payment_method TEXT
mp_payment_id TEXT
```

**✅ RECOMENDACIÓN:** Usar `wallet_ledger` (arquitectura double-entry más robusta)

#### 1.2: Crear índices adicionales
```sql
CREATE INDEX idx_wallet_ledger_created
ON wallet_ledger(wallet_id, created_at DESC);

CREATE INDEX idx_wallet_ledger_reference
ON wallet_ledger(reference_type, reference_id)
WHERE reference_id IS NOT NULL;
```

---

### **FASE 2: Migrar Lógica de Topups** (4-6 horas)
**Impacto:** Bajo - Solo afecta admin topups

#### 2.1: Crear RPC `topup_wallet_with_ledger()`
```sql
CREATE OR REPLACE FUNCTION topup_wallet_with_ledger(
    p_client_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_staff_id UUID;
    v_store_id UUID;
    v_new_balance NUMERIC;
BEGIN
    -- 1. Validar permisos (solo admin/manager)
    SELECT id, store_id INTO v_staff_id, v_store_id
    FROM profiles
    WHERE id = auth.uid();

    IF v_staff_id IS NULL THEN
        RETURN jsonb_build_object('success', FALSE,
                                  'error', 'UNAUTHORIZED');
    END IF;

    -- Verificar rol (simplificado, ajustar según tu sistema)
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = v_staff_id
          AND role IN ('admin', 'manager', 'owner')
    ) THEN
        RETURN jsonb_build_object('success', FALSE,
                                  'error', 'INSUFFICIENT_PERMISSIONS');
    END IF;

    -- 2. Validar cliente pertenece al mismo store
    IF NOT EXISTS (
        SELECT 1 FROM clients
        WHERE id = p_client_id AND store_id = v_store_id
    ) THEN
        RETURN jsonb_build_object('success', FALSE,
                                  'error', 'CLIENT_NOT_FOUND');
    END IF;

    -- 3. INSERT en ledger (source of truth)
    INSERT INTO wallet_ledger (
        wallet_id,
        amount,
        entry_type,
        reference_type,
        description,
        performed_by,
        store_id,
        payment_method,
        idempotency_key,
        created_at
    ) VALUES (
        p_client_id,
        p_amount,
        'topup',
        'admin_manual',
        COALESCE(p_notes, 'Carga manual desde admin'),
        v_staff_id,
        v_store_id,
        p_payment_method,
        gen_random_uuid(), -- Para prevenir duplicados en retries
        NOW()
    );

    -- 4. Balance se actualiza vía trigger (ver Fase 3)

    SELECT wallet_balance INTO v_new_balance
    FROM clients WHERE id = p_client_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'new_balance', v_new_balance,
        'message', 'Saldo cargado exitosamente'
    );
END;
$$;
```

#### 2.2: Actualizar Admin UI
```typescript
// Reemplazar en admin dashboard:
// ANTES:
await supabase
  .from('clients')
  .update({ wallet_balance: newBalance })
  .eq('id', clientId);

// DESPUÉS:
const { data, error } = await supabase.rpc('topup_wallet_with_ledger', {
  p_client_id: clientId,
  p_amount: topupAmount,
  p_payment_method: 'cash', // o 'card', 'transfer'
  p_notes: staffNotes
});
```

---

### **FASE 3: Trigger Automático de Balance** (2 horas)
**Crítico:** Balance siempre sincronizado con ledger

```sql
-- Función que actualiza balance desde ledger
CREATE OR REPLACE FUNCTION sync_wallet_balance_from_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_balance NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Calcular nuevo balance desde ledger
    SELECT COALESCE(SUM(amount), 0) INTO v_new_balance
    FROM wallet_ledger
    WHERE wallet_id = NEW.wallet_id;

    -- Actualizar clients.wallet_balance (denormalizado)
    UPDATE clients
    SET wallet_balance = v_new_balance
    WHERE id = NEW.wallet_id;

    -- Opcional: Guardar balance_after para auditoria
    NEW.balance_after := v_new_balance;

    RETURN NEW;
END;
$$;

-- Trigger que se dispara en cada INSERT a ledger
CREATE TRIGGER trg_update_balance_from_ledger
BEFORE INSERT ON wallet_ledger
FOR EACH ROW
EXECUTE FUNCTION sync_wallet_balance_from_ledger();
```

**Ventaja:** `clients.wallet_balance` ahora es **READ-ONLY** (solo se actualiza vía trigger)

---

### **FASE 4: Migrar Refund Triggers** (3-4 horas)
**Impacto:** Medio - Afecta cancelaciones de órdenes

#### 4.1: Actualizar trigger de refund completo
```sql
CREATE OR REPLACE FUNCTION wallet_refund_on_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    v_refund_amount NUMERIC;
BEGIN
    -- GUARD: Solo si pagó con wallet y está cancelando
    IF NEW.payment_method != 'wallet'
       OR NEW.is_paid != TRUE
       OR NEW.status != 'cancelled' THEN
        RETURN NEW;
    END IF;

    -- GUARD: Evitar refund duplicado
    IF EXISTS (
        SELECT 1 FROM wallet_ledger
        WHERE reference_id = NEW.id
          AND entry_type = 'refund'
    ) THEN
        RETURN NEW; -- Ya se hizo refund
    END IF;

    v_refund_amount := NEW.total_amount;

    -- ANTES (INCORRECTO):
    -- UPDATE clients SET wallet_balance = wallet_balance + v_refund_amount

    -- DESPUÉS (CORRECTO):
    INSERT INTO wallet_ledger (
        wallet_id,
        amount,
        entry_type,
        reference_id,
        reference_type,
        description,
        store_id,
        idempotency_key
    ) VALUES (
        NEW.client_id,
        v_refund_amount, -- positivo (suma al balance)
        'refund',
        NEW.id,
        'order',
        'Reembolso por cancelación de orden #' || NEW.order_number,
        NEW.store_id,
        gen_random_uuid()
    );
    -- Balance se actualiza automáticamente vía trigger

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

#### 4.2: Actualizar trigger de partial refund
```sql
CREATE OR REPLACE FUNCTION wallet_partial_refund_on_edit()
RETURNS TRIGGER AS $$
DECLARE
    v_refund_amount NUMERIC;
BEGIN
    -- GUARD: Solo si bajó el total y pagó con wallet
    IF NEW.payment_method != 'wallet' THEN RETURN NEW; END IF;
    IF NEW.total_amount >= OLD.total_amount THEN RETURN NEW; END IF;

    v_refund_amount := OLD.total_amount - NEW.total_amount;

    -- Escribir a ledger (balance se actualiza vía trigger)
    INSERT INTO wallet_ledger (
        wallet_id, amount, entry_type, reference_id, reference_type,
        description, store_id, idempotency_key
    ) VALUES (
        NEW.client_id,
        v_refund_amount,
        'partial_refund',
        NEW.id,
        'order_edit',
        'Reembolso parcial por edición de orden',
        NEW.store_id,
        gen_random_uuid()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

### **FASE 5: Migrar P2P Transfer** (2 horas)
```sql
CREATE OR REPLACE FUNCTION p2p_wallet_transfer(
    p_recipient_email TEXT,
    p_amount NUMERIC
)
RETURNS JSONB AS $$
DECLARE
    v_sender_id UUID;
    v_recipient_id UUID;
    v_transfer_id UUID;
BEGIN
    -- Validaciones existentes...

    v_transfer_id := gen_random_uuid();

    -- ANTES (INCORRECTO):
    -- UPDATE clients SET wallet_balance = wallet_balance - p_amount...

    -- DESPUÉS (CORRECTO):
    -- 1. Ledger entry para sender (negativo)
    INSERT INTO wallet_ledger (
        wallet_id, amount, entry_type, reference_id, reference_type,
        description, store_id, idempotency_key
    ) VALUES (
        v_sender_id,
        -p_amount, -- negativo
        'p2p_send',
        v_transfer_id,
        'p2p_transfer',
        'Transferencia a ' || p_recipient_email,
        v_store_id,
        v_transfer_id || '_sender'
    );

    -- 2. Ledger entry para recipient (positivo)
    INSERT INTO wallet_ledger (
        wallet_id, amount, entry_type, reference_id, reference_type,
        description, store_id, idempotency_key
    ) VALUES (
        v_recipient_id,
        p_amount, -- positivo
        'p2p_receive',
        v_transfer_id,
        'p2p_transfer',
        'Recibido de sender',
        v_store_id,
        v_transfer_id || '_recipient'
    );

    -- Balances se actualizan vía trigger

    RETURN jsonb_build_object('success', TRUE);
END;
$$ LANGUAGE plpgsql;
```

---

### **FASE 6: Backfill Data Existente** (1-2 horas)
**Crítico:** Crear ledger entries para balances actuales

```sql
-- OPCIÓN A: Crear entry única "balance_initial" por cliente
INSERT INTO wallet_ledger (
    wallet_id,
    amount,
    entry_type,
    reference_type,
    description,
    store_id,
    idempotency_key,
    created_at
)
SELECT
    c.id,
    c.wallet_balance,
    'migration_backfill',
    'initial_balance',
    'Balance inicial migrado desde sistema legacy',
    c.store_id,
    gen_random_uuid(),
    c.created_at
FROM clients c
WHERE c.wallet_balance > 0;

-- OPCIÓN B: Si tienes historial de órdenes/topups, reconstruir:
-- (Más complejo, requiere análisis de orders históricos)
```

---

### **FASE 7: Testing y Validación** (2-3 horas)

#### 7.1: Test Suite
```sql
-- Test 1: Topup crea ledger entry
SELECT topup_wallet_with_ledger(
    'client-test-id'::UUID,
    100.00,
    'cash',
    'Test topup'
);

SELECT COUNT(*) FROM wallet_ledger
WHERE wallet_id = 'client-test-id'
  AND entry_type = 'topup'
  AND amount = 100;
-- Expected: 1

-- Test 2: Balance = SUM(ledger)
SELECT
    c.wallet_balance as cached,
    COALESCE(SUM(wl.amount), 0) as ledger_sum,
    ABS(c.wallet_balance - COALESCE(SUM(wl.amount), 0)) as diff
FROM clients c
LEFT JOIN wallet_ledger wl ON wl.wallet_id = c.id
GROUP BY c.id, c.wallet_balance
HAVING ABS(c.wallet_balance - COALESCE(SUM(wl.amount), 0)) > 0.01;
-- Expected: 0 rows (perfect integrity)

-- Test 3: Refund idempotente
UPDATE orders SET status = 'cancelled'
WHERE id = 'test-order-id';
-- Ejecutar 2 veces

SELECT COUNT(*) FROM wallet_ledger
WHERE reference_id = 'test-order-id'
  AND entry_type = 'refund';
-- Expected: 1 (no duplicado)
```

---

## 📊 **MONITORING POST-IMPLEMENTACIÓN**

### Query Diaria:
```sql
-- Verificar integridad wallet
SELECT * FROM monitoring_wallet_integrity;
-- Debe estar VACÍO siempre
```

### Query Semanal:
```sql
-- Top 10 transacciones por monto
SELECT
    entry_type,
    COUNT(*) as tx_count,
    SUM(amount) as total_amount,
    AVG(amount) as avg_amount
FROM wallet_ledger
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY entry_type
ORDER BY total_amount DESC;
```

---

## ⏱️ **TIMELINE ESTIMADO**

| Fase | Tiempo | Bloqueante | Riesgo |
|------|--------|------------|--------|
| 1. Setup | 2-3h | No | Bajo |
| 2. Topups Admin | 4-6h | No | Bajo |
| 3. Trigger Balance | 2h | **Sí** | Medio |
| 4. Refund Triggers | 3-4h | **Sí** | Medio |
| 5. P2P Transfer | 2h | No | Bajo |
| 6. Backfill | 1-2h | No | Bajo |
| 7. Testing | 2-3h | **Sí** | Alto |
| **TOTAL** | **16-22h** | | |

**Timeline:** 2-3 días de desarrollo + 1 día testing

---

## 🚦 **DECISIÓN: GO-LIVE SIN LEDGER?**

### ✅ **PUEDE IR A PRODUCCIÓN SI:**
1. Topups solo los hace admin (controlado)
2. Volumen de transacciones wallet < 100/día
3. No hay requisitos legales de audit trail inmediato
4. Se implementa ledger en primeras 2-4 semanas post-launch

### ❌ **NO IR A PRODUCCIÓN SI:**
1. Alto volumen de transacciones wallet
2. Requisitos fiscales/legales de auditabilidad
3. Integración con contabilidad externa
4. Programa de lealtad crítico para negocio

---

## 📝 **RECOMENDACIÓN FINAL**

**Para MVP/Soft Launch:**
- ✅ **GO** con wallet actual (topups manuales admin)
- ⏰ **Implementar ledger en Sprint 1 post-launch**
- 📊 **Monitorear volumen de transacciones**
- 🔄 **Backfill ledger antes de auditoría fiscal**

**Prioridad:** **MEDIA-ALTA** (no bloqueante pero importante)

**Riesgo Actual:** **BAJO-MEDIO** (controlado por admin, volumen bajo)

---

**Autor:** Claude AI
**Fecha:** 2026-02-13
**Versión:** 1.0
