# 🚀 APLICAR MIGRATION CRÍTICA - MÉTODO DEFINITIVO

## ✅ Paso 1: Copiar el SQL

El archivo completo está aquí:
```
C:\Users\eneas\Downloads\livv\Payper\coffe payper\migration_safe_critical_fixes.sql
```

## ✅ Paso 2: Ir a Supabase Dashboard

**Link directo:**
https://supabase.com/dashboard/project/huwuwdghczpxfzkdvohz/sql/new

## ✅ Paso 3: Abrir el archivo y copiar TODO

1. Abre: `migration_safe_critical_fixes.sql`
2. Presiona `Ctrl+A` (seleccionar todo)
3. Presiona `Ctrl+C` (copiar)

## ✅ Paso 4: Pegar y Ejecutar en Dashboard

1. En el SQL Editor de Supabase
2. Pega el contenido (`Ctrl+V`)
3. Click en **"RUN"** ▶️

## ✅ Paso 5: Verificar Resultados

Deberías ver estos mensajes:

```
✅ SUCCESS: UNIQUE constraint on clients(email, store_id) verified
```

Y una tabla mostrando:
```
function_name                | arg_count | lock_status
-----------------------------|-----------|-------------
consume_from_open_packages   | 3         | ✅ HAS LOCK
decrease_stock_atomic        | 5         | ✅ HAS LOCK
```

---

## 🎯 ¿Qué hace esta migration?

### P0 CRITICAL - Race Conditions ELIMINADAS:

**ANTES (Vulnerable):**
```sql
FOR v_pkg IN SELECT * FROM open_packages ...
LOOP
    -- ⚠️ Otro mesero puede modificar aquí
    UPDATE open_packages ...
END LOOP;
```

**DESPUÉS (Protegido):**
```sql
FOR v_pkg IN SELECT * FROM open_packages ... FOR UPDATE
LOOP
    -- ✅ BLOQUEADO - nadie más puede tocar
    UPDATE open_packages ...
END LOOP;
```

### P0 CRITICAL - Clientes Duplicados BLOQUEADOS:

**ANTES:**
```sql
-- Se permitía esto:
INSERT INTO clients (email, store_id) VALUES ('juan@test.com', 'store-1');
INSERT INTO clients (email, store_id) VALUES ('juan@test.com', 'store-1'); -- ✅ OK (MALO)
```

**DESPUÉS:**
```sql
-- Ahora esto falla:
INSERT INTO clients (email, store_id) VALUES ('juan@test.com', 'store-1');
INSERT INTO clients (email, store_id) VALUES ('juan@test.com', 'store-1'); -- ❌ ERROR (BUENO)
```

---

## ⚡ Beneficios Inmediatos

- ✅ **Stock consumption thread-safe** - Múltiples meseros pueden vender al mismo tiempo sin corromper stock
- ✅ **No más clientes duplicados** - Un email = un cliente por tienda
- ✅ **Zero downtime** - Cambios compatibles con código actual
- ✅ **Instant effect** - Funciona inmediatamente después de aplicar

---

## 🔍 Si algo falla...

### Error: "duplicate key value violates unique constraint"

**Causa:** Ya tienes clientes duplicados en la base de datos.

**Solución:**
```sql
-- Encontrar duplicados:
SELECT email, store_id, COUNT(*) as count, STRING_AGG(id::text, ', ') as client_ids
FROM clients
WHERE email IS NOT NULL
GROUP BY email, store_id
HAVING COUNT(*) > 1;

-- Para cada duplicado:
-- 1. Elige cuál mantener (el más reciente, con más datos, etc.)
-- 2. Transfiere orders/wallet_balance del duplicado al correcto
-- 3. Elimina el duplicado
-- 4. Re-ejecuta la migration
```

### Warning: "UNIQUE constraint not added"

Es el mismo caso de arriba - hay duplicados. Sigue los pasos de arriba.

---

## 📊 Verificación Post-Aplicación

Ejecuta este query para confirmar que todo funcionó:

```sql
-- Test 1: Verificar UNIQUE constraint
SELECT conname
FROM pg_constraint
WHERE conname = 'unique_client_email_per_store';
-- Debe retornar 1 fila

-- Test 2: Verificar FOR UPDATE en funciones
SELECT
    proname,
    pg_get_functiondef(oid) LIKE '%FOR UPDATE%' as has_lock
FROM pg_proc
WHERE proname IN ('consume_from_open_packages', 'decrease_stock_atomic')
  AND pronamespace = 'public'::regnamespace;
-- Ambas deben mostrar has_lock = true

-- Test 3: Intentar crear duplicado (debe fallar)
BEGIN;
  INSERT INTO clients (email, store_id, name, phone)
  VALUES ('test@duplicate.com', (SELECT id FROM stores LIMIT 1), 'Test', '123');

  INSERT INTO clients (email, store_id, name, phone)
  VALUES ('test@duplicate.com', (SELECT id FROM stores LIMIT 1), 'Duplicate', '456');
  -- Este debe FALLAR con: duplicate key value violates unique constraint
ROLLBACK;
```

---

**LISTO! Esta es la forma más simple y directa de aplicarlo.** 🎉

El archivo `migration_safe_critical_fixes.sql` tiene exactamente 200 líneas de SQL limpio y seguro.
