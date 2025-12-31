INSERT INTO public.stores (id, slug, name, is_active, created_at)
VALUES (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'demo',
    'Demo Coffee Shop',
    true,
    NOW()
) ON CONFLICT (id) DO UPDATE SET slug = 'demo', name = 'Demo Coffee Shop';

INSERT INTO public.loyalty_configs (id, store_id, config, created_at)
VALUES (
    'bbbbbbbb-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    '{"isActive": true, "baseAmount": 10, "basePoints": 1, "rounding": "down"}'::jsonb,
    NOW()
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, store_id, name, email, wallet_balance, loyalty_points, created_at)
VALUES (
    'cccccccc-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'Test User',
    'test@demo.com',
    100.00,
    500,
    NOW()
) ON CONFLICT (id) DO UPDATE SET wallet_balance = 100.00, loyalty_points = 500;

INSERT INTO public.inventory_items (id, store_id, name, price, unit_type, created_at)
VALUES 
    ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cafe Americano', 3.50, 'unit', NOW()),
    ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Latte', 4.50, 'unit', NOW()),
    ('dddddddd-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cappuccino', 4.00, 'unit', NOW()),
    ('dddddddd-0000-0000-0000-000000000004', 'aaaaaaaa-0000-0000-0000-000000000001', 'Medialunas x2', 2.50, 'unit', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.loyalty_rewards (id, store_id, name, points, is_active, product_id, created_at)
VALUES 
    ('eeeeeeee-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Cafe Gratis', 100, true, NULL, NOW()),
    ('eeeeeeee-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Descuento $5', 200, true, NULL, NOW()),
    ('eeeeeeee-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Latte Gratis', 150, true, NULL, NOW())
ON CONFLICT (id) DO NOTHING;
