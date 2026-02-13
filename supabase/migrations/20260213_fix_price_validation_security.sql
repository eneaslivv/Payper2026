-- =============================================
-- FIX #9: PRICE VALIDATION & SECURITY
-- Fecha: 2026-02-13
-- Problema:
--   RPC create_order puede recibir precios manipulados del frontend:
--   - Cliente puede enviar price_unit=$0.01
--   - No hay validación server-side
--   - Total calculado en frontend es confiado
-- Solución:
--   1. Deprecar create_order_with_stock_deduction (insegura)
--   2. Crear create_order_secure con validación de precios
--   3. Agregar trigger de validación de precios
-- =============================================

-- 1. DEPRECATE OLD FUNCTION (Leave for backwards compatibility but mark as deprecated)
COMMENT ON FUNCTION create_order_with_stock_deduction IS
'DEPRECATED: Esta función es insegura (no valida precios server-side).
Use create_order_secure en su lugar.
Esta función será removida en una futura versión.';

-- 2. SECURE ORDER CREATION RPC
CREATE OR REPLACE FUNCTION create_order_secure(
    p_store_id UUID,
    p_client_id UUID,
    p_node_id UUID DEFAULT NULL,
    p_channel TEXT DEFAULT 'pos',
    p_payment_method TEXT DEFAULT 'cash',
    p_order_items JSONB DEFAULT '[]',
    p_customer_name TEXT DEFAULT NULL,
    p_customer_email TEXT DEFAULT NULL,
    p_table_number TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_id UUID;
    v_item JSONB;
    v_product_id UUID;
    v_quantity NUMERIC;
    v_db_price NUMERIC;
    v_subtotal NUMERIC := 0;
    v_total NUMERIC := 0;
    v_items_with_prices JSONB := '[]'::JSONB;
    v_menu_item RECORD;
BEGIN
    -- CRITICAL: Validate caller has permission for this store
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND store_id = p_store_id
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permiso para crear órdenes en esta tienda'
        );
    END IF;

    -- CRITICAL: Validate and recalculate prices from DB
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_items)
    LOOP
        v_product_id := (v_item->>'productId')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 1);

        -- Get REAL price from DB (NOT from frontend)
        -- Try menu_items first (with price_override), fallback to products.base_price
        SELECT
            COALESCE(mi.price_override, p.price, p.base_price, 0) as effective_price,
            p.name
        INTO v_menu_item
        FROM products p
        LEFT JOIN menu_items mi ON mi.product_id = p.id
        WHERE p.id = v_product_id
          AND p.store_id = p_store_id
          AND p.available = TRUE
        LIMIT 1;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', FALSE,
                'error', 'PRODUCT_NOT_FOUND',
                'message', 'Producto no encontrado o no disponible: ' || v_product_id,
                'product_id', v_product_id
            );
        END IF;

        v_db_price := v_menu_item.effective_price;

        -- CRITICAL: Use DB price, NOT client-provided price
        v_subtotal := v_subtotal + (v_db_price * v_quantity);

        -- Build validated items array
        v_items_with_prices := v_items_with_prices || jsonb_build_array(
            jsonb_build_object(
                'id', gen_random_uuid(),
                'productId', v_product_id,
                'name', v_menu_item.name,
                'quantity', v_quantity,
                'price_unit', v_db_price,  -- SERVER-VALIDATED PRICE
                'inventory_items_to_deduct', '[]'
            )
        );
    END LOOP;

    v_total := v_subtotal; -- Add taxes/fees here if needed

    -- Create order with SERVER-VALIDATED prices and totals
    INSERT INTO orders (
        id,
        store_id,
        client_id,
        customer_name,
        customer_email,
        status,
        channel,
        total_amount,
        subtotal,
        items,
        payment_method,
        is_paid,
        node_id,
        table_number,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_store_id,
        p_client_id,
        p_customer_name,
        p_customer_email,
        'pending',
        p_channel,
        v_total,
        v_subtotal,
        v_items_with_prices,
        p_payment_method,
        FALSE,
        p_node_id,
        p_table_number,
        NOW()
    )
    RETURNING id INTO v_order_id;

    -- Create order_items (denormalized for queries)
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items_with_prices)
    LOOP
        INSERT INTO order_items (
            order_id,
            product_id,
            quantity,
            unit_price,
            store_id
        ) VALUES (
            v_order_id,
            (v_item->>'productId')::UUID,
            (v_item->>'quantity')::NUMERIC,
            (v_item->>'price_unit')::NUMERIC,
            p_store_id
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'order_id', v_order_id,
        'total_amount', v_total,
        'subtotal', v_subtotal,
        'items', v_items_with_prices,
        'message', 'Orden creada exitosamente con precios validados'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', FALSE,
        'error', SQLSTATE,
        'message', SQLERRM
    );
