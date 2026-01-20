# System Design Decisions

## 2026-01-20: Unificación Sistema de Stock

### Problema
- Múltiples triggers conflictivos en `orders` (`trg_legacy`, `trg_deduct`, etc.) causaban inconsistencias.
- Stock no se descontaba al entregar ("Entregado" vs "paid" timing).
- Discrepancias entre ubicaciones (`inventory_location_stock`) y totales globales (`inventory_items`).
- Funciones legacy usaban columna inexistente `unit_size`.

### Solución
1. **Limpieza de Triggers**: Eliminados triggers duplicados en `orders`.
2. **Función Unificada `deduct_order_stock()`**:
   - Detecta automáticamente si un producto tiene receta en `product_recipes`.
   - **Con Receta**: Descuenta cantidades de ingredientes proporcionales.
   - **Sin Receta**: Descuenta el item directo.
   - Soporta variantes (`recipe_overrides`) y addons.
3. **Trigger de Entrega**: `trg_deduct_stock_on_delivery` dispara SOLO cuando `status IN ('Entregado', 'served', 'delivered')`.
4. **Corrección Atómica V20**: `decrease_stock_atomic_v20()` actualizada para usar `package_size` correcto.
5. ** Disponibilidad Strict**: Nueva lógica "Whole vs Ration" donde productos que requieren unidad entera se marcan como agotados si solo hay abiertos.

### Archivos modificados
- Funciones SQL: `deduct_order_stock`, `decrease_stock_atomic_v20`, `check_product_stock_availability`.
- Triggers: `trg_deduct_stock_on_delivery`, `trg_sync_item_stock_unified`, `trg_update_product_availability`.
- Frontend: `ClientContext.tsx` actualizado para usar disponibilidad server-side (RPC + Realtime).

### Testing
- **Caso Receta**: Orden con "Test Cafe" (0.1 Panceta + 0.5 Jamón).
- **Resultado**: Stock descontado correctamente de ingredientes.
- **Trazabilidad**: Movimientos registrados en `stock_movements`.

## 2026-01-20: Fix Creación de Clientes (Auth Trigger)

### Problema
- Fallo en registro de nuevos clientes desde el panel de SaaS (`Clients -> Nuevo Usuario`).
- Error DB: "database error" al crear usuario.
- Causa raíz: Trigger `handle_new_user` intentaba insertar columnas inexistentes y faltaba robustez en tipos de datos.

### Solución (Protocolo 'Cloud Code')
1.  **Auditoría de Schema**: Verificada estructura exacta de `clients` y `profiles`.
2.  **Fix Defensivo `handle_new_user`**:
    - Generación explícita de defaults en código (aunque DB tenga defaults).
    - Mapeo seguro de `store_id` (UUID nullable) y `role` (TEXT).
    - Uso de `ON CONFLICT` con suposición de índice único existente (`auth_user_id`, `store_id`).
3.  **Seguridad**: `SECURITY DEFINER` mantenido para permitir inserción privilegiada desde Auth.

### Archivos
- `supabase/migrations/20260120_fix_clients_creation_v2.sql`

---

## 2026-01-20 — Sistema de Agentes y Protección

**Problema:** Funciones críticas se modificaban sin auditoría, causando regresiones constantes.

**Solución implementada:**
1. Creado `docs/PROTECTED_FUNCTIONS.md` - lista de funciones que NO se tocan sin auditoría
2. Actualizado `AGENTS.md` - definición de agentes y cuándo usar cada uno
3. Creado `docs/ORCHESTRATOR_RULES.md` - reglas de detección automática de agente

**Regla establecida:** Todo prompt que toque DB o código DEBE pasar por el agente correspondiente.

**Estado:** ✅ Implementado
**Fecha:** 2026-01-20

---

## 2026-01-20 — Fix tabla incorrecta en stock (V22)

**Problema:** Restocks no se guardaban porque `update_inventory_from_movement` usaba tabla `location_stock` (inexistente)

**Causa raíz:** Migración V20 introdujo nombre de tabla incorrecto

**Solución:** Corregir a `inventory_location_stock` en V22

**Funciones modificadas:**
- `update_inventory_from_movement()` → V22

**Estado:** ✅ Aplicado
**Fecha:** 2026-01-20

---

## 2026-01-20 — Fix función transfer_stock missing

**Problema:** Restock fallaba con "function does not exist"

**Causa raíz:** Migración `20260110012800_fix_transfer_stock_final.sql` nunca fue aplicada a producción

**Solución:** Ejecutar migración manualmente en Supabase SQL Editor

**Estado:** ✅ Aplicado
**Fecha:** 2026-01-20
