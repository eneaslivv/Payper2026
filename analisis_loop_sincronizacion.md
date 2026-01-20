# Análisis de Error de Entrega y Loop de Sincronización - Orders Agent

He analizado el flujo de entrega (confirmación de pedido entregado) y el comportamiento de la cola de sincronización en `OfflineContext.tsx`.

## 1. Estado Intentado vs Estado Permitido

-   **Transición intentada**: El sistema intenta mover el pedido al estado `status = 'served'` y `delivery_status = 'delivered'`.
-   **Estados Permitidos (DB Constraints)**: 
    -   La columna `delivery_status` tiene un CHECK constraint: `CHECK (delivery_status IN ('pending', 'delivered', 'burned'))`. La transición a `'delivered'` es válida.
    -   La columna `status` no tiene restricciones de nivel DB (CHECK/ENUM), por lo que `'served'` es técnicamente válido.
-   **Conflicto Detectado**: Aunque los estados son válidos, la transición dispara el trigger `finalize_order_stock`, el cual realiza inserciones en `stock_movements`.

## 2. Rechazo del Backend y Loop del Frontend

-   **Rechazo**: El backend (RPC `confirm_order_delivery`) es `SECURITY DEFINER`, por lo que debería evadir RLS. Sin embargo, el error reportado como "loop" indica que `supabase.rpc` está devolviendo un objeto `error` (Fallo duro) en lugar de un resultado JSON.
-   **Causa del Loop**: En `OfflineContext.tsx (line 888)`, si hay al menos un evento fallido en la cola (`failedCount > 0`), el sistema programa un `triggerSync()` automático con backoff (5s a 60s). 
-   **Persistencia del Error**: Si el error es permanente (ej: un UUID malformado en el `payload` del evento o un error de RLS persistente en el `UPDATE`), el sistema entrará en un ciclo infinito de reintentos y mostrará el toast de error en cada ciclo.

## 3. Causa Raíz Probable

Identifico tres causas probables para el error "duro" que genera el loop:

1.  **UUID Malformado (Staff ID)**: Si el `staffId` enviado desde el `OrderBoard` está vacío (`''`) o es un ID local no sincronizado, el casteo `v_staff_id := p_staff_id::UUID` dentro de la RPC fallará. Aunque hay un `EXCEPTION` block, si el error ocurre en un punto donde el driver de Supabase detecta un fallo de tipo de dato antes de procesar el JSON de retorno, arrojará un error de ejecución.
2.  **Fallo de RLS en Cascada**: Si existe algún trigger secundario (ej: de auditoría o sincronización externa) que se ejecute en el contexto del usuario y NO sea `SECURITY DEFINER`, éste fallará si el perfil del staff no tiene permisos suficientes sobre tablas relacionadas.
3.  **Evento "Fantasma" en la Cola**: El loop podría no ser causado por el pedido actual, sino por un evento anterior (ej: un `CREATE_ORDER` duplicado o inválido) que quedó atascado. Al intentar entregar el pedido nuevo, se dispara el sync, el evento viejo falla, y activa el loop global.

## 4. Manejo de Error para Cortar el Loop

Para mitigar este comportamiento sin modificar el frontend aún, se propone:

1.  **Validación de Tipo en RPC**: Asegurar que la RPC maneje strings vacíos de forma segura antes de castear a UUID o usar un casteo seguro.
2.  **Manejo de Errores Críticos en OfflineContext**: Modificar la lógica de reintento para que, ante errores de tipo "403 Forbidden" o "Invalid Input", el evento sea marcado como "Irrecuperable" o se incremente el `retryCount` sin disparar el reintento automático inmediato.
3.  **Purga Activa**: Reforzar el límite de reintentos (actualmente 5) para que el evento sea eliminado de la cola local de IndexedDB después de fallar N veces consecutivas, evitando el loop infinito en la sesión del usuario.