END;
$$;

-- 3. TRIGGER: Validate Price Tampering on Manual Inserts
CREATE OR REPLACE FUNCTION validate_order_prices()
RETURNS TRIGGER AS $$
DECLARE
    v_item JSONB;
    v_product_id UUID;
    v_client_price NUMERIC;
    v_db_price NUMERIC;
    v_price_diff NUMERIC;
    v_tolerance NUMERIC := 0.01; -- Allow 1 cent tolerance for rounding
BEGIN
    -- Only validate if items are provided
    IF NEW.items IS NULL OR jsonb_array_length(NEW.items) = 0 THEN
        RETURN NEW;
    END IF;

    -- Check each item's price against DB
    FOR v_item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
        v_product_id := (v_item->>'productId')::UUID;
        v_client_price := (v_item->>'price_unit')::NUMERIC;

        -- Get real price from DB
        SELECT COALESCE(mi.price_override, p.price, p.base_price, 0)
        INTO v_db_price
        FROM products p
        LEFT JOIN menu_items mi ON mi.product_id = p.id
        WHERE p.id = v_product_id
          AND p.store_id = NEW.store_id
        LIMIT 1;

        -- Calculate difference
        v_price_diff := ABS(v_client_price - COALESCE(v_db_price, 0));

        -- If price differs by more than tolerance, LOG WARNING
        IF v_price_diff > v_tolerance THEN
            RAISE WARNING '[Price Validation] Order %: Product % has suspicious price. Client: $%, DB: $%, Diff: $%',
                NEW.id, v_product_id, v_client_price, v_db_price, v_price_diff;

            -- Optional: Create alert
            INSERT INTO stock_alerts (
                store_id,
                inventory_item_id,
                alert_type,
                stock_level,
                expected_stock,
                message,
                order_id
            ) VALUES (
                NEW.store_id,
                v_product_id,
                'low_stock', -- Reusing this type, ideally create 'price_tamper'
                v_client_price,
                v_db_price,
                'Precio sospechoso detectado: Cliente envió $' || v_client_price || ' pero DB tiene $' || v_db_price,
                NEW.id
            );
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. CREATE TRIGGER (Warning only, doesn't block)
DROP TRIGGER IF EXISTS trg_validate_order_prices ON orders;
CREATE TRIGGER trg_validate_order_prices
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION validate_order_prices();

-- 5. VIEW: Price Tampering Audit
CREATE OR REPLACE VIEW price_tampering_audit AS
SELECT
    o.id as order_id,
    o.order_number,
    o.store_id,
    s.name as store_name,
    o.total_amount,
    o.subtotal,
    o.created_at,
    -- Extract items with suspicious prices
    (
        SELECT json_agg(
            json_build_object(
                'product_id', (item->>'productId')::UUID,
                'client_price', (item->>'price_unit')::NUMERIC,
                'name', item->>'name'
            )
        )
        FROM jsonb_array_elements(o.items) AS item
    ) as order_items,
    -- Get alerts for this order
    (
        SELECT json_agg(
            json_build_object(
                'message', sa.message,
                'stock_level', sa.stock_level,
                'expected_stock', sa.expected_stock,
                'created_at', sa.created_at
            )
        )
        FROM stock_alerts sa
        WHERE sa.order_id = o.id
          AND sa.message LIKE '%Precio sospechoso%'
    ) as price_alerts
FROM orders o
JOIN stores s ON o.store_id = s.id
WHERE EXISTS (
    SELECT 1 FROM stock_alerts sa
    WHERE sa.order_id = o.id
      AND sa.message LIKE '%Precio sospechoso%'
)
ORDER BY o.created_at DESC;

-- 6. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION create_order_secure TO authenticated;
GRANT EXECUTE ON FUNCTION validate_order_prices TO authenticated;
GRANT SELECT ON price_tampering_audit TO authenticated;

-- 7. COMMENT
COMMENT ON FUNCTION create_order_secure IS
'Secure order creation RPC with SERVER-SIDE price validation.
Fetches real prices from products/menu_items tables.
Recalculates totals based on DB prices, NOT client input.
Multi-tenant safe: validates caller belongs to target store.
Use this instead of create_order_with_stock_deduction.';

COMMENT ON FUNCTION validate_order_prices IS
'Trigger that validates order item prices against DB.
Logs warnings and creates alerts if prices differ by >1 cent.
Does NOT block orders (warning only) to avoid breaking legitimate edge cases.
Review price_tampering_audit view for suspicious activity.';

COMMENT ON VIEW price_tampering_audit IS
'Audit view showing orders with suspicious price discrepancies.
Shows client-provided prices vs DB prices.
Review this regularly for potential price manipulation attempts.';
