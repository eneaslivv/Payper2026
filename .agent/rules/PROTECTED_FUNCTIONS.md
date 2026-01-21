# ⛔ Funciones Protegidas - NO MODIFICAR SIN AUDITORÍA

Última actualización: 2026-01-20

## 🚨 REGLA ABSOLUTA
Cualquier modificación a estas funciones DEBE:
1. Llamar al agente correspondiente
2. Pasar auditoría completa
3. Documentar en DECISIONS.md
4. Tener aprobación explícita ANTES de ejecutar

---

## Stock (stock-agent)

| Función | Versión | Estado | Descripción |
|---------|---------|--------|-------------|
| `update_inventory_from_movement()` | V22 | ✅ ESTABLE | Trigger principal para stock_movements |
| `decrease_stock_atomic_v20()` | V20 | ✅ ESTABLE | Consumo atómico de paquetes abiertos |
| `transfer_stock()` | V1 | ✅ ESTABLE | RPC para transferencias/restocks |
| `sync_item_totals_from_locations()` | V1 | ✅ ESTABLE | Sincroniza stock global desde ubicaciones |
| `check_product_stock_availability()` | V1 | ✅ ESTABLE | Valida disponibilidad Whole Unit |

### Triggers críticos:
| Trigger | Tabla | Función |
|---------|-------|---------|
| `trg_enforce_location_sync` | `inventory_location_stock` | `sync_item_totals_from_locations()` |
| `trg_sync_item_stock_unified` | `inventory_location_stock` | (Legacy sync) |
| `trg_update_product_availability` | `inventory_location_stock` | Actualiza `products.is_available` |

### Tablas críticas:
- `inventory_location_stock` ⚠️ (NO usar `location_stock` - TABLA INEXISTENTE)
- `inventory_items`
- `open_packages` (Tabla legacy - fuente de verdad para paquetes abiertos)
- `stock_movements`
- `inventory_audit_logs`

---

## Auth (security-agent)

| Función | Versión | Estado | Descripción |
|---------|---------|--------|-------------|
| `handle_new_user()` | V2 | ✅ ESTABLE | Trigger para crear profiles/clients en signup |

### Constraints críticos:
- `profiles_id_fkey` → DEFERRABLE INITIALLY DEFERRED
- `clients_auth_user_store_unique` → SIN condición WHERE (para ON CONFLICT)

---

## Pedidos (orders-agent)

| Trigger | Función | Estado |
|---------|---------|--------|
| `trg_deduct_stock_on_delivery` | `deduct_order_stock()` | ✅ ESTABLE |
| `on_order_delivered_loyalty` | `trigger_process_loyalty_on_delivery()` | ✅ ESTABLE |

---

## ⚠️ ERRORES HISTÓRICOS - NUNCA REPETIR

### 1. Ghost Table Bug (2026-01-20)
- **Error:** Usar tabla `location_stock` en lugar de `inventory_location_stock`
- **Impacto:** Stock agregado se perdía silenciosamente
- **Fix:** V22 migration

### 2. Missing Function Bug (2026-01-20)
- **Error:** Función `transfer_stock` no existía en producción
- **Impacto:** Restocks fallaban con "function does not exist"
- **Fix:** Ejecutar migración `20260110012800_fix_transfer_stock_final.sql`

### 3. Duplicate Open Packages (2026-01-20)
- **Error:** Datos en tabla `open_packages` Y en JSONB `inventory_location_stock.open_packages`
- **Impacto:** UI mostraba datos inconsistentes
- **Fix:** Usar tabla legacy como fuente de verdad, limpiar JSONB

### 4. FK Not Deferrable (2026-01-20)
- **Error:** `profiles_id_fkey` no era DEFERRABLE
- **Impacto:** Trigger `handle_new_user` fallaba por timing
- **Fix:** ALTER constraint a DEFERRABLE INITIALLY DEFERRED

### 5. Unique Index with WHERE (2026-01-20)
- **Error:** `clients_auth_user_store_unique` tenía condición WHERE
- **Impacto:** ON CONFLICT no funcionaba
- **Fix:** Recrear índice sin WHERE

---

## 📋 Checklist Pre-Modificación

Antes de tocar CUALQUIER función listada:

- [ ] ¿Identifiqué el agente responsable?
- [ ] ¿Audité el código actual sin modificar?
- [ ] ¿Documenté el problema en DECISIONS.md?
- [ ] ¿Presenté plan de cambio?
- [ ] ¿Tengo aprobación explícita del usuario?
- [ ] ¿La migración tiene nombre con fecha + versión?
- [ ] ¿Probé en desarrollo antes de producción?
