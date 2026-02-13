# 📋 Plan de Normalización: inventory_items (39 columnas)

**Fecha:** 2026-02-13
**Tabla afectada:** `inventory_items`
**Problema:** Table bloat con 39 columnas mezclando diferentes contextos
**Objetivo:** Reducir a ~15 columnas core, extraer resto a tablas específicas

---

## 🔍 Análisis de Columnas Actual

### Categorización de las 39 Columnas

| Categoría | Columnas | Contexto |
|-----------|----------|----------|
| **Core Identity** | id, name, sku, store_id, item_type | Identidad del item ✅ |
| **Audit** | created_at, updated_at | Tracking temporal ✅ |
| **Classification** | category_id, description | Clasificación ✅ |
| **Stock Levels** | current_stock, min_stock, max_stock, ideal_stock, min_stock_alert, reorder_point | Niveles de stock 🟡 |
| **Package System** | closed_stock, open_count, open_packages, package_size, content_unit, min_packages | Sistema de paquetes 🟡 |
| **Pricing** | cost, price, last_purchase_price | Precios 🔴 MEZCLA |
| **Supplier** | last_supplier_id | Proveedor 🔴 MEZCLA |
| **Product Display** | is_menu_visible, image_url, is_recommended, is_new, is_promo, sort_order | 🔴 DEBERÍA ESTAR EN `products` |
| **Product Structure** | addons, variants, combo_items | 🔴 DEBERÍA ESTAR EN `products` |
| **Stock Logic** | stock_logic_version | 🟠 Config técnica |
| **Status** | is_active | Estado ✅ |
| **Duplicados** | quantity, min_quantity | 🔴 REDUNDANTE |

---

## ⚠️ Problemas Identificados

### 1. **Mezcla Inventory Item vs Product**

**Problema:** `inventory_items` tiene columnas de PRODUCTO (menu display, pricing display):
- `is_menu_visible` - Si se muestra en menú
- `image_url` - Imagen del producto
- `price` - Precio de VENTA (no costo de compra)
- `is_recommended`, `is_new`, `is_promo` - Badges de marketing
- `sort_order` - Orden en menú
- `addons`, `variants`, `combo_items` - Estructura de producto

**Impacto:**
❌ Confusión entre "materia prima" (inventory) y "producto vendible" (products)
❌ Items de inventario NO deberían tener precio de venta ni badges de marketing

**Solución:**
✅ Estas columnas deberían estar en tabla `products`, NO en `inventory_items`

---

### 2. **Columnas Duplicadas**

| Columna Original | Duplicado | Acción |
|------------------|-----------|--------|
| `current_stock` | `quantity` | 🔴 Eliminar `quantity` |
| `min_stock` | `min_quantity` | 🔴 Eliminar `min_quantity` |
| `min_stock_alert` | `min_stock` | 🟡 Consolidar (¿cuál se usa?) |

---

### 3. **Stock Management Bloat**

Demasiadas columnas para niveles de stock:
- `current_stock` - Stock actual total
- `min_stock` - Stock mínimo
- `max_stock` - Stock máximo
- `ideal_stock` - Stock ideal
- `min_stock_alert` - Alerta de stock bajo
- `reorder_point` - Punto de reorden

**Propuesta:** Consolidar en tabla `inventory_stock_config`:
```sql
CREATE TABLE inventory_stock_config (
  item_id UUID PRIMARY KEY REFERENCES inventory_items(id),
  min_stock NUMERIC,
  max_stock NUMERIC,
  ideal_stock NUMERIC,
  reorder_point NUMERIC,
  auto_reorder_enabled BOOLEAN DEFAULT FALSE
);
```

---

### 4. **Package System Complexity**

Columnas del sistema de paquetes:
- `closed_stock` - Paquetes cerrados
- `open_count` - Cantidad de paquetes abiertos
- `open_packages` - JSONB con paquetes abiertos
- `package_size` - Tamaño del paquete
- `content_unit` - Unidad de contenido
- `min_packages` - Paquetes mínimos

**Situación:**
🟢 Sistema funcional, PERO mezcla config con state
🟡 `package_size`, `content_unit`, `min_packages` = CONFIG (raramente cambia)
🟡 `closed_stock`, `open_count`, `open_packages` = STATE (cambia constantemente)

**Propuesta:** Separar config de state:
```sql
-- Config (raramente cambia)
CREATE TABLE inventory_package_config (
  item_id UUID PRIMARY KEY REFERENCES inventory_items(id),
  package_size NUMERIC NOT NULL,
  content_unit TEXT NOT NULL,
  min_packages INTEGER DEFAULT 1
);

-- State ya está en inventory_location_stock:
-- - closed_units
-- - open_packages (JSONB)
```

---

### 5. **Pricing Confusion**

Tres columnas de precio:
- `cost` - Costo de compra unitario (¿actual o promedio?)
- `price` - Precio de VENTA (🔴 NO debería estar aquí)
- `last_purchase_price` - Último precio de compra

**Problema:**
❌ `cost` es ambiguo (¿costo actual? ¿promedio?)
❌ `price` es precio de VENTA → debería estar en `products`
❌ Falta historial de precios de compra

