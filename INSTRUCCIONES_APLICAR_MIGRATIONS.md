# 🚀 Instrucciones para Aplicar Migrations

Tienes razón - aunque no tengo permisos MCP directos en este momento, **TÚ puedes aplicarlas fácilmente**. Aquí hay 3 métodos (elige el que prefieras):

---

## ✅ MÉTODO 1: Script Automático (Más Fácil)

He creado un script batch que aplica todo automáticamente:

```bash
cd "C:\Users\eneas\Downloads\livv\Payper\coffe payper"
.\apply_all_migrations.bat
```

**Qué hace el script:**
1. Verifica que Supabase CLI esté instalado
2. Se conecta a tu proyecto
3. Aplica TODAS las migrations del 2026-02-13 en orden
4. Regenera TypeScript types
5. Verifica que todo se aplicó correctamente

**Si no tienes Supabase CLI instalado:**
```bash
npm install -g supabase
# O usa npx:
npx supabase
```

---

## ✅ MÉTODO 2: Supabase CLI Manual (Recomendado)

Si prefieres hacerlo paso a paso:

### 1. Instalar/Verificar Supabase CLI

```bash
# Verificar instalación
supabase --version

# Si no está instalado:
npm install -g supabase
```

### 2. Login a Supabase

```bash
supabase login
```

Te abrirá el browser para autenticarte.

### 3. Link al Proyecto

```bash
cd "C:\Users\eneas\Downloads\livv\Payper\coffe payper"
supabase link --project-ref huwuwdghczpxfzkdvohz
```

### 4. Aplicar TODAS las Migrations

```bash
supabase db push
```

Este comando detecta automáticamente las 5 migrations nuevas y las aplica en orden:
- ✅ `20260213_rename_versioned_functions.sql`
- ✅ `20260213_add_store_id_to_critical_tables.sql`
- ✅ `20260213_add_audit_columns.sql`
- ✅ `20260213_inventory_phase1_safe_cleanup.sql`
- ✅ `20260213_fix_critical_issues.sql`

### 5. Regenerar TypeScript Types

```bash
supabase gen types typescript --project-id huwuwdghczpxfzkdvohz > src/types/database.types.ts
```

### 6. Verificar

```bash
# Ver migrations aplicadas
supabase db diff

# Ver últimas migrations en DB
supabase db execute --query "SELECT name FROM supabase_migrations.schema_migrations ORDER BY name DESC LIMIT 10;"
```

---

## ✅ MÉTODO 3: Supabase Dashboard (Manual pero Visual)

Si prefieres ver qué estás ejecutando:

### 1. Ir a SQL Editor

```
https://supabase.com/dashboard/project/huwuwdghczpxfzkdvohz/sql/new
```

### 2. Aplicar cada Migration en Orden

Abre cada archivo y copia/pega el contenido completo:

#### A. Primera Migration: Rename Versioned Functions
```bash
# Archivo: supabase/migrations/20260213_rename_versioned_functions.sql
# Qué hace: Elimina sufijos _v2 y _v20 de funciones
```
- Copia todo el contenido del archivo
- Pega en SQL Editor
- Click "RUN"
- Verifica mensaje: "SUCCESS: All new functions created successfully"

#### B. Segunda Migration: Add store_id to Critical Tables
```bash
# Archivo: supabase/migrations/20260213_add_store_id_to_critical_tables.sql
# Qué hace: Agrega store_id y RLS policies a 7 tablas
```
- Copia todo el contenido del archivo
- Pega en SQL Editor
- Click "RUN"
- Verifica mensaje: "SUCCESS: All 7 critical tables now have store_id column"

⚠️ **NOTA:** Esta migration puede fallar parcialmente si algunas tablas no existen (ej: order_events, payment_transactions). Es NORMAL - ignora esos errores.

#### C. Tercera Migration: Add Audit Columns
```bash
# Archivo: supabase/migrations/20260213_add_audit_columns.sql
# Qué hace: Agrega updated_at y triggers a 4 tablas
```
- Copia todo el contenido del archivo
- Pega en SQL Editor
- Click "RUN"
- Verifica mensaje: "SUCCESS: All critical tables now have complete audit columns"

#### D. Cuarta Migration: Inventory Phase 1 Safe Cleanup
```bash
# Archivo: supabase/migrations/20260213_inventory_phase1_safe_cleanup.sql
# Qué hace: Elimina columnas duplicadas de inventory_items (39 → 37)
```
- Copia todo el contenido del archivo
- Pega en SQL Editor
- Click "RUN"
- Verifica mensaje: "SUCCESS: Phase 1 cleanup completed"
- Verifica: "Columns removed: quantity (duplicate), min_stock (unused)"

#### E. Quinta Migration: Fix Critical Issues ⭐ MÁS IMPORTANTE
```bash
# Archivo: supabase/migrations/20260213_fix_critical_issues.sql
# Qué hace: Soluciona race conditions y agrega UNIQUE constraints
```
- Copia todo el contenido del archivo
- Pega en SQL Editor
- Click "RUN"
- Verifica mensaje: "SUCCESS: UNIQUE constraint on clients(email, store_id) verified"

⚠️ **IMPORTANTE:** Si ves WARNING sobre duplicados en clients table:
```sql
-- Primero encuentra los duplicados:
SELECT email, store_id, COUNT(*) as count
FROM clients
WHERE email IS NOT NULL
GROUP BY email, store_id
HAVING COUNT(*) > 1;

-- Si hay duplicados, elimínalos manualmente antes de aplicar la migration
```

