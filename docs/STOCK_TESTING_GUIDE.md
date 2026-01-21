# Guía de Testing de Stock (Manual de Estrés)

Esta guía sirve para validar que el sistema de stock es robusto y que los flujos de `Direct Sale` y `Recetas` funcionan correctamente.

## 1. Verificación Automática (SQL)
Ejecutá el script `supabase/tests/stock_verification_suite.sql` en tu Editor SQL de Supabase.
Si todo da `PASS`, la estructura de base de datos es correcta.

## 2. Testing Manual (Flujos Reales)

### Escenario A: Venta Directa (Sin Receta)
**Objetivo:** Verificar que un producto "simple" descuente 1 unidad entera.

1.  **Preparación:**
    *   Producto: `Coca Cola` (o `TEST` si está configurado sin receta).
    *   Stock Inicial: Anotá el valor de "Unidades Cerradas" en Inventario.
2.  **Acción:**
    *   En POS/App, vendé 1 unidad.
    *   Confirmá que la orden quede en estado `delivered` o `served`.
3.  **Verificación:**
    *   El stock debe bajar exactamente **1 unidad**.
    *   En la DB (`stock_movements`), el último registro debe tener `reason = 'direct_sale'`.

### Escenario B: Venta con Receta (Fractional)
**Objetivo:** Verificar que un trago/café descuente ingredientes.

1.  **Preparación:**
    *   Producto: `Latte` (Receta: 200ml Leche, 18g Café).
    *   Stock Inicial: Anotá el "Stock Abierto" o "Restante" de la Leche.
2.  **Acción:**
    *   Vendé 1 `Latte`.
3.  **Verificación:**
    *   El stock de Leche debe bajar **0.2 L** (o 200ml).
    *   En la DB, debe haber registros con `reason = 'recipe_consumption'`.

### Escenario C: Creación Rápida (Status 'Served')
**Objetivo:** Verificar que el sistema no falla cuando la orden se crea directamente como entregada (Bypass de estados).

1.  Si tenés forma de crear una orden "rápida" (ej: "Cobrar y Entregar"), hacelo.
2.  Verificá que el stock se descuente inmediatamente. (Esto valida el trigger `AFTER INSERT`).

## Qué hacer si falla
Si encontrás discrepancias:

1.  Anotá el **ID de la Orden**.
2.  Ejecutá: `SELECT * FROM stock_movements WHERE order_id = 'ORDEN_ID';`
3.  Si no hay movimientos, falló el trigger. Revisar logs.
4.  Si hay movimientos pero el valor está mal, revisá la Receta.

---
**Generado por Core Guardian**
