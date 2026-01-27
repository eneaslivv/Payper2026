-- 1. Verificar si quedaron órdenes con status 'delivered' (Debe dar 0)
SELECT count(*) as legacy_remaining FROM orders WHERE status = 'delivered';

-- 2. Test del Trigger (Si falla, lanzará error aquí)
DO $$
DECLARE
    v_order_id UUID;
BEGIN
    -- Crear una orden dummy para probar
    INSERT INTO orders (store_id, customer_name, total_amount, status)
    VALUES ((SELECT id FROM stores LIMIT 1), 'Test Trigger', 0, 'pending')
    RETURNING id INTO v_order_id;

    -- Insertar un item dummy
    INSERT INTO order_items (order_id, name, price_unit, status)
    VALUES (v_order_id, 'Item Test', 0, 'pending');

    -- PROBAR TRIGGER: Actualizar orden a 'served'
    UPDATE orders SET status = 'served' WHERE id = v_order_id;

    -- Verificar si el item cambió (Debe dar TRUE)
    IF EXISTS (SELECT 1 FROM order_items WHERE order_id = v_order_id AND status = 'served') THEN
        RAISE NOTICE '✅ TEST PASSED: Trigger sincronizó el estado.';
    ELSE
        RAISE EXCEPTION '❌ TEST FAILED: Item sigue pending.';
    END IF;

    -- Rollback para no ensuciar DB
    RAISE EXCEPTION 'Test finalizado (Rolling back cambios)'; 
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%Test finalizado%' THEN
        RAISE NOTICE 'Test Limpio Exitoso.';
    ELSE
        RAISE NOTICE 'Error en Test: %', SQLERRM;
    END IF;
END $$;
