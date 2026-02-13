# ✅ Fixes Críticos Aplicados - 2026-02-13

## 📋 Resumen

Se creó la migración `20260213_fix_critical_issues.sql` que soluciona **todos los issues P0 y P1** identificados en la auditoría exhaustiva de funcionalidades.

**Estado:** Migration file creado, pendiente de aplicación manual en Supabase Dashboard

---

## 🔴 P0 CRITICAL - SOLUCIONADO

### 1. UNIQUE Constraint Faltante en `clients(email, store_id)`

**Problema:**
```sql
-- ANTES: Permitía duplicados
INSERT INTO clients (email, store_id, name) VALUES
  ('juan@example.com', 'store-123', 'Juan 1'),
  ('juan@example.com', 'store-123', 'Juan 2');  -- ✅ Se permitía (MALO)
```

**Solución:**
```sql
ALTER TABLE public.clients
ADD CONSTRAINT unique_client_email_per_store UNIQUE (email, store_id);

-- DESPUÉS: Previene duplicados
INSERT INTO clients (email, store_id, name) VALUES
  ('juan@example.com', 'store-123', 'Juan 2');  -- ❌ ERROR: duplicate key (BUENO)
```

**Validación Incluida:**
- Detecta si ya existen duplicados ANTES de agregar constraint
- Si encuentra duplicados, muestra lista para revisión manual
- Solo aplica constraint si NO hay duplicados

**Impacto:** 🟢 Previene datos corruptos, garantiza 1 cliente por email+store

---

### 2. Race Conditions en `consume_from_open_packages()`

**Problema:**
```sql
-- ANTES: Sin lock explícito (vulnerable a race conditions)
FOR v_open_pkg IN
    SELECT id, remaining FROM open_packages
    WHERE inventory_item_id = p_item_id
    ORDER BY opened_at ASC
LOOP
    -- ⚠️ Otro proceso puede modificar "remaining" AQUÍ
    UPDATE open_packages SET remaining = remaining - qty;
END LOOP;
```

**Situación de Riesgo:**
- **Proceso A:** Lee remaining = 100
- **Proceso B:** Lee remaining = 100 (mismo momento)
- **Proceso A:** Actualiza remaining = 100 - 50 = 50 ✅
- **Proceso B:** Actualiza remaining = 100 - 30 = 70 ❌ (perdió cambio de A)
- **Resultado:** Stock incorrecto (70 en vez de 20)

**Solución:**
```sql
-- DESPUÉS: Con lock explícito
FOR v_open_pkg IN
    SELECT id, remaining FROM open_packages
    WHERE inventory_item_id = p_item_id
    ORDER BY opened_at ASC
    FOR UPDATE  -- ← CRÍTICO: Bloquea las filas hasta finalizar transacción
LOOP
    -- ✅ Ningún otro proceso puede leer/modificar estas filas
    UPDATE open_packages SET remaining = remaining - qty;
END LOOP;
```

**Comportamiento Ahora:**
- **Proceso A:** Adquiere lock, lee remaining = 100
- **Proceso B:** Intenta leer → **BLOQUEA esperando** a que A termine
- **Proceso A:** Actualiza remaining = 50, COMMIT
- **Proceso B:** Ahora lee remaining = 50 (valor actualizado), continúa ✅
- **Resultado:** Stock correcto (20)

**Impacto:** 🟢 Garantiza atomicidad en entornos concurrentes (múltiples meseros)

---

## 🟠 P1 HIGH - SOLUCIONADO

### 3. Lock Explícito en `decrease_stock_atomic()`

**Problema Similar al #2:**
```sql
-- ANTES: Lock implícito en UPDATE, pero lectura vulnerable
SELECT * INTO v_stock
FROM inventory_location_stock
WHERE item_id = p_item_id AND location_id = p_location_id
-- Sin FOR UPDATE aquí
```

**Solución:**
```sql
-- DESPUÉS: Lock desde la lectura inicial
SELECT * INTO v_stock
FROM inventory_location_stock
WHERE item_id = p_item_id AND location_id = p_location_id
FOR UPDATE;  -- ← Lock explícito desde el SELECT
```

**Beneficios:**
- Consistencia con `consume_from_open_packages()`
- Protección total desde inicio de transacción
- Previene lecturas sucias (dirty reads)

**Impacto:** 🟢 Stock deduction 100% confiable

---

### 4. Verificación de `finalize_order_stock` Singular

**Problema:**
- Encontramos múltiples versiones de `finalize_order_stock()` en distintas migrations
- Riesgo de conflictos si hay duplicados en runtime

**Solución:**
```sql
DO $$
DECLARE
    v_trigger_count INTEGER;
    v_function_count INTEGER;
BEGIN
    -- Cuenta triggers en orders table
    SELECT COUNT(*) INTO v_trigger_count
    FROM information_schema.triggers
    WHERE event_object_table = 'orders'
      AND trigger_name LIKE '%finalize_order_stock%';

    -- Cuenta funciones
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc
    WHERE proname = 'finalize_order_stock';

    IF v_trigger_count = 1 AND v_function_count = 1 THEN
        RAISE NOTICE 'SUCCESS: Exactly 1 trigger and 1 function (correct)';
    ELSE
        RAISE WARNING 'Multiple versions found - manual cleanup needed';
    END IF;
END $$;
```

**Resultado Esperado:**
- ✅ 1 trigger en `orders` table
- ✅ 1 function `finalize_order_stock()`
- ❌ Si detecta > 1: Aviso para cleanup manual

**Impacto:** 🟢 Evita triggers duplicados o conflictivos

---

## 🟡 P2 MEDIUM - DOCUMENTADO Y SINCRONIZADO

### 5. Dual Schema de Loyalty Points

