# references/rules.md

## Contexto

Payper opera en producción real. Bares y cafés dependen del sistema para su operación diaria. Un bug puede significar:
- Pedidos perdidos
- Stock descuadrado
- Caja que no cierra
- Staff bloqueado

## Reglas Absolutas

### 1. Estados de Pedidos

❌ **PROHIBIDO**:
- Cambiar estado sin transición válida
- Saltar estados (ej: draft → entregado)
- Eliminar pedidos activos
- Ocultar pedidos del board

✅ **Transiciones válidas**:
```
draft → enviado → en_preparacion → listo → entregado
                                          → cancelado (desde cualquier estado previo a entregado)
```

### 2. Stock

❌ **PROHIBIDO**:
- Modificar cantidad sin crear `stock_movement`
- Descontar stock antes de `entregado`
- Ignorar `location_id` en operaciones
- Asumir stock global (es por location)

✅ **OBLIGATORIO**:
- Todo cambio = movimiento registrado
- Tipo de movimiento: `sale`, `adjustment`, `correction`, `waste`, `transfer`
- Usuario y timestamp siempre

### 3. Multi-Tenancy

❌ **PROHIBIDO**:
- Queries sin `store_id`
- JOINs que cruzan tiendas
- Bypass de RLS
- Asumir datos visibles

✅ **OBLIGATORIO**:
- Toda tabla tiene `store_id`
- Toda query filtra por `store_id`
- RLS activo en todas las tablas

### 4. Offline Sync

❌ **PROHIBIDO**:
- Romper `OfflineContext`
- Ignorar estado de conexión
- Asumir siempre online
- Perder datos en reconexión

✅ **OBLIGATORIO**:
- Cola de operaciones offline
- Resolución de conflictos
- Feedback visual de estado
- Retry con backoff

### 5. Triggers y Funciones

❌ **PROHIBIDO**:
- Crear triggers que conflicteen
- Modificar funciones protegidas sin auditoría
- Ignorar orden de ejecución
- Asumir atomicidad sin verificar

✅ **OBLIGATORIO**:
- Documentar en `PROTECTED_FUNCTIONS.md`
- Validar conflictos antes de crear
- Usar `DEFERRABLE` constraints apropiadamente

## Lista de Funciones Protegidas

Estas funciones NO se tocan sin aprobación de `core-guardian`:

- `deduct_stock_on_delivery()` - Descuento de stock
- `create_user_profile()` - Onboarding
- `validate_state_transition()` - Estados de pedidos
- `calculate_recipe_cost()` - Costeo de recetas
- `sync_offline_queue()` - Sincronización offline

## Verificación Pre-Cambio

Antes de cualquier modificación, verificar:

1. [ ] ¿Afecta datos en producción?
2. [ ] ¿Hay pedidos activos que se verían afectados?
3. [ ] ¿El cambio es reversible?
4. [ ] ¿Se mantiene la auditoría?
5. [ ] ¿RLS sigue funcionando?
6. [ ] ¿Offline sync sigue funcionando?

Si cualquier respuesta es "no sé" → **PARAR y auditar primero**.

## Frase de Seguridad

> "Prefiero no tocar esto hasta validarlo, porque puede romper operación."

Esta frase es **criterio**, no debilidad.
