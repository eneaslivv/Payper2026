-- ===================================
-- FIX: Email Function & Test Data Sync
-- ===================================

-- 1. FIX FUNCTION: enqueue_payment_email
-- PROBLEM: Was trying to read 'customer_email' from 'orders' table (column doesn't exist).
-- SOLUTION: Fetch email from 'clients' table using 'client_id'.

CREATE OR REPLACE FUNCTION public.enqueue_payment_email(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order record;
    v_client_email text;
BEGIN
    -- Get order details including client_id
    SELECT o.id, o.store_id, o.is_paid, o.total_amount, o.order_number, o.client_id
    INTO v_order
    FROM orders o
    WHERE o.id = p_order_id;
    
    -- Safety check: if order doesn't exist, exit
    IF v_order.id IS NULL THEN
        RETURN;
    END IF;

    -- Fetch client email if client_id exists
    IF v_order.client_id IS NOT NULL THEN
        SELECT email INTO v_client_email
        FROM clients
        WHERE id = v_order.client_id;
    END IF;

    -- Only enqueue if paid AND we found an email
    IF v_order.is_paid = true AND v_client_email IS NOT NULL THEN
        INSERT INTO email_queue (order_id, store_id, recipient, subject, payload)
        VALUES (
            v_order.id,
            v_order.store_id,
            v_client_email,
            'Tu pedido #' || v_order.order_number || ' ha sido confirmado',
            jsonb_build_object(
                'order_number', v_order.order_number,
                'total', v_order.total_amount
            )
        );
    END IF;
END;
$$;


-- 2. FIX DATA: 'test cafe' FK Violation
-- PROBLEM: Frontend uses Product ID, but Inventory Item might have a different ID or be missing.
-- SOLUTION: Find 'test cafe' in PRODUCTS, and ensure it exists in INVENTORY_ITEMS with the SAME ID.

DO $$
DECLARE
    v_product_id uuid;
    v_store_id uuid;
BEGIN
    -- Find the ID used in Products table (this is what the frontend sees in the first list)
    SELECT id, store_id INTO v_product_id, v_store_id
    FROM products 
    WHERE name ILIKE '%test cafe%' 
    LIMIT 1;

    IF v_product_id IS NOT NULL THEN
        -- Insert/Update into inventory_items using the SAME ID from products
        INSERT INTO inventory_items (
            id, store_id, name, price, item_type, unit_type, current_stock, min_stock, is_menu_visible, is_active, category_id
        )
        VALUES (
            v_product_id, -- FORCE SAME ID
            v_store_id,
            'test cafe', 
            6070.00, 
            'sellable', 
            'unit', 
            100, -- Give some stock to be safe
            0, 
            true, 
            true,
            (SELECT id FROM categories WHERE store_id = v_store_id LIMIT 1) -- Fallback category
        )
        ON CONFLICT (id) DO UPDATE SET
            item_type = 'sellable',
            is_active = true,
            is_menu_visible = true;
            
        RAISE NOTICE 'Fixed test cafe: Synced InventoryItem ID to Product ID: %', v_product_id;
    ELSE
        RAISE NOTICE 'Product "test cafe" not found in products table. Skipping data fix.';
    END IF;
END $$;
