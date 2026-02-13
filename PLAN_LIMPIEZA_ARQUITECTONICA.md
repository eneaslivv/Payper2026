# 🧹 PLAN DE LIMPIEZA ARQUITECTÓNICA - SISTEMA PAYPER

**Fecha Creación:** 2026-02-13
**Prioridad:** ALTA (Pre-Scaling)
**Esfuerzo Total:** 5-7 días
**Status:** 📋 PLANIFICADO

---

## 🎯 OBJETIVO

Resolver los hallazgos críticos de la auditoría estructural para:
- Reducir deuda técnica de 6.8/10 → 8.5/10
- Preparar sistema para escalar a >50 stores
- Mejorar mantenibilidad y developer experience
- Eliminar riesgos de performance y estabilidad

---

## 📊 FASE 1: CLEANUP BACKEND (3 días)

### 1.1 Consolidación de Funciones RPC (Día 1)

**Objetivo:** Eliminar funciones versionadas obsoletas

**Tareas:**
```sql
-- A. Crear registro de funciones canónicas
CREATE TABLE IF NOT EXISTS function_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT UNIQUE NOT NULL,
  current_version TEXT NOT NULL,
  deprecated_versions TEXT[],
  migration_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- B. Documentar estado actual
INSERT INTO function_registry (function_name, current_version, deprecated_versions, notes) VALUES
('admin_add_balance', 'admin_add_balance_v2', ARRAY['admin_add_balance'], 'v2 includes audit logging'),
('finalize_order_stock', 'finalize_order_stock_v8', ARRAY['finalize_order_stock', 'finalize_order_stock_v7_retail_logic', 'finalize_order_stock_correct_v4'], 'v8 is production stable'),
('decrease_stock_atomic', 'decrease_stock_atomic_v20', ARRAY['decrease_stock_atomic'], 'v20 includes idempotency key');

-- C. DROP funciones obsoletas (EJECUTAR EN STAGING PRIMERO)
DROP FUNCTION IF EXISTS admin_add_balance CASCADE;
DROP FUNCTION IF EXISTS finalize_order_stock CASCADE;
DROP FUNCTION IF EXISTS finalize_order_stock_v7_retail_logic CASCADE;
DROP FUNCTION IF EXISTS finalize_order_stock_correct_v4 CASCADE;
DROP FUNCTION IF EXISTS finalize_order_stock_strict_v6 CASCADE;
DROP FUNCTION IF EXISTS decrease_stock_atomic CASCADE;

-- D. Verificar que código frontend no usa funciones eliminadas
-- (grep -r "admin_add_balance\(" --include="*.tsx" --include="*.ts" src/)
-- Resultado esperado: Solo referencias a admin_add_balance_v2
```

**Verificación:**
```sql
-- Verificar que solo queda 1 versión por función
SELECT routine_name, COUNT(*) as versions
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
GROUP BY routine_name
HAVING COUNT(*) > 1;
-- Expected: 0 rows
```

**Rollback:**
```sql
-- Si algo falla, restaurar desde backup
-- Supabase Dashboard → Database → Backups → Restore
```

---

### 1.2 Estandarización de Naming a Inglés (Día 1.5)

**Objetivo:** Eliminar mezcla español/inglés en schema

**Fase A: Migración de Datos**
```sql
-- 1. Migrar valores de columnas español → inglés
UPDATE orders
SET status = COALESCE(status, estado)
WHERE status IS NULL AND estado IS NOT NULL;

UPDATE orders
SET payment_method = COALESCE(payment_method, metodoPago)
WHERE payment_method IS NULL AND metodoPago IS NOT NULL;

-- 2. Verificar migración
SELECT COUNT(*) FROM orders WHERE status IS NULL;
-- Expected: 0

-- 3. DROP columnas español
ALTER TABLE orders DROP COLUMN IF EXISTS estado;
ALTER TABLE orders DROP COLUMN IF EXISTS metodoPago;

-- 4. Actualizar ENUM values (si existen valores en español)
UPDATE orders
SET status = 'waiting'
WHERE status = 'aguardando';

-- 5. Eliminar valores legacy del ENUM
-- (Requiere recrear ENUM - documentar en migration separada)
```

**Fase B: Tablas con Nombres Duplicados**
```sql
-- Verificar si productos/products son duplicadas o renombradas
SELECT COUNT(*) FROM productos;
SELECT COUNT(*) FROM products;

-- Si son duplicadas: consolidar en products
-- Si products es rename de productos: ya está OK

-- Documentar en NAMING_MIGRATION_LOG.md
```

**Verificación:**
```sql
-- Verificar que no quedan columnas en español
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name ~ '[áéíóúñ]'
ORDER BY table_name, column_name;
-- Expected: 0 rows (excepto campos de texto libre)
```

---