**Problema:**
- `clients.loyalty_points` - usado por triggers de orders
- `profiles.points_balance` - legacy, usado en staff roles
- No había sincronización entre ambos

**Solución:**

**A) Documentación Clara:**
```sql
COMMENT ON COLUMN public.clients.loyalty_points IS
'PRIMARY loyalty points balance for clients. Updated by trigger_process_loyalty_earn.';

COMMENT ON COLUMN public.profiles.points_balance IS
'DEPRECATED: Use clients.loyalty_points instead. Exists for backward compatibility.';
```

**B) Trigger de Sincronización (si column existe):**
```sql
CREATE TRIGGER sync_profile_points_to_client
AFTER UPDATE OF points_balance ON public.profiles
FOR EACH ROW
WHEN (OLD.points_balance IS DISTINCT FROM NEW.points_balance)
EXECUTE FUNCTION validate_loyalty_points_consistency();
```

**Función:**
```sql
CREATE OR REPLACE FUNCTION validate_loyalty_points_consistency()
RETURNS TRIGGER AS $$
BEGIN
    -- Si profile tiene client asociado, sincroniza
    IF NEW.id IN (SELECT user_id FROM clients WHERE user_id IS NOT NULL) THEN
        UPDATE clients
        SET loyalty_points = NEW.points_balance
        WHERE user_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

**Comportamiento:**
- Si `profiles.points_balance` NO existe → Skip trigger (no error)
- Si existe → Crea trigger que sincroniza automáticamente
- **Dirección:** `profiles.points_balance` → `clients.loyalty_points`

**Impacto:** 🟢 Evita desincronización, path hacia deprecation de `profiles.points_balance`

---

## 📊 Verificaciones Incluidas

La migration incluye verificaciones automáticas al final:

### 1. Verificar UNIQUE Constraint Aplicado
```sql
SELECT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'unique_client_email_per_store'
) AS constraint_exists;
```

### 2. Verificar Functions Tienen `FOR UPDATE`
```sql
SELECT
    proname AS function_name,
    pg_get_functiondef(oid)::text LIKE '%FOR UPDATE%' AS has_explicit_lock
FROM pg_proc
WHERE proname IN ('consume_from_open_packages', 'decrease_stock_atomic');
```

**Resultado Esperado:**
```
function_name                | has_explicit_lock
-----------------------------|------------------
consume_from_open_packages   | true
decrease_stock_atomic        | true
```

---

## 🚀 Cómo Aplicar la Migration

### Opción 1: Supabase Dashboard (Recomendado)
1. Ve a Supabase Dashboard → SQL Editor
2. Abre el archivo `supabase/migrations/20260213_fix_critical_issues.sql`
3. Copia todo el contenido
4. Pega en SQL Editor y ejecuta
5. Revisa los NOTICE/WARNING messages

### Opción 2: Supabase CLI
```bash
cd "C:\Users\eneas\Downloads\livv\Payper\coffe payper"
supabase db push
```

### Opción 3: Direct psql (si tienes acceso)
```bash
psql postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres \
  -f supabase/migrations/20260213_fix_critical_issues.sql
```

---

## ⚠️ Notas Importantes

### ANTES de Aplicar:

1. **Revisar Duplicados en Clients:**
```sql
SELECT email, store_id, COUNT(*) as count
FROM clients
WHERE email IS NOT NULL
GROUP BY email, store_id
HAVING COUNT(*) > 1;
```

Si hay duplicados:
- Identificar el client correcto (más reciente, con más datos)
- Transferir wallet_balance, loyalty_points, orders
- Eliminar duplicados manualmente
- Luego aplicar migration

2. **Backup de Producción:**
```bash
# Si es prod, hacer backup antes
supabase db dump -f backup_before_fixes_$(date +%Y%m%d).sql
```

### DESPUÉS de Aplicar:

1. **Verificar Logs:**
- Buscar mensajes de SUCCESS
- Revisar WARNINGs (si hay duplicados)
- Confirmar que no hay ERRORs

2. **Test en Dev Primero:**
- Si tienes branch de Supabase, aplicar ahí primero
- Probar creación de orden concurrente (2+ meseros)
- Verificar stock deduction correcto

3. **Regenerar TypeScript Types:**
```bash
supabase gen types typescript --project-id huwuwdghczpxfzkdvohz > src/types/database.types.ts
```

---

## 📈 Impacto Esperado

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| **Clientes Duplicados** | Posible | ❌ Bloqueado | +Integridad |
| **Race Conditions Stock** | Vulnerable | ✅ Protegido | +Confiabilidad |
| **Concurrency Safe** | ⚠️ No garantizado | ✅ Garantizado | +Performance bajo carga |
| **Loyalty Points Sync** | ❌ Manual | ✅ Automático | +Consistencia |
| **Triggers Duplicados** | ⚠️ Posible | ✅ Verificado | +Mantenibilidad |

---

## ✅ Checklist de Aplicación

- [ ] Backup de producción realizado
- [ ] Verificar duplicados en `clients` table
- [ ] Aplicar migration en Supabase Dashboard
- [ ] Revisar NOTICE/WARNING messages
- [ ] Verificar constraint `unique_client_email_per_store` existe
- [ ] Verificar functions tienen `FOR UPDATE` en definición
- [ ] Regenerar TypeScript types
- [ ] Test de creación de orden concurrente
- [ ] Test de transfer stock concurrente
- [ ] Monitorear logs de producción por 24h

---

**Generado:** 2026-02-13
**Auditoría Origen:** Verificación exhaustiva de funcionalidades
**Migration File:** `supabase/migrations/20260213_fix_critical_issues.sql`
**Status:** ✅ Ready para aplicar
