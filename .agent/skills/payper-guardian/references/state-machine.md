# references/state-machine.md

## Estados

| Estado | Descripción | Visible en Board |
|--------|-------------|------------------|
| `draft` | Pedido en creación | No |
| `enviado` | Enviado a cocina/barra | Sí |
| `en_preparacion` | En proceso | Sí |
| `listo` | Listo para entregar | Sí |
| `entregado` | Entregado al cliente | No (histórico) |
| `cancelado` | Cancelado | No |

## Transiciones Válidas
```
┌─────────┐
│  draft  │
└────┬────┘
     │ enviar()
     ▼
┌─────────┐
│ enviado │
└────┬────┘
     │ iniciar_preparacion()
     ▼
┌──────────────┐
│en_preparacion│
└──────┬───────┘
       │ marcar_listo()
       ▼
  ┌─────────┐
  │  listo  │
  └────┬────┘
       │ entregar()
       ▼
  ┌──────────┐
  │entregado │◄── AQUÍ se descuenta stock
  └──────────┘

Cancelación (desde cualquier estado excepto entregado):
  ┌───────────┐
  │ cancelado │
  └───────────┘
```

## Matriz de Transición

| Desde / Hacia | draft | enviado | en_prep | listo | entregado | cancelado |
|---------------|-------|---------|---------|-------|-----------|-----------|
| draft         | -     | ✅      | ❌      | ❌    | ❌        | ✅        |
| enviado       | ❌    | -       | ✅      | ❌    | ❌        | ✅        |
| en_preparacion| ❌    | ❌      | -       | ✅    | ❌        | ✅        |
| listo         | ❌    | ❌      | ❌      | -     | ✅        | ✅        |
| entregado     | ❌    | ❌      | ❌      | ❌    | -         | ❌        |
| cancelado     | ❌    | ❌      | ❌      | ❌    | ❌        | -         |

## Acciones por Transición

### draft → enviado
- Validar stock disponible
- Persistir items finales
- Notificar a cocina/barra
- Mostrar en Order Board

### enviado → en_preparacion
- Actualizar timestamp de inicio
- Mostrar en columna "En Preparación"

### en_preparacion → listo
- Actualizar timestamp de ready
- Notificar a mesero/delivery
- Mostrar en columna "Listo"

### listo → entregado
- **TRIGGER**: `deduct_stock_on_delivery()`
- Descontar insumos según recetas
- Registrar movimientos de stock
- Impactar métricas financieras
- Mover a histórico

### * → cancelado
- NO descontar stock (nunca se entregó)
- Registrar motivo de cancelación
- Liberar mesa (si aplica)
- Notificar relevantes

## Validación de Transición
```typescript
function canTransition(from: OrderState, to: OrderState): boolean {
  const allowed: Record<OrderState, OrderState[]> = {
    'draft': ['enviado', 'cancelado'],
    'enviado': ['en_preparacion', 'cancelado'],
    'en_preparacion': ['listo', 'cancelado'],
    'listo': ['entregado', 'cancelado'],
    'entregado': [],
    'cancelado': []
  };
  
  return allowed[from]?.includes(to) ?? false;
}
```

## Queries de Diagnóstico

### Pedidos activos (visibles en board)
```sql
SELECT * FROM orders
WHERE store_id = '{store_id}'
AND status NOT IN ('entregado', 'cancelado', 'draft')
ORDER BY created_at;
```

### Historial de un pedido
```sql
SELECT * FROM order_status_history
WHERE order_id = '{order_id}'
ORDER BY changed_at;
```