### 1.3 Audit y Cleanup de Índices (Día 2)

**Objetivo:** Eliminar índices duplicados, conservar necesarios

**Tareas:**
```sql
-- A. Detectar índices duplicados
SELECT
  schemaname,
  tablename,
  array_agg(indexname ORDER BY indexname) as duplicate_indexes,
  COUNT(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
GROUP BY schemaname, tablename, indexdef
HAVING COUNT(*) > 1;

-- B. Analizar índices por tabla crítica
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('orders', 'products', 'inventory_items', 'clients', 'stock_movements')
ORDER BY tablename, indexname;

-- C. DROP índices duplicados (ejemplo)
DROP INDEX IF EXISTS idx_orders_store_id_v2;
DROP INDEX IF EXISTS orders_store_id_idx;
-- Mantener solo: idx_orders_store_id

-- D. Crear índices faltantes en FKs
CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_inventory_item_id
  ON stock_movements(inventory_item_id);

-- E. Índices compuestos para queries frecuentes
CREATE INDEX IF NOT EXISTS idx_orders_store_status
  ON orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_movements_store_created
  ON stock_movements(store_id, created_at DESC);
```

**Meta:** Reducir de 149 índices → ~60 índices necesarios

**Verificación:**
```sql
SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public';
-- Expected: 60-80 (depende de tamaño de schema)
```

---

### 1.4 Consolidación de Triggers (Día 2.5)

**Objetivo:** Reducir triggers de 52 → ~20, eliminar redundancias

**Tareas:**
```sql
-- A. Listar todos los triggers
SELECT
  trigger_name,
  event_object_table as table_name,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- B. Identificar triggers duplicados/similares
-- Buscar patrones: sync_*, update_*, trg_*

-- C. Consolidar triggers con lógica similar
-- Ejemplo: Si sync_item_stock_trigger y trg_sync_item_stock_fn hacen lo mismo
DROP TRIGGER IF EXISTS old_sync_item_stock_trigger ON inventory_items;
-- Mantener solo el trigger activo

-- D. Documentar triggers activos
CREATE TABLE IF NOT EXISTS trigger_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_name TEXT NOT NULL,
  table_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  execution_order INT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- E. Insertar metadata de triggers
INSERT INTO trigger_registry (trigger_name, table_name, purpose, execution_order) VALUES
('trg_sync_inventory_item_total_stock', 'inventory_items', 'Sync current_stock from item_stock_levels', 1),
('trg_update_order_total', 'order_items', 'Recalculate order.total_amount when items change', 1),
('trg_stock_compensation_on_edit', 'order_items', 'Adjust stock when order items are edited', 2);
```

**Verificación:**
```sql
-- Verificar que triggers críticos siguen funcionando
-- Test: Crear orden → verificar que stock se deduce
-- Test: Editar orden → verificar que stock se compensa
```

---

### 1.5 Eliminar RPCs Never-Called (Día 3)

**Objetivo:** Limpiar funciones no utilizadas

**Tareas:**
```bash
# A. Verificar uso en frontend
cd "C:\Users\eneas\Downloads\livv\Payper\coffe payper"
grep -r "\.rpc\(" --include="*.tsx" --include="*.ts" src/ pages/ components/ contexts/ \
  | grep -o "rpc('[^']*'" \
  | sort -u > frontend_rpcs_used.txt

# B. Listar RPCs en BD
# (ejecutar en Supabase SQL)
```

```sql
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_type = 'FUNCTION'
ORDER BY routine_name;
-- Exportar a backend_rpcs_available.txt

-- C. Comparar listas → identificar RPCs nunca llamadas
-- (hacer diff manualmente o con script)

-- D. DROP RPCs no utilizadas (STAGING PRIMERO)
DROP FUNCTION IF EXISTS acknowledge_stock_alert CASCADE;
DROP FUNCTION IF EXISTS check_rate_limit CASCADE;
DROP FUNCTION IF EXISTS alert_pending_abandonment CASCADE;
DROP FUNCTION IF EXISTS alert_on_negative_stock CASCADE;
DROP FUNCTION IF EXISTS enqueue_payment_email CASCADE;

-- E. Documentar en RPCS_CHANGELOG.md
```

**Archivo: `RPCS_CHANGELOG.md`**
```markdown
# RPC Deprecation Log

## 2026-02-13 - Cleanup Never-Called Functions

### Removed:
- `acknowledge_stock_alert` - No UI implementation
- `check_rate_limit` - Unused, no context
- `alert_pending_abandonment` - No UI
- `alert_on_negative_stock` - Redundant with stock_alerts table
- `enqueue_payment_email` - Edge Function handles this

### Still Active (18 RPCs):
- pay_with_wallet ✅
- complete_wallet_payment ✅
- transfer_stock ✅
... (ver lista completa en auditoría)
```

