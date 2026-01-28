-- Solo conteo de estatus para verificar consitencia
-- Queremos saber si hay histórico de 'Entregado' con stock deducido.
SELECT 
    status, 
    stock_deducted, 
    count(*) as total_orders
FROM orders 
WHERE stock_deducted = TRUE
GROUP BY status, stock_deducted
ORDER BY total_orders DESC;
