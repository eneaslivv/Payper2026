-- TAREA 4: Testing del flujo completo

-- ### Test A: Sincronización de Stock (Verificar integridad)
-- Reemplazar '%panceta%' con el nombre del producto que desees verificar.
SELECT 
    ii.name,
    ii.closed_stock as "Global Cerrado",
    ii.current_stock as "Global Total",
    SUM(ils.closed_units) as "Suma Ubicaciones"
FROM inventory_items ii
LEFT JOIN inventory_location_stock ils ON ils.item_id = ii.id
WHERE ii.name ILIKE '%panceta%'
GROUP BY ii.id, ii.name, ii.closed_stock, ii.current_stock;
-- Resultado esperado: "Global Cerrado" debe ser IGUAL a "Suma Ubicaciones"

--------------------------------------------------------------------------------

-- ### TAREA 5: Diagnóstico Profundo (Solo si falla el descuento de stock)
-- Reemplazar '<ORDER_ID>' con el ID de la orden problemática.

-- 1. Verificar si la orden tiene items JSONB poblados
SELECT id, status, is_paid, stock_deducted, jsonb_array_length(items) as item_count
FROM orders
WHERE id = '<ORDER_ID>';

-- 2. Verificar movimientos de stock asociados
SELECT * FROM stock_movements WHERE order_id = '<ORDER_ID>';

-- 3. Verificar permisos del trigger (Ejecutar como admin)
SELECT has_function_privilege('authenticated', 'deduct_order_stock()', 'execute');