---

## 📊 FASE 2: CLEANUP FRONTEND (2 días)

### 2.1 Fix N+1 Queries (Día 4)

**Objetivo:** Eliminar queries en loops

**Archivos a modificar:**

**A. `components/LogisticsView.tsx` (líneas ~350-380)**
```typescript
// ANTES:
for (const order of orders) {
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id);
  // Process...
}

// DESPUÉS:
// Fetch all items en batch
const { data: allItems } = await supabase
  .from('order_items')
  .select('*')
  .in('order_id', orders.map(o => o.id));

// Group by order_id
const itemsByOrder = allItems.reduce((acc, item) => {
  if (!acc[item.order_id]) acc[item.order_id] = [];
  acc[item.order_id].push(item);
  return acc;
}, {} as Record<string, any[]>);

// Use grouped data
orders.forEach(order => {
  const items = itemsByOrder[order.id] || [];
  // Process...
});
```

**B. `pages/Clients.tsx` (balance lookups)**
```typescript
// ANTES: Individual lookups
for (const client of clients) {
  const { data: balance } = await supabase
    .from('wallet_ledger')
    .select('amount')
    .eq('wallet_id', client.id);
}

// DESPUÉS: Usar cached balance
// clients ya tiene wallet_balance (cached)
// Solo fetch ledger si se necesita detalle
```

**C. `pages/InventoryManagement.tsx` (location stock)**
```typescript
// ANTES:
for (const item of items) {
  const { data: locations } = await supabase
    .from('inventory_location_stock')
    .select('*')
    .eq('inventory_item_id', item.id);
}

// DESPUÉS:
const { data: allLocations } = await supabase
  .from('inventory_location_stock')
  .select('*')
  .in('inventory_item_id', items.map(i => i.id));

const locationsByItem = allLocations.reduce((acc, loc) => {
  if (!acc[loc.inventory_item_id]) acc[loc.inventory_item_id] = [];
  acc[loc.inventory_item_id].push(loc);
  return acc;
}, {});
```

---

### 2.2 Añadir Paginación y Límites (Día 4.5)

**Objetivo:** Prevenir OOM y timeouts

**A. Crear wrapper de paginación**

**Archivo: `src/lib/pagination.ts`**
```typescript
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export interface PaginationOptions {
  page?: number;
  pageSize?: number;
}

export const paginate = <T extends { select: Function }>(
  query: T,
  options: PaginationOptions = {}
): T => {
  const page = options.page || 1;
  const pageSize = Math.min(options.pageSize || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  return query.range(start, end).limit(pageSize) as T;
};

export const safeQuery = <T extends { select: Function }>(query: T): T => {
  return query.limit(MAX_PAGE_SIZE) as T;
};
```

**B. Aplicar a queries sin límite**

```typescript
// pages/Finance.tsx
import { paginate } from '../src/lib/pagination';

const [currentPage, setCurrentPage] = useState(1);

const { data: orders } = await paginate(
  supabase
    .from('orders')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false }),
  { page: currentPage, pageSize: 25 }
);

// pages/InventoryManagement.tsx
const { data: movements } = await paginate(
  supabase
    .from('stock_movements')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false }),
  { page: currentPage }
);

// pages/Clients.tsx
const { data: clients } = await paginate(
  supabase
    .from('clients')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false }),
  { page: currentPage }
);
```

---

### 2.3 Regenerar Types + Cleanup Imports (Día 5)

**Objetivo:** Alinear tipos TypeScript con schema limpio

**Tareas:**
```bash
# A. Después de limpiar schema backend, regenerar types
cd "C:\Users\eneas\Downloads\livv\Payper\coffe payper"

# Regenerar tipos desde Supabase
npx supabase gen types typescript --project-id yjxjyxhksedwfeueduwl > src/types/supabase.ts

# B. Verificar TypeScript errors
npm run type-check

# C. Fix imports no utilizados (ejecutar linter)
npm run lint -- --fix

# D. Remover imports manuales
# Ejemplo: useContext importado pero no usado
```

**Verificación:**
```bash
npm run build
# Expected: Build successful sin TypeScript errors
```

---

### 2.4 Storage Path Enforcement (Día 5)

**Objetivo:** Centralizar uploads con validación

**Archivo: `src/lib/storage.ts`**
```typescript
import { supabase } from '../../lib/supabase';

export type AssetCategory = 'products' | 'invoices' | 'profiles' | 'receipts';

interface UploadOptions {
  category: AssetCategory;
  filename: string;
  file: File;
  storeId?: string;
}

export const uploadStoreAsset = async ({
  category,
  filename,
  file,
  storeId
}: UploadOptions): Promise<{ data: { path: string } | null; error: Error | null }> => {
  try {
    // Get current user's store_id if not provided
    const effectiveStoreId = storeId || await getCurrentUserStoreId();

    if (!effectiveStoreId) {
      throw new Error('No store_id found for current user');
    }

    // Enforce path format: {store_id}/{category}/{timestamp}_{filename}
    const timestamp = Date.now();
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${effectiveStoreId}/${category}/${timestamp}_${sanitizedFilename}`;

    const { data, error } = await supabase.storage
      .from('store-assets')
      .upload(path, file);

    if (error) throw error;

    return { data: { path: data.path }, error: null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
};

