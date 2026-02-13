# 🚀 DEPLOYMENT CHECKLIST - PAYPER PRODUCTION

**Fecha:** 2026-02-13
**Sistema:** Payper Multi-Tenant SaaS
**Rating:** 9.2/10 ⚡
**Decisión:** ✅ GO TO PRODUCTION

---

## 📋 PRE-DEPLOYMENT (Antes de Deploy)

### Backend - Migraciones Pendientes
- [ ] **Aplicar migration:** `20260213_create_monitoring_views.sql`
  ```bash
  # Aplicar vía Supabase CLI o Dashboard
  supabase db push
  ```
  **Crea:**
  - monitoring_wallet_integrity
  - monitoring_cash_session_reconciliation
  - monitoring_stock_rollback_audit
  - monitoring_active_orders_integrity
  - monitoring_idempotency_violations
  - monitoring_rls_coverage

- [ ] **Aplicar migration:** `20260213_create_retry_metrics_table.sql`
  ```bash
  supabase db push
  ```
  **Crea:**
  - retry_metrics table
  - log_retry_metric() RPC
  - analytics_retry_success_rate_daily view
  - analytics_retry_by_rpc view
  - analytics_retry_errors view
  - cleanup_old_retry_metrics() RPC

- [ ] **Verificar migrations aplicadas:**
  ```sql
  SELECT * FROM supabase_migrations.schema_migrations
  ORDER BY version DESC
  LIMIT 10;
  ```
  **Expected:** Ver `20260213_create_monitoring_views` y `20260213_create_retry_metrics_table`

---

### Frontend - Build & Deploy

- [ ] **Verificar código actualizado:**
  - ✅ `src/lib/retryRpc.ts` con telemetría habilitada
  - ✅ `components/StockAdjustmentModal.tsx` con retry
  - ✅ `components/StockTransferModal.tsx` con retry
  - ✅ `components/WalletTransferModal.tsx` con retry
  - ✅ `pages/StoreSettings.tsx` con realtime filter

- [ ] **Build production:**
  ```bash
  npm run build
  # o
  yarn build
  ```
  **Verificar:** No hay errores de TypeScript, build exitoso

- [ ] **Deploy a hosting:**
  ```bash
  # Vercel
  vercel --prod

  # Netlify
  netlify deploy --prod

  # Manual
  # Upload dist/ folder a hosting
  ```

---

### Testing Pre-Producción

- [ ] **TEST-UI-8: Cash Session Full Flow (CRÍTICO)**
  ```
  Setup: Staging environment
  Steps:
    1. Abrir caja: start_amount = $1000
    2. Vender 5 órdenes cash: total = $500
    3. Registrar withdrawal (cambio): -$100
    4. Cerrar caja con real_cash = $1400
  Expected:
    - expected_cash = 1000 + 500 - 100 = $1400
    - difference = $0
  SQL Verification:
    SELECT start_amount, expected_cash, real_cash, difference, status
    FROM cash_sessions
    WHERE id = 'test-session-id';
  ```
  **Status:** ⏳ PENDIENTE - EJECUTAR ANTES DE GO-LIVE

- [ ] **Verificar retry logic funciona:**
  ```
  Setup: 2 staff sessions, mismo inventory item
  Steps:
    1. Staff A: Ajustar stock -10
    2. Staff B: Ajustar stock -5 (simultáneo)
  Expected:
    - Toast: "Stock ocupado, reintentando (1/3)..."
    - Ambos ajustes aplicados
    - Console: [retryRpc] ✅ Success after 2 attempts
  ```

- [ ] **Verificar realtime filters:**
  ```
  Setup: 2 stores (A y B), 2 browser tabs
  Steps:
    1. Tab 1: Staff A → OrderBoard
    2. Tab 2: Staff B → OrderBoard
    3. Tab 1: Crear orden en store A
  Expected:
    - Tab 1: Nueva orden aparece (realtime)
    - Tab 2: NO recibe evento
  ```

---

### Environment Variables

- [ ] **Verificar .env en producción:**
  ```env
  # Supabase
  VITE_SUPABASE_URL=https://rzotggdrauaoslvrzkco.supabase.co
  VITE_SUPABASE_ANON_KEY=eyJh... (publishable key)

  # Mercado Pago
  VITE_MP_PUBLIC_KEY=APP_USR-...

  # Environment
  VITE_ENV=production
  ```

