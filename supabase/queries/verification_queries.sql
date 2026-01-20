-- TAREA 1: Verificar triggers de stock
-- Ejecutar estas queries para confirmar que solo quedan los triggers unificados.

-- 1. Verificar triggers en tabla 'orders'
-- Esperado: Solo debe aparecer 'trg_deduct_stock_on_delivery'
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'orders'
ORDER BY trigger_name;

-- 2. Verificar triggers en tabla 'inventory_location_stock'
-- Esperado: Solo debe aparecer 'trg_sync_item_stock_unified'
SELECT trigger_name, event_manipulation, action_timing
FROM information_schema.triggers 
WHERE event_object_table = 'inventory_location_stock'
ORDER BY trigger_name;
