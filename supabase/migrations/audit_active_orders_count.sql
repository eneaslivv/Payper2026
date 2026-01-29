-- Audit Active Orders vs Board Logic
SELECT 
    status,
    COUNT(*) as count,
    COUNT(CASE WHEN archived_at IS NOT NULL THEN 1 END) as archived_count,
    COUNT(CASE WHEN is_paid = FALSE AND (payment_provider = 'mercadopago' OR payment_method = 'mercadopago') THEN 1 END) as unpaid_mp_count
FROM orders
WHERE store_id = (SELECT store_id FROM profiles WHERE email = 'livveneas@gmail.com' LIMIT 1) -- Using user's email from metadata
GROUP BY status;