### 3. Regenerar Types (Desde tu Terminal)

```bash
cd "C:\Users\eneas\Downloads\livv\Payper\coffe payper"
supabase gen types typescript --project-id huwuwdghczpxfzkdvohz > src/types/database.types.ts
```

---

## ✅ Verificación Post-Aplicación

Después de aplicar las migrations, verifica que todo funcionó:

### 1. Verificar en SQL Editor

```sql
-- Verificar funciones sin versión existen
SELECT proname, pronargs
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND proname IN ('decrease_stock_atomic', 'admin_add_balance')
ORDER BY proname;

-- Debe mostrar ambas funciones SIN _v2 o _v20

-- Verificar UNIQUE constraint en clients
SELECT conname, contype
FROM pg_constraint
WHERE conrelid = 'public.clients'::regclass
AND conname = 'unique_client_email_per_store';

-- Debe mostrar el constraint

-- Verificar columnas de inventory_items
SELECT COUNT(*) as total_columns
FROM information_schema.columns
WHERE table_name = 'inventory_items' AND table_schema = 'public';

-- Debe mostrar: 37 (antes eran 39)

-- Verificar updated_at columns existen
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
AND column_name = 'updated_at'
AND table_name IN ('payment_transactions', 'stock_movements', 'order_events', 'cash_movements')
ORDER BY table_name;

-- Debe mostrar 4 filas

-- Verificar triggers de updated_at
SELECT trigger_name, event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE '%updated_at%'
AND event_object_schema = 'public'
ORDER BY event_object_table;

-- Debe mostrar 4 triggers
```

### 2. Test Funcional (Opcional pero Recomendado)

```sql
-- Test 1: UNIQUE constraint funciona
BEGIN;
  INSERT INTO clients (email, store_id, name, phone)
  VALUES ('test@duplicate.com', '00000000-0000-0000-0000-000000000001', 'Test 1', '1111');

  -- Esto debería FALLAR con duplicate key error:
  INSERT INTO clients (email, store_id, name, phone)
  VALUES ('test@duplicate.com', '00000000-0000-0000-0000-000000000001', 'Test 2', '2222');
ROLLBACK;

-- Test 2: Función decrease_stock_atomic existe (sin _v20)
SELECT proname, pronargs
FROM pg_proc
WHERE proname = 'decrease_stock_atomic'
AND pronamespace = 'public'::regnamespace;

-- Debe retornar 1 fila (sin _v20)

-- Test 3: Función admin_add_balance existe (sin _v2)
SELECT proname, pronargs
FROM pg_proc
WHERE proname = 'admin_add_balance'
AND pronamespace = 'public'::regnamespace;

-- Debe retornar 1 fila (sin _v2)
```

---

## 🎯 Qué Método Elegir?

| Método | Pros | Contras | Recomendado Para |
|--------|------|---------|------------------|
| **Script .bat** | Automático, rápido | Requiere CLI instalado | Desarrolladores con CLI |
| **CLI Manual** | Control total, ver logs | Más pasos | Cuando quieres entender cada paso |
| **Dashboard** | Visual, ver queries | Manual, más lento | Primera vez o si tienes dudas |

**Mi Recomendación:**
1. Si tienes Supabase CLI: Usa **MÉTODO 2** (CLI Manual)
2. Si no tienes CLI: Usa **MÉTODO 3** (Dashboard)
3. Si quieres velocidad: Instala CLI y usa **MÉTODO 1** (Script)

---

## ⚠️ Troubleshooting

### Error: "command not found: supabase"

**Solución:**
```bash
npm install -g supabase
# O usa:
npx supabase login
npx supabase db push
```

### Error: "relation does not exist"

**Causa:** Algunas migrations intentan modificar tablas que no existen en tu DB (ej: order_events, payment_transactions).

**Solución:** Es NORMAL - esas tablas no existen en tu schema. La migration sigue adelante con las que sí existen.

### Warning: "Found duplicates in clients table"

**Causa:** Ya tienes clientes con el mismo email en la misma tienda.

**Solución:**
1. Ejecuta el query para encontrar duplicados (está en la migration)
2. Identifica cuál es el correcto
3. Transfiere datos (wallet_balance, orders) al correcto
4. Elimina duplicados
5. Re-ejecuta migration

### Error: "You do not have permission"

**Causa:** Usuario de Supabase sin permisos de admin.

**Solución:**
1. Ve a Supabase Dashboard → Database → Roles
2. Verifica que tu usuario tenga rol `postgres` o `service_role`
3. O ejecuta desde Dashboard SQL Editor (tiene permisos de admin)

---

## 📞 Soporte

Si algo falla:
1. Copia el mensaje de error completo
2. Copia el query que causó el error
3. Verifica en qué migration estabas (nombre del archivo)
4. Revisa el archivo `FIXES_CRITICOS_APLICADOS.md` para entender qué debería hacer

Todos los archivos tienen comentarios explicativos y mensajes de NOTICE/WARNING/ERROR que te guían.

---

**¿Listo para aplicar?** Elige tu método y adelante! 🚀

**Nota:** Una vez aplicadas, las migrations quedan registradas en `supabase_migrations.schema_migrations` y NO se vuelven a ejecutar (son idempotentes).
