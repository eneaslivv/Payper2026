-- TAREA 3: Verificar Consistencia de Stock (Stock-Agent)
-- Objetivos: Detectar discrepancias entre 'inventory_items' (Global) y 'inventory_location_stock' (Ubicaciones)
-- Reemplazar el store_id si es diferente.
SELECT 
    ii.name,
    ii.closed_stock as "Global Cerrado",
    ii.current_stock as "Global Total",
    COALESCE((SELECT SUM(closed_units) FROM inventory_location_stock WHERE item_id = ii.id), 0) as "Suma Ubicaciones",
    ABS(ii.closed_stock - COALESCE((SELECT SUM(closed_units) FROM inventory_location_stock WHERE item_id = ii.id), 0)) as "Diferencia"
FROM inventory_items ii
WHERE ii.store_id = 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533' -- ID de Prod
ORDER BY "Diferencia" DESC
LIMIT 10;

--------------------------------------------------------------------------------

-- TAREA 5: Verificar Triggers Activos (Database-Agent)
-- Objetivo: Confirmar limpieza de triggers legacy.

-- 1. Triggers en orders (Debe tener SOLO: trg_deduct_stock_on_delivery)
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'orders'
ORDER BY trigger_name;

-- 2. Triggers en inventory_location_stock (Debe tener SOLO: trg_sync_item_stock_unified)
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'inventory_location_stock'
ORDER BY trigger_name;

-- 3. Triggers en stock_movements (Verificar update_inventory_from_movement)
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'stock_movements'
ORDER BY trigger_name;
