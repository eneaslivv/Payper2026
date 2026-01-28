SELECT proname, prosrc 
FROM pg_proc 
WHERE proname IN ('deduct_order_stock_manual', 'deduct_order_stock');
