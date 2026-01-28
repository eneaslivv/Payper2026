-- Auditoría Pre-Unificación (Stock Agent Requirement)

-- 1. Verificar qué estados TIENEN stock deducido realmente
-- Esto nos dirá si 'Entregado' se usó alguna vez o si solo 'served' es válido.
SELECT 
    status, 
    stock_deducted, 
    count(*) as total_orders
FROM orders 
WHERE stock_deducted = TRUE
GROUP BY status, stock_deducted;

-- 2. Verificar uso reciente de la función RPC 'confirm_order_delivery'
-- (Indirectamente, buscando logs o uso. Como no hay logs de ejecución de funciones,
-- buscamos si hay órdenes served recientes sin trigger de movimiento asociado).
SELECT 
    o.id, 
    o.updated_at, 
    o.status,
    (SELECT count(*) FROM stock_movements sm WHERE sm.order_id = o.id) as movements_count
FROM orders o
WHERE o.status = 'served' 
AND o.updated_at > now() - interval '7 days'
ORDER BY o.updated_at DESC
LIMIT 10;

-- 3. Verificar si existe la función legacy 'consume_from_open_packages'
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'consume_from_open_packages';