- [ ] **Verificar NO están comiteados:**
  ```bash
  grep -r "VITE_SUPABASE" .env
  # Verificar que .env está en .gitignore
  ```

---

## 🎯 DEPLOYMENT DAY

### 1. Backup Pre-Deploy
- [ ] **Backup database Supabase:**
  ```
  Dashboard → Database → Backups → Create Manual Backup
  ```
  **Nota:** Supabase hace backups automáticos, pero manual es extra seguridad

- [ ] **Tag git release:**
  ```bash
  git tag -a v1.0.0-production -m "Production release 2026-02-13"
  git push origin v1.0.0-production
  ```

---

### 2. Execute Deployment

- [ ] **Deploy backend migrations:**
  ```bash
  # Aplicar migrations pendientes
  supabase db push

  # Verificar
  supabase db diff
  # Expected: "No changes detected"
  ```

- [ ] **Deploy frontend:**
  ```bash
  # Según tu hosting (Vercel/Netlify/etc)
  vercel --prod
  ```

- [ ] **Verificar deployment exitoso:**
  - [ ] Website carga sin errores
  - [ ] Login funciona
  - [ ] Dashboard carga
  - [ ] Console sin errores críticos

---

### 3. Post-Deploy Verification (Primeros 15 min)

- [ ] **Health Check Queries:**
  ```sql
  -- 1. RLS Coverage
  SELECT * FROM monitoring_rls_coverage;
  -- Expected: Todos ✅ RLS enabled

  -- 2. Active Orders Integrity
  SELECT * FROM monitoring_active_orders_integrity;
  -- Expected: 0 rows

  -- 3. Idempotency Violations
  SELECT * FROM monitoring_idempotency_violations;
  -- Expected: 0 rows

  -- 4. Retry Metrics (si hay tráfico)
  SELECT COUNT(*) FROM retry_metrics
  WHERE created_at > NOW() - INTERVAL '15 minutes';
  -- Expected: > 0 si hubo tráfico
  ```

- [ ] **Frontend Health Check:**
  - [ ] Crear orden test (pagar con wallet)
  - [ ] Ajustar stock de 1 item
  - [ ] Verificar realtime: orden aparece en OrderBoard
  - [ ] Console: No errores críticos

- [ ] **Logs Check:**
  ```bash
  # Supabase logs
  Dashboard → Logs → API/Postgres
  # Buscar errores recientes
  ```

---

## 📊 MONITORING PRIMERAS 48H

### Queries Diarias (Ejecutar 2x/día)

```sql
-- QUERY 1: Stock Alerts Pending
SELECT * FROM monitoring_stock_alerts_pending;
-- ALERTA si: > 5 items por más de 1 hora
-- ACTION: Notificar staff para restock

-- QUERY 2: Wallet Integrity (después de implementar ledger)
SELECT * FROM monitoring_wallet_integrity;
-- ALERTA si: > 0 rows
-- ACTION: Investigación CRÍTICA inmediata

-- QUERY 3: Cash Session Reconciliation
SELECT * FROM monitoring_cash_session_reconciliation
WHERE audit_status LIKE '%❌%'
  AND closed_at > NOW() - INTERVAL '24 hours';
-- ALERTA si: > 0 rows con diferencia > $100
-- ACTION: Auditoría de caja

-- QUERY 4: Retry Success Rate
SELECT * FROM analytics_retry_success_rate_daily
WHERE date = CURRENT_DATE
  AND success_rate < 95;
-- ALERTA si: success_rate < 95%
-- ACTION: Investigar LOCK_TIMEOUT frequency

-- QUERY 5: Stock Rollback Audit
SELECT * FROM monitoring_stock_rollback_audit
WHERE audit_status LIKE '%❌%';
-- ALERTA si: > 0 rows
-- ACTION: Verificar triggers funcionando

-- QUERY 6: Idempotency Violations
SELECT * FROM monitoring_idempotency_violations;
-- ALERTA CRÍTICA si: > 0 rows
-- ACTION: Investigar constraint failure
```

---

### Métricas a Observar

