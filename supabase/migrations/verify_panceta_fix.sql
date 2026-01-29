-- Verify if the order was finally processed
SELECT id, stock_deducted, status, updated_at 
FROM orders 
WHERE id = '64d6552e-3669-4e1c-b924-83fa6c83f47d';
