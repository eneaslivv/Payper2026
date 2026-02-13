# 🚀 INSTRUCCIONES PARA APLICAR SQL A SUPABASE

**Archivo:** `APPLY_MIGRATIONS_MANUAL.sql`
**Tiempo estimado:** 3-5 minutos
**Método:** Supabase Dashboard (recomendado)

---

## ✅ MÉTODO 1: Supabase Dashboard (RECOMENDADO)

### Paso 1: Acceder al SQL Editor
1. Ir a https://supabase.com/dashboard
2. Seleccionar proyecto: **rzotggdrauaoslvrzkco**
3. En el menú izquierdo, click en **SQL Editor**

### Paso 2: Crear Nueva Query
1. Click en **"New query"** o el botón **"+"**
2. Se abre un editor SQL vacío

### Paso 3: Copiar y Pegar SQL
1. Abrir archivo: `APPLY_MIGRATIONS_MANUAL.sql`
2. **Seleccionar TODO** el contenido (Ctrl+A)
3. **Copiar** (Ctrl+C)
4. **Pegar** en el SQL Editor de Supabase (Ctrl+V)

### Paso 4: Ejecutar
1. Click en botón **"Run"** o presionar **Ctrl+Enter**
2. **Esperar** 30-60 segundos (puede tardar un poco)
3. Scroll down para ver los **resultados**

### Paso 5: Verificar Resultados
Deberías ver al final del output:

```
✅ monitoring_wallet_integrity: 16 rows (esperado - ledger no implementado)
✅ monitoring_cash_session_reconciliation: 0-X rows
✅ monitoring_stock_rollback_audit: 0-X rows
✅ monitoring_active_orders_integrity: 0 rows (DEBE SER 0)
✅ monitoring_idempotency_violations: 0 rows (DEBE SER 0)
✅ retry_metrics table exists: PASS
✅ log_retry_metric function exists: PASS
```

**CRÍTICO:** Las siguientes DEBEN ser 0:
- monitoring_active_orders_integrity
- monitoring_idempotency_violations

Si alguna tiene rows, investigar antes de continuar.

---

## ⚠️ MÉTODO 2: Si el SQL Editor Falla (Alternativa)

Si el archivo es muy grande para el editor, ejecutar en partes:

### Parte 1: Monitoring Views (Líneas 1-120)
```sql
-- Copiar desde línea 1 hasta línea 120
-- (desde "PARTE 1: MONITORING VIEWS" hasta final de GRANT)
-- Run
```

### Parte 2: Retry Metrics Table (Líneas 121-260)
```sql
-- Copiar desde línea 121 hasta línea 260
-- (desde "PARTE 2: RETRY METRICS TABLE" hasta analytics views)
-- Run
```

### Parte 3: Verificación (Líneas 261-340)
```sql
-- Copiar desde línea 261 hasta final
-- (queries de verificación)
-- Run
```

---

## 🔍 TROUBLESHOOTING

### Error: "relation already exists"
**Solución:** Ignorar - las views ya existen, está bien

### Error: "column does not exist"
**Problema:** Schema no coincide con lo esperado
**Solución:**
1. Verificar que tabla existe: `SELECT * FROM <table_name> LIMIT 1;`
2. Si no existe, revisar migrations anteriores
3. Reportar en chat para ajustar query

### Error: "permission denied"
**Problema:** Usuario no tiene permisos
**Solución:**
1. Verificar que estás logueado como owner del proyecto
2. Si persiste, usar service_role key (NO RECOMENDADO para production)

### Warning: "function already exists"
**Solución:** Ignorar - el script usa `CREATE OR REPLACE`

---

## ✅ POST-EJECUCIÓN: Verificar que Funciona

### Query 1: Verificar Views Creadas
```sql
SELECT table_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name LIKE 'monitoring_%'
ORDER BY table_name;
```

**Expected Output:**
```
monitoring_active_orders_integrity
monitoring_cash_session_reconciliation
monitoring_idempotency_violations
monitoring_stock_rollback_audit
monitoring_wallet_integrity
```

---

### Query 2: Verificar Tabla retry_metrics
```sql
SELECT COUNT(*) as total_rows
FROM retry_metrics;
```

