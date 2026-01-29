# 🧠 Lógica Core de Stock: Sistema Híbrido

> [!IMPORTANT]
> Este documento es la **Fuente de Verdad** sobre cómo Payper maneja el descuento de stock.
> Cualquier implementación técnica debe obedecer estas reglas de negocio.

## 1. Concepto Fundamental: El Ítem Flexible

Un mismo ítem de inventario (ej: "Botella de Coca Cola", "Lata de Cerveza") tiene una **doble naturaleza** en Payper. No son mutuamente excluyentes.

### A. Venta Directa ("Producto Solo")
*   **Caso:** El cliente pide una Coca Cola.
*   **Acción:** Se añade el ítem directamente a la orden.
*   **Descuento:** Se resta **1 unidad** entera del stock.
*   **Lógica:** `Stock = Stock - 1`

### B. Uso en Receta ("Ingrediente/Composición")
*   **Caso:** El cliente pide un "Fernet con Coca".
*   **Acción:** Se vende el producto "Fernet con Coca" (que tiene una receta).
*   **Descuento:** La receta indica usar **0.5 unidades** de la misma "Botella de Coca Cola".
*   **Lógica:** `Stock = Stock - 0.5`

## 2. Arquitectura de Soporte (Opción B)

Para soportar esta flexibilidad sin duplicar datos, el sistema permite dos caminos para llegar al descuento:

```mermaid
graph TD
    Order[Orden de Venta] --> CheckID{¿Qué ID se vendió?}
    
    CheckID -- ID de Inventory Item --> DirectSale[Venta Directa]
    CheckID -- ID de Product --> RecipeLookup[Buscar Receta]
    
    DirectSale --> DeductOne[Descontar 1.0 Unidad]
    
    RecipeLookup --> HasRecipe{¿Tiene Receta?}
    HasRecipe -- SI --> DeductIngredients[Descontar Ingredientes (Porcentual)]
    HasRecipe -- NO --> DeductGeneric[Descontar 1.0 del Producto Mismo]
    
    DeductOne --> StockUpdate[Actualizar Stock]
    DeductIngredients --> StockUpdate
```

## 3. Reglas de Negocio en Código

El motor de deducción (`deduct_order_stock_unified`) aplica esta prioridad:

1.  **¿Es un Producto con Receta?**
    *   Si el ID vendido existe en `products` Y tiene entradas en `product_recipes`: **Ejecutar Receta**.
    
2.  **¿Es un Item con Receta "Ad-Hoc"?** (Soporte Dual)
    *   Si el ID vendido existe en `inventory_items` Y tiene configuración de receta en `inventory_item_recipes`: **Ejecutar Receta**.
    
3.  **Venta Directa (Fallback)**
    *   Si no tiene receta configurada en ningún lado: **Asumir Venta Directa**.
    *   Buscar el ítem en `inventory_items` y descontar la cantidad vendida (ej: 1, 2, 3).

## 4. Auditoría y Mantenimiento

Para mantener la sanidad del sistema, debemos vigilar:
*   **Nombres Duplicados:** Evitar tener "Coca Cola" en Products y "Coca Cola" en Inventory con IDs diferentes, pues confunde al operador.
*   **Items Híbridos:** Monitorear qué items se usan como ingredientes Y como venta directa para asegurar que el stock no se rompa (ej: que no se vendan fracciones si no está permitido).
