# Auditoría: Sistema Dual de Items de Pedido (Payper)

Este documento detalla la coexistencia de la tabla `order_items` y el campo `items` (JSONB) en la tabla `orders`, identificando sus usos, inconsistencias y una propuesta de unificación.

---

## 1. Uso de `order_items` (Tabla Relacional)

La tabla `order_items` se utiliza principalmente como el **sistema moderno y estructurado** para la persistencia masiva y el procesamiento de stock.

-   **Backend (RPC):** La función `create_order_with_stock_deduction` recibe un JSONB pero inserta los datos exclusivamente en la tabla `order_items` para procesar las recetas de inventario.
-   **Frontend (Cliente):** `ClientContext.tsx` realiza un `.select('*, order_items(*)')` para mostrar el historial de pedidos al cliente.
-   **Seguridad (RLS):** Tiene sus propias políticas de seguridad basadas en el `store_id` del pedido padre.
-   **Reportes:** Migraciones recientes como `restore_public_order_status_v10.sql` utilizan esta tabla para reconstruir estados de pedido de forma segura.

## 2. Uso de `items` (Campo JSONB en `orders`)

El campo `items` en la tabla `orders` actúa como un **sistema de acceso rápido y caché de compatibilidad**.

-   **Frontend (Administrador/Board):** `OfflineContext.tsx` y `OrderBoard.tsx` utilizan este campo como "fallback". Si `order_items` no está presente en la consulta de Supabase, el sistema renderiza el contenido del JSONB.
-   **Triggers de Stock:** Sorprendentemente, muchos triggers de stock (ej. `fix_stock_deduction_secure_v5.sql`) todavía extraen los items del JSONB de la tabla `orders` en lugar de la tabla relacional.
-   **Integraciones Externas:** `InvoiceProcessor.tsx` y el procesamiento de facturas guardan los items extraídos directamente en este campo JSONB.
-   **Emails:** Las plantillas de correo (`mp-webhook`, `email-templates.ts`) consumen los datos de este array JSONB para listar los productos al usuario.

---

## 3. Inconsistencias y Sincronización

### Inconsistencias Detectadas:
1.  **Split-Brain:** Existe un riesgo alto de que `orders.items` no coincida con `order_items` si se actualiza uno y no el otro (ej. cancelaciones parciales o modificaciones manuales en la DB).
2.  **Lógica de Fallback:** En `OfflineContext.tsx`, la lógica prioriza `order_items` pero genera un objeto "flattendo" para el frontend. Si un pedido solo tiene datos en una de las dos fuentes, el frontend podría mostrar información incompleta (ej. perdiendo los `product_id` o `notes` si el mapping falla).
3.  **Deducción de Stock Duplicada/Omitida:** Algunos procedimientos almacenados buscan items en el JSONB y otros en la tabla. Si un pedido se crea vía RPC (solo tabla) pero un trigger espera JSONB, el stock **no se descontará**.

### Estado de Sincronización:
-   **No existe un trigger de duplicación bidireccional automático.** 
-   El sistema depende de que la capa de aplicación (Frontend o RPC) escriba en ambos lugares, o de que el código de lectura maneje el fallback manualmente.

---

## 4. Propuesta de Unificación (Estrategia Relacional)

Para eliminar la redundancia y los riesgos de integridad, se propone:

1.  **Deprecar el campo `orders.items`:** Mantenerlo inicialmente como solo lectura para historial viejo, pero dejar de escribir en él.
2.  **Centralización en `order_items`:** 
    -   Modificar todos los componentes de UI (`OrderBoard`, `Dashboard`) para que siempre consuman la relación `order_items`.
    -   Asegurar que `supabaseMappers.ts` maneje la inserción relacional en todos los flujos (Web, Admin, Offline).
3.  **Trigger de Integridad (Opcional):** Si se decide mantener el JSONB por velocidad de lectura (caché), implementar un trigger de base de datos `AFTER INSERT OR UPDATE ON order_items` que mantenga sincronizado el campo `orders.items` de forma automática e invisible para la aplicación.
4.  **Migración de Datos:** Un script "One-Time" para mover todos los items del JSONB a la tabla relacional en registros antiguos que aún no los tengan.

---
> [!IMPORTANT]
> Esta auditoría confirma que el sistema está en un estado de transición. La tabla `order_items` es el futuro, pero el JSONB `items` sigue siendo el corazón de la visualización en el Admin Board y de muchos triggers críticos de stock.