**Propuesta:**
```sql
-- Mantener en inventory_items:
-- - cost (costo promedio actual)

-- Crear tabla de historial:
CREATE TABLE inventory_purchase_history (
  id UUID PRIMARY KEY,
  item_id UUID REFERENCES inventory_items(id),
  supplier_id UUID REFERENCES suppliers(id),
  purchase_price NUMERIC NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🎯 Plan de Normalización (3 Fases)

### **FASE 1: Limpieza Inmediata (No Breaking)**

**Objetivo:** Eliminar duplicados y columns obsoletas SIN romper código existente

#### 1.1. Eliminar Columnas Duplicadas

```sql
-- Migration: 20260214_remove_duplicate_columns.sql

-- Verificar que quantity = current_stock (si es duplicado)
SELECT COUNT(*) FROM inventory_items
WHERE quantity IS NOT NULL
AND quantity != current_stock;

-- Si count = 0, es seguro eliminar
ALTER TABLE inventory_items DROP COLUMN IF EXISTS quantity;
ALTER TABLE inventory_items DROP COLUMN IF EXISTS min_quantity;
```

**Impacto:** BAJO - Si no se usan en código
**Verificación requerida:** Grep en frontend por `quantity` y `min_quantity`

---

#### 1.2. Consolidar min_stock vs min_stock_alert

```sql
-- Verificar diferencias
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE min_stock != min_stock_alert) as diferentes
FROM inventory_items;

-- Si son iguales, eliminar min_stock_alert
ALTER TABLE inventory_items DROP COLUMN IF EXISTS min_stock_alert;
```

---

#### 1.3. Marcar Columnas Deprecated (No Eliminar Aún)

```sql
COMMENT ON COLUMN inventory_items.price IS
'DEPRECATED: Price should be in products table, not inventory_items. Will be removed in Phase 2.';

COMMENT ON COLUMN inventory_items.is_menu_visible IS
'DEPRECATED: Menu visibility should be in products table. Will be removed in Phase 2.';

-- Etc. para todas las columnas de "Product Display"
```

---

### **FASE 2: Extracción a Nuevas Tablas (Requiere Refactor Frontend)**

**Objetivo:** Mover columnas a tablas normalizadas

#### 2.1. Crear inventory_stock_config

```sql
CREATE TABLE inventory_stock_config (
  item_id UUID PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  min_stock NUMERIC DEFAULT 0,
  max_stock NUMERIC,
  ideal_stock NUMERIC,
  reorder_point NUMERIC,
  auto_reorder_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate data
INSERT INTO inventory_stock_config (item_id, store_id, min_stock, max_stock, ideal_stock, reorder_point)
SELECT
  id,
  store_id,
  min_stock,
  max_stock,
  ideal_stock,
  reorder_point
FROM inventory_items;

-- Enable RLS
ALTER TABLE inventory_stock_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their store stock config"
ON inventory_stock_config
FOR ALL
TO authenticated
USING (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()))
WITH CHECK (store_id IN (SELECT store_id FROM profiles WHERE id = auth.uid()));
```

**Impacto:** MEDIO - Requiere actualizar queries en frontend
**Frontend changes:**
```typescript
// ANTES:
const { data: item } = await supabase
  .from('inventory_items')
  .select('min_stock, max_stock')
  .eq('id', itemId)
  .single();

// DESPUÉS:
const { data: item } = await supabase
  .from('inventory_items')
  .select('*, stock_config:inventory_stock_config(*)')
  .eq('id', itemId)
  .single();