| Métrica | Target | Alerta Si | Action |
|---------|--------|-----------|--------|
| **Retry Success Rate** | > 98% | < 95% | Investigar LOCK_TIMEOUT |
| **Wallet Integrity** | 0 discrepancies | > 0 | Investigación CRÍTICA |
| **Cash Difference** | < $10 promedio | > $100 | Auditoría de caja |
| **Stock Alerts** | < 5 items | > 10 items | Notificar restock |
| **Active Orders Integrity** | 0 orphaned | > 0 | Verificar triggers |
| **Idempotency Violations** | 0 | > 0 | CRITICAL - Constraint falla |

---

### Console Logs a Buscar

**✅ GOOD (esperados):**
```
[retryRpc] ✅ Success after 2 attempts (450ms)
[Stock Compensation] Order X items changed, compensating stock
[Stock Rollback] Order Y cancelled, reverting stock movements
```

**⚠️ WARNING (investigar si frecuentes):**
```
[retryRpc] 🔒 LOCK_TIMEOUT detected, retry 1/3 in 300ms
[Stock Compensation] Lock timeout for order X
```

**❌ ERROR (investigación inmediata):**
```
[retryRpc] ❌ Failed after 3 attempts (1200ms): LOCK_TIMEOUT
[retryRpc] Failed to log metric: <error>
ERROR: duplicate key value violates unique constraint
```

---

## 🔧 MONITORING SETUP (Post-Deploy)

### Sentry Setup (Error Tracking)
- [ ] **Crear proyecto Sentry:**
  ```bash
  npm install @sentry/react @sentry/tracing
  ```

- [ ] **Configurar en main.tsx:**
  ```typescript
  import * as Sentry from "@sentry/react";

  Sentry.init({
    dsn: "https://...",
    environment: "production",
    tracesSampleRate: 0.1,
    integrations: [
      new Sentry.BrowserTracing(),
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
  ```

- [ ] **Verificar errores llegan:**
  ```typescript
  // Test error
  Sentry.captureException(new Error("Test error"));
  ```

---

### Datadog/Grafana Dashboard (Opcional)
- [ ] **Conectar Supabase → Datadog:**
  ```
  Dashboard → Settings → Integrations → Datadog
  ```

- [ ] **Crear dashboard con:**
  - Retry success rate (línea temporal)
  - Top 10 RPCs más lentos (p95 latency)
  - Wallet integrity discrepancies (alerta)
  - Cash session differences (histograma)
  - Stock alerts pending (gauge)

---

## 🚨 ROLLBACK PLAN (Si algo sale mal)

### Backend Rollback
```sql
-- Si monitoring views causan issues:
DROP VIEW IF EXISTS monitoring_wallet_integrity CASCADE;
DROP VIEW IF EXISTS monitoring_cash_session_reconciliation CASCADE;
DROP VIEW IF EXISTS monitoring_stock_rollback_audit CASCADE;
DROP VIEW IF EXISTS monitoring_active_orders_integrity CASCADE;
DROP VIEW IF EXISTS monitoring_idempotency_violations CASCADE;
DROP VIEW IF EXISTS monitoring_rls_coverage CASCADE;

-- Si retry_metrics causa issues:
DROP TABLE IF EXISTS retry_metrics CASCADE;
DROP FUNCTION IF EXISTS log_retry_metric CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_retry_metrics CASCADE;
```

---

### Frontend Rollback
```bash
# Revertir a deployment anterior
vercel rollback

# O git rollback
git revert HEAD
git push origin main
vercel --prod
```

---

### Disable Retry Telemetry (Si causa issues)
```typescript
// En src/lib/retryRpc.ts
// Comentar las llamadas a logRetryMetrics:

// logRetryMetrics({
//   rpc_name: opts.rpcName || 'unknown',
//   attempts: attempt + 1,
//   final_status: 'success',
//   duration_ms: duration,
//   error_code: null
// });
```

---

## ✅ POST-DEPLOYMENT SUCCESS CRITERIA

### Day 1 (Primeras 24h)
- [ ] 0 errores críticos en Sentry
- [ ] Retry success rate > 95%
- [ ] 0 wallet integrity discrepancies
- [ ] 0 idempotency violations
- [ ] Primera cash session cerrada correctamente (difference < $10)
- [ ] Realtime subscriptions funcionando (no cross-store events)