**Expected:** `0` (tabla vacía al inicio)

---

### Query 3: Verificar Función log_retry_metric
```sql
SELECT proname, pronargs
FROM pg_proc
WHERE proname = 'log_retry_metric';
```

**Expected:** 1 row con `log_retry_metric` y `5` args

---

### Query 4: Test Función (Opcional)
```sql
-- Insertar un test metric
SELECT log_retry_metric(
    'test_rpc',      -- p_rpc_name
    2,               -- p_attempts
    'success',       -- p_final_status
    450,             -- p_duration_ms
    NULL             -- p_error_code
);

-- Verificar que se insertó
SELECT * FROM retry_metrics
WHERE rpc_name = 'test_rpc';

-- Limpiar test
DELETE FROM retry_metrics
WHERE rpc_name = 'test_rpc';
```

---

## 📊 QUERIES DE MONITOREO (Post-Deploy)

### Query Daily - Ejecutar 2x/día

```sql
-- 1. Idempotency Violations (CRÍTICO - debe ser 0)
SELECT * FROM monitoring_idempotency_violations;
-- Expected: 0 rows SIEMPRE

-- 2. Active Orders Integrity (CRÍTICO - debe ser 0)
SELECT * FROM monitoring_active_orders_integrity;
-- Expected: 0 rows SIEMPRE

-- 3. Retry Success Rate (después de tener tráfico)
SELECT * FROM analytics_retry_success_rate_daily
WHERE date >= CURRENT_DATE - 1
ORDER BY date DESC;
-- Target: success_rate > 95%

-- 4. Stock Rollback Audit
SELECT * FROM monitoring_stock_rollback_audit
WHERE audit_status LIKE '%INCOMPLETO%';
-- Expected: 0 rows

-- 5. Cash Session Reconciliation
SELECT * FROM monitoring_cash_session_reconciliation
WHERE audit_status LIKE '%CRÍTICO%';
-- Expected: 0 rows (después de cerrar primera sesión)
```

---

## 🚨 ROLLBACK (Si algo sale mal)

Si necesitas revertir las changes:

```sql
-- Eliminar Views
DROP VIEW IF EXISTS monitoring_wallet_integrity CASCADE;
DROP VIEW IF EXISTS monitoring_cash_session_reconciliation CASCADE;
DROP VIEW IF EXISTS monitoring_stock_rollback_audit CASCADE;
DROP VIEW IF EXISTS monitoring_active_orders_integrity CASCADE;
DROP VIEW IF EXISTS monitoring_idempotency_violations CASCADE;
DROP VIEW IF EXISTS analytics_retry_success_rate_daily CASCADE;
DROP VIEW IF EXISTS analytics_retry_by_rpc CASCADE;
DROP VIEW IF EXISTS analytics_retry_errors CASCADE;

-- Eliminar Tabla retry_metrics
DROP TABLE IF EXISTS retry_metrics CASCADE;

-- Eliminar Funciones
DROP FUNCTION IF EXISTS log_retry_metric CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_retry_metrics CASCADE;
```

---

## ✅ CHECKLIST FINAL

Después de ejecutar el SQL, verificar:

- [ ] SQL ejecutado sin errores críticos
- [ ] monitoring_active_orders_integrity retorna 0 rows
- [ ] monitoring_idempotency_violations retorna 0 rows
- [ ] retry_metrics table existe (COUNT(*) funciona)
- [ ] log_retry_metric() función existe
- [ ] analytics views creadas (3 views)
- [ ] Test query ejecutada exitosamente

**Si todos los checks pasan:** ✅ **LISTO PARA DEPLOY FRONTEND**

**Si alguno falla:** ⚠️ Revisar error y corregir antes de continuar

---

## 📞 AYUDA

**Si tienes errores:**
1. Copiar el mensaje de error completo
2. Copiar la query que falló
3. Compartir en chat para debug

**Errores comunes y soluciones:**
- "relation does not exist" → Tabla no existe, verificar schema
- "permission denied" → Verificar permisos de usuario
- "syntax error" → Revisar que se copió completo el SQL

---

**Preparado por:** Claude AI
**Fecha:** 2026-02-13
**Siguiente paso:** Deploy frontend después de verificar ✅