```

---

#### 2.2. Crear inventory_package_config

```sql
CREATE TABLE inventory_package_config (
  item_id UUID PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
  package_size NUMERIC NOT NULL DEFAULT 1,
  content_unit TEXT NOT NULL DEFAULT 'un',
  min_packages INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate data
INSERT INTO inventory_package_config (item_id, package_size, content_unit, min_packages)
SELECT
  id,
  COALESCE(package_size, 1),
  COALESCE(content_unit, 'un'),
  COALESCE(min_packages, 1)
FROM inventory_items;
```

---

#### 2.3. Crear inventory_purchase_history

```sql
CREATE TABLE inventory_purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES suppliers(id),
  purchase_price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL,
  purchased_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate last purchase data (one-time)
INSERT INTO inventory_purchase_history (item_id, store_id, supplier_id, purchase_price, quantity, purchased_at)
SELECT
  id,
  store_id,
  last_supplier_id,
  last_purchase_price,
  1, -- Unknown quantity for legacy data
  created_at
FROM inventory_items
WHERE last_purchase_price IS NOT NULL;
```

---

#### 2.4. Mover Columnas de Product a products Table

**IMPORTANTE:** Verificar que `products` table existe y tiene estas columnas

```sql
-- Si products no tiene estas columnas, agregarlas:
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_recommended BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_promo BOOLEAN DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Ya deberían existir en products:
-- - is_menu_visible → available
-- - image_url
-- - price
-- - addons → product_addons table
-- - variants → product_variants table
```

**NO migrar data** porque `inventory_items` y `products` son entidades diferentes.

---

### **FASE 3: Cleanup Final (Breaking Changes)**

**Objetivo:** Eliminar columnas migradas de inventory_items

#### 3.1. Drop Migrated Columns

```sql
-- SOLO después de verificar que frontend usa nuevas tablas

ALTER TABLE inventory_items
  DROP COLUMN IF EXISTS min_stock,
  DROP COLUMN IF EXISTS max_stock,
  DROP COLUMN IF EXISTS ideal_stock,
  DROP COLUMN IF EXISTS reorder_point,
  DROP COLUMN IF EXISTS package_size,
  DROP COLUMN IF EXISTS content_unit,
  DROP COLUMN IF EXISTS min_packages,
  DROP COLUMN IF EXISTS last_supplier_id,
  DROP COLUMN IF EXISTS last_purchase_price,
  DROP COLUMN IF EXISTS price,
  DROP COLUMN IF EXISTS is_menu_visible,
  DROP COLUMN IF EXISTS is_recommended,
  DROP COLUMN IF EXISTS is_new,
  DROP COLUMN IF EXISTS is_promo,
  DROP COLUMN IF EXISTS sort_order,
  DROP COLUMN IF EXISTS addons,
  DROP COLUMN IF EXISTS variants,
  DROP COLUMN IF EXISTS combo_items;
```

**Resultado final:**
`inventory_items` tendrá ~15-18 columnas core:
- id, name, sku, store_id, item_type, category_id
- description, image_url (si es relevante para inventory)
- cost (costo promedio actual)
- current_stock (stock total calculado)
- closed_stock, open_count, open_packages (state)
- stock_logic_version
- is_active
- created_at, updated_at

---

## 📊 Comparativa Before/After

| Métrica | Before | After (Fase 3) | Mejora |
|---------|--------|----------------|--------|
| **Total Columns** | 39 | ~15 | -62% |
| **Columns per Table** | 39 en 1 tabla | ~15 en 5 tablas | Normalizado |
| **Separación de Concerns** | ❌ Mezclado | ✅ Separado | +Mantenibilidad |
| **Type Safety** | 🟡 Ambiguo | ✅ Claro | +Claridad |
| **Query Complexity** | 🟢 Simple | 🟡 Joins necesarios | Trade-off |

---

## ⚠️ Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| **Breaking changes en frontend** | 🔴 Alta | 🔴 Alto | Fase gradual, feature flags |
| **Pérdida de data** | 🟡 Media | 🔴 Alto | Backup antes de cada fase, rollback plan |
| **Performance degradation** | 🟡 Media | 🟠 Medio | Indexes en FK, monitorear queries |
| **Confusión de developers** | 🟠 Media | 🟡 Medio | Documentación clara, comments en schema |

---

## 📅 Timeline Recomendado

| Fase | Duración | Prerequisitos |
|------|----------|---------------|
| **Fase 1** | 1 día | Backup DB, verificar duplicados |
| **Fase 2** | 1-2 semanas | Refactor frontend, tests E2E |
| **Fase 3** | 1 día | Fase 2 en producción, 0 errores por 1 semana |

**Total:** 3-4 semanas

---

## ✅ Checklist de Ejecución

### Fase 1 (Limpieza Inmediata)
- [ ] Backup completo de producción
- [ ] Grep frontend por `quantity` y `min_quantity`
- [ ] Verificar duplicados (quantity = current_stock)
- [ ] Ejecutar migration eliminar duplicados
- [ ] Consolidar min_stock / min_stock_alert
- [ ] Agregar COMMENT deprecation en columnas Phase 2
- [ ] Deploy y monitorear

### Fase 2 (Normalización)
- [ ] Crear tablas: inventory_stock_config
- [ ] Crear tablas: inventory_package_config
- [ ] Crear tablas: inventory_purchase_history
- [ ] Migrar data a nuevas tablas
- [ ] Habilitar RLS en nuevas tablas
- [ ] Refactor frontend queries
- [ ] Tests E2E con nuevas tablas
- [ ] Feature flag para rollback
- [ ] Deploy gradual (10% → 50% → 100%)
- [ ] Monitorear performance

### Fase 3 (Cleanup)
- [ ] Verificar 0 errores en 1 semana producción
- [ ] Verificar frontend NO usa columnas old
- [ ] Backup final
- [ ] Ejecutar DROP COLUMN migration
- [ ] Verificar funcionalidad completa
- [ ] Actualizar documentación

---

## 🎓 Lecciones Aprendidas

**Por qué pasó esto:**
1. Desarrollo iterativo sin refactoring sistemático
2. Mezcla de "inventory item" y "product" en misma tabla
3. Agregar columnas es más fácil que normalizar
4. Falta de schema review en cada feature

**Prevención futura:**
1. Code review con foco en schema design
2. Regla: "Si tabla > 20 columnas → considerar normalizar"
3. Separar claramente entity boundaries (inventory ≠ product)
4. Quarterly tech debt cleanup

---

**Generado:** 2026-02-13
**Autor:** Claude Sonnet 4.5 (con análisis de 39 columnas de `inventory_items`)
