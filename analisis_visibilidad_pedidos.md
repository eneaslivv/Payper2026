# Análisis de Discrepancia en Visibilidad de Pedidos - Payper

Como **Orders Agent**, he analizado el flujo de persistencia y visualización de pedidos para entender por qué algunos pedidos activos son invisibles en el tablero de administración.

## Caso Analizado
- **Síntoma 1**: Pedido A es visible para el cliente (QR) pero no para el admin.
- **Síntoma 2**: Al crear Pedido B, Pedido A "reaparece" como Listo.
- **Síntoma 3**: Pedido B aparece directamente como Listo.

---

## 1. Hipótesis Claras

### Hipótesis A: El Límite de "Carga Estricta" (La más probable)
En `OfflineContext.tsx`, la función que carga los pedidos desde Supabase tiene un límite rígido de 50 registros (`.range(0, 49)`) y los ordena por `created_at DESC`. 
- **Problema**: Si el local tiene muchos pedidos antiguos (Entregados o Cancelados) que **no han sido archivados** (clic en "Cerrar Turno"), los pedidos nuevos pueden quedar fuera del "Top 50" que el admin descarga.
- **Por qué reaparece**: Al insertar un nuevo pedido (INSERT), el Realtime de Supabase dispara una actualización que fuerza la entrada del pedido al estado local, o el `refreshOrders` gatillado por el nuevo pedido altera la lista local de forma que el anterior se vuelve visible.

### Hipótesis B: El "Dispatch Station" Fantasma
El Tablero (`OrderBoard.tsx`) aplica un filtro muy estricto por `locationFilter`.
- **Problema**: Si el local tiene configurada una "Estación de Despacho" (Ej: "Barra 1") y el Pedido A entra sin estación asignada (null), **no será visible** a menos que el filtro esté en "Todas las estaciones".
- **Comportamiento**: Algunos pedidos (Pedido B) podrían estar heredando estaciones de despacho automáticamente (ej: por `node_id`), haciéndolos visibles de inmediato, mientras que otros (Pedido A) quedan en un limbo de "Sin Estación".

### Hipótesis C: Desfase de Estados (Pending vs Received)
Existe una discrepancia menor en los mappers:
- El cliente usa un RPC `get_public_order_status` que mapea estados de forma independiente.
- El admin usa `OfflineContext` que depende de `mapStatusFromSupabase`.
- Si un pedido entra con estado `received` o `paid`, el admin lo mapea a `Pendiente`. Si por algún motivo el estado en DB no coincide exactamente con los esperados por el filtro del Tablero (que filtra por `Pendiente`, `En Preparación`, `Listo`), el pedido existe pero no "califica" para ninguna columna del Kanban.

---

## 2. Puntos Exactos de Pérdida del Pedido

1.  **Carga Inicial (`OfflineContext.tsx:102`)**: El `.range(0, 49)` es un cuello de botella si no hay limpieza de historial. El admin "no ve" el pedido A porque no está en la primera página de resultados de la query de inicio.
2.  **Filtro de Interfaz (`OrderBoard.tsx:314`)**: La lógica de `locationFilter` descarta cualquier pedido que no coincida exactamente con la estación seleccionada del local storage. Los pedidos sin estación (`dispatch_station: null`) son invisibles en vistas específicas.
3.  **Mapeo de Realtime (`OfflineContext.tsx:243`)**: El evento de `INSERT` crea un pedido "parcial" que podría no tener toda la metadata necesaria para superar los filtros del Tablero hasta que se completa el fetch de fondo.

---

## 3. Propuesta de Corrección Conceptual

### Acciones en el Flujo de Datos
1.  **Optimizar Fetch de Administración**: Cambiar la query de `OfflineContext` para que pida:
    - Todos los pedidos que **NO** estén archivados (`archived_at is null`).
    - Solo usar `range` para el historial (`showHistory`).
2.  **Flexibilidad en Filtros**: Modificar `OrderBoard` para que los pedidos sin estación asignada (`dispatch_station == null`) aparezcan como "Pendientes de Asignar" o sean visibles en todas las estaciones por defecto hasta que se les asigne una.
3.  **Sincronización de Estados**: Unificar `mapStatusFromSupabase` para asegurar que `received`, `paid` y `pending` siempre caigan en la columna de entrada del tablero.

### Acciones Operativas
- **Forzar Archivo**: Incentivar el uso de "Cerrar Turno" para que la tabla de `orders` activa se mantenga ligera.