---

### Week 1 (Primeros 7 días)
- [ ] Retry success rate promedio > 98%
- [ ] Wallet ledger implementado (Sprint 1)
- [ ] Retry metrics dashboard creado
- [ ] Sentry configurado y monitoreando
- [ ] Testing manual de todos los flows críticos
- [ ] Documentación de incidentes (si hubo)

---

## 📞 ESCALACIÓN

### Nivel 1 (Info/Warning)
**Trigger:** Warning logs, success rate 95-98%
**Canal:** Slack notification
**Response Time:** Review en standup
**Action:** Monitorear, no urgente

---

### Nivel 2 (Error)
**Trigger:**
- Retry success rate < 95%
- Stock alerts > 10 items
- Cash difference > $100

**Canal:** Email + Slack
**Response Time:** 4 horas
**Action:** Investigar root cause, fix si posible

---

### Nivel 3 (Critical)
**Trigger:**
- Wallet integrity discrepancy > $1000
- RLS violations > 100/hour
- Retry success rate < 85%
- Idempotency violations > 0
- Database CPU > 90% (5+ min)

**Canal:** PagerDuty + SMS
**Response Time:** 1 hora
**Action:** War room, rollback si necesario

---

## 📋 SPRINT 1 POST-MVP (Semanas 2-3)

### Prioridad ALTA
- [ ] **Implementar Wallet Ledger** (16-22h)
  - Ver `WALLET_LEDGER_IMPLEMENTATION_PLAN.md`
  - 7 fases: setup → topups → trigger → refunds → p2p → backfill → testing
  - Testing: Verificar wallet_balance = SUM(wallet_ledger)

- [ ] **Retry Metrics Dashboard** (4-6h)
  - Grafana/Metabase con analytics views
  - Alertas automáticas success rate < 95%
  - Historical trends

---

### Prioridad MEDIA
- [ ] **Storage Upload Wrapper** (2-3h)
  - Crear `src/lib/storage.ts`
  - Enforce `{store_id}/{timestamp}_{filename}` pattern
  - Replace todos los .upload() calls

- [ ] **Conflict Resolution UI** (4-6h)
  - Modal para errores de offline sync
  - Opciones: reducir qty, cancelar, retry

---

### Prioridad BAJA
- [ ] Dashboard pagination (stock, orders, clients)
- [ ] Rate limiting en RPCs públicos
- [ ] Backup restore testing
- [ ] Performance optimization (queries N+1)

---

## 📚 DOCUMENTACIÓN DE REFERENCIA

### Durante Deployment
- **Checklist:** `DEPLOYMENT_CHECKLIST.md` (este archivo)
- **Auditoría Principal:** `AUDITORIA_EXHAUSTIVA_FINAL.md`
- **Índice Docs:** `README_AUDITORIA.md`

### Post-Deployment
- **Wallet Ledger:** `WALLET_LEDGER_IMPLEMENTATION_PLAN.md`
- **Implementación:** `IMPLEMENTATION_REPORT_RIESGOS.md`
- **Evidencia SQL:** `AUDIT_E2E_EVIDENCIA_MEDIBLE.md`

### Monitoring
- **SQL Queries:** Ver sección "Queries Diarias" arriba
- **Views:** `20260213_create_monitoring_views.sql`
- **Analytics:** `20260213_create_retry_metrics_table.sql`

---

## ✅ SIGN-OFF

**Pre-Deployment:**
- [ ] Auditoría exhaustiva completada (9.2/10)
- [ ] Fixes críticos implementados
- [ ] Testing manual ejecutado
- [ ] Migrations listas para aplicar
- [ ] Environment variables verificadas
- [ ] Backup pre-deploy creado

**Deployment:**
- [ ] Migrations aplicadas exitosamente
- [ ] Frontend deployed sin errores
- [ ] Health checks PASS
- [ ] Monitoring activo

**Post-Deployment (24h):**
- [ ] 0 errores críticos
- [ ] Métricas dentro de targets
- [ ] Primera cash session cerrada OK
- [ ] Equipo notificado y monitoreando

---

**Preparado por:** Claude AI
**Fecha:** 2026-02-13
**Versión:** 1.0 FINAL
**Status:** ✅ **READY FOR DEPLOYMENT**
