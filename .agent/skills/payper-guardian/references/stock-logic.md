# references/stock-logic.md

## Modelo de Datos

### Insumos (supplies)
```sql
supplies:
  - id
  - store_id
  - name
  - unit (ml, gr, unidad)
  - min_stock
  - created_at
```

### Stock por Location
```sql
location_stock:
  - id
  - supply_id
  - location_id
  - store_id
  - quantity
  - updated_at
```

### Movimientos
```sql
stock_movements:
  - id
  - supply_id
  - location_id
  - store_id
  - quantity (positivo = entrada, negativo = salida)
  - movement_type (sale, adjustment, correction, waste, transfer, restock)
  - reference_id (order_id, transfer_id, etc.)
  - user_id
  - notes
  - created_at
```

## Reglas de Descuento

### Cuándo se descuenta

El stock se descuenta **ÚNICAMENTE** cuando:
- Un pedido pasa a estado `entregado`
- Se ejecuta el trigger `deduct_stock_on_delivery()`

### Qué se descuenta

Para productos con receta:
1. Se busca la receta del producto
2. Se iteran los `recipe_items`
3. Por cada insumo: `cantidad_receta × cantidad_pedida`

Ejemplo:
```
Producto: "Café con Tostada"
Receta:
  - Café molido: 15gr
  - Panceta: 50gr
  - Pan: 1 unidad

Pedido: 2 unidades

Descuento:
  - Café molido: 30gr
  - Panceta: 100gr
  - Pan: 2 unidades
```

### Location del descuento

El descuento se hace en el `location_id` asociado al pedido:
- Si el pedido tiene location → usar ese
- Si no tiene → usar location default de la tienda

## Tipos de Movimiento

| Tipo | Cantidad | Uso |
|------|----------|-----|
| `sale` | negativo | Venta (automático en delivery) |
| `adjustment` | +/- | Corrección manual |
| `correction` | +/- | Corrección por error |
| `waste` | negativo | Merma/pérdida |
| `transfer_out` | negativo | Salida por transferencia |
| `transfer_in` | positivo | Entrada por transferencia |
| `restock` | positivo | Reposición de stock |

## Flujo de Descuento
```
[Pedido entregado]
       ↓
[Trigger: deduct_stock_on_delivery]
       ↓
[Buscar order_items]
       ↓
[Para cada item:]
  ├─ [Tiene receta?]
  │    ├─ Sí → Descontar insumos de receta
  │    └─ No → Descontar producto directo (si aplica)
  └─ [Crear stock_movement tipo 'sale']
       ↓
[Actualizar location_stock]
       ↓
[Verificar stock mínimo → alertar si bajo]
```

## Queries de Diagnóstico

### Ver stock actual por location
```sql
SELECT s.name, ls.quantity, l.name as location
FROM location_stock ls
JOIN supplies s ON s.id = ls.supply_id
JOIN locations l ON l.id = ls.location_id
WHERE ls.store_id = '{store_id}';
```

### Ver movimientos de un insumo
```sql
SELECT * FROM stock_movements
WHERE supply_id = '{supply_id}'
ORDER BY created_at DESC
LIMIT 50;
```

### Verificar descuentos de un pedido
```sql
SELECT * FROM stock_movements
WHERE reference_id = '{order_id}'
AND movement_type = 'sale';
```
