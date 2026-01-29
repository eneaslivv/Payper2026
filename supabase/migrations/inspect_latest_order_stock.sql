-- Inspect the latest order to diagnose stock deduction failure
WITH latest_order AS (
    SELECT * 
    FROM orders 
    ORDER BY created_at DESC 
    LIMIT 1
)
SELECT 
    o.id as order_id,
    o.order_number,
    o.status,
    o.payment_status,
    o.is_paid,
    o.stock_deducted,
    o.created_at,
    jsonb_pretty(o.items) as items_json,
    (SELECT count(*) FROM stock_movements sm WHERE sm.order_id = o.id) as movements_count,
    -- Check if items exist in inventory_items (for direct sale logic)
    (
        SELECT jsonb_agg(jsonb_build_object(
            'product_id', elem->>'product_id', 
            'params_id', elem->>'id',
            'exists_in_inventory', EXISTS(SELECT 1 FROM inventory_items WHERE id = COALESCE((elem->>'product_id')::uuid, (elem->>'id')::uuid))
        ))
        FROM jsonb_array_elements(o.items) elem
    ) as inventory_check
FROM latest_order o;