async function getCurrentUserStoreId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('store_id')
    .eq('id', user.id)
    .single();

  return profile?.store_id || null;
}

// Wrapper para getPublicUrl
export const getAssetUrl = (path: string): string => {
  const { data } = supabase.storage
    .from('store-assets')
    .getPublicUrl(path);

  return data.publicUrl;
};
```

**Uso:**
```typescript
// Reemplazar uploads directos:
// ANTES:
await supabase.storage
  .from('store-assets')
  .upload(`products/${productId}.jpg`, file);

// DESPUÉS:
import { uploadStoreAsset } from '../src/lib/storage';

const { data, error } = await uploadStoreAsset({
  category: 'products',
  filename: `${productId}.jpg`,
  file: file
});
```

---

## 📊 FASE 3: LIMPIEZA FINAL (1 día)

### 3.1 Limpiar Test Data (Día 6)

```sql
-- A. Eliminar stores de testing
DELETE FROM stores
WHERE name LIKE '%TEST%'
   OR name LIKE '%DEBUG%'
   OR name LIKE '%DEMO%';

-- B. Eliminar clientes de testing
DELETE FROM clients
WHERE email LIKE '%test@%'
   OR email LIKE '%debug@%';

-- C. Verificar órde

nes huérfanas
SELECT COUNT(*) FROM orders
WHERE store_id NOT IN (SELECT id FROM stores);
-- Expected: 0
```

---

### 3.2 Documentación Final (Día 6.5)

**Crear/Actualizar:**
1. `FUNCTION_REGISTRY.md` - Mapa de funciones canónicas
2. `RPCS_CHANGELOG.md` - Deprecations log
3. `NAMING_CONVENTIONS.md` - Estándares adoptados
4. `MIGRATION_AUDIT.md` - Timeline de cleanup
5. Actualizar `README.md` con nuevo estado

---

## ✅ VERIFICACIÓN POST-CLEANUP

### Checklist Final

**Backend:**
- [ ] Funciones versionadas consolidadas (1 por nombre)
- [ ] Schema 100% inglés (sin columnas español)
- [ ] Índices optimizados (60-80 total, no 149)
- [ ] Triggers consolidados (20 máximo, no 52)
- [ ] RPCs never-called eliminadas
- [ ] Test data limpiado

**Frontend:**
- [ ] N+1 queries eliminadas (batch fetching)
- [ ] Paginación en todas las listas
- [ ] Types regenerados y alineados
- [ ] Imports limpios (sin unused)
- [ ] Storage paths enforceados

**Performance:**
- [ ] Build time < 30s
- [ ] No TypeScript errors
- [ ] Queries con LIMIT por defecto
- [ ] No warnings de bundle size críticos

**Testing:**
- [ ] Regression tests en staging
- [ ] Verificar flows críticos (orden, pago, stock)
- [ ] Monitorear logs por 48h

---

## 📈 MÉTRICAS OBJETIVO

| Métrica | Antes | Después | Mejora |
|---------|-------|---------|--------|
| **Score Limpieza DB** | 5/10 | 8/10 | +60% |
| **Score Naming** | 4/10 | 9/10 | +125% |
| **Score Performance** | 5/10 | 8/10 | +60% |
| **Score Mantenibilidad** | 5/10 | 8/10 | +60% |
| **Migraciones** | 231 | 231* | 0% (consolidadas) |
| **Funciones RPC** | 50+ (versionadas) | ~30 (canónicas) | -40% |
| **Índices** | 149 | 60-80 | -46% |
| **Triggers** | 52 | ~20 | -62% |

*Nota: Migraciones históricas se mantienen, pero funciones obsoletas se eliminan

---

## 🚀 DEPLOYMENT

**Timeline:**
```
Día 1-3: Backend cleanup (staging)
Día 4-5: Frontend fixes (local)
Día 6: Testing exhaustivo (staging)
Día 7: Deploy a producción + monitoring
```

**Rollback Plan:**
```sql
-- Si algo falla:
-- 1. Restore database backup (Supabase Dashboard)
-- 2. Revert frontend: git revert HEAD && vercel --prod
-- 3. Restaurar funciones críticas desde migrations
```

---

**Creado por:** Claude AI
**Fecha:** 2026-02-13
**Status:** 📋 READY TO EXECUTE
