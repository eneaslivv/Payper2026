-- ================================================================
-- PAYPER AUDIT FIX COMPLETE
-- Fecha: 2026-01-29
-- Combines CONSOLIDATED_FIX_20260129.sql with Audit Menu/Product Fixes
-- ================================================================

-- =============================================
-- PASO 1: AUTOSANACIÓN DE ITEMS FANTASMAS
-- Crea inventory_items para productos que solo existen en "products"
-- =============================================

DO $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- Insert missing items
    WITH missing_products AS (
        SELECT p.id, p.name, p.store_id
        FROM products p
        LEFT JOIN inventory_items ii ON p.id = ii.id
        WHERE ii.id IS NULL
    ),
    inserted AS (
        INSERT INTO inventory_items (
            id, 
            store_id, 
            name, 
            description, 
            sku, 
            unit_type, 
            current_stock, 
            min_stock_alert, 
            item_type, 
            is_active
        )
        SELECT 
            mp.id,
            mp.store_id,
            mp.name,
            'Auto-generated from Product',
            'GEN-' || SUBSTRING(mp.id::text, 1, 8),
            'unit',
            0,
            5,
            'sellable',
            true
        FROM missing_products mp
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM inserted;

    RAISE NOTICE '✅ PASO 1 COMPLETO: Auto-created % missing inventory items.', v_count;
END $$;

-- =============================================
-- PASO 2: FIX CONFLICTO RPC
-- Elimina TODAS las versiones de la función y recrea la correcta
-- =============================================

DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, uuid);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid, text);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(text, text);
DROP FUNCTION IF EXISTS public.confirm_order_delivery(uuid);

CREATE OR REPLACE FUNCTION public.confirm_order_delivery(p_order_id UUID, p_staff_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_exists BOOLEAN;
BEGIN
    SELECT EXISTS(SELECT 1 FROM orders WHERE id = p_order_id) INTO v_order_exists;
    
    IF NOT v_order_exists THEN
        RETURN jsonb_build_object('success', false, 'message', 'Pedido no encontrado');
    END IF;

    UPDATE orders 
    SET status = 'served',
        delivery_status = 'delivered',
        delivered_at = NOW(),
        delivered_by = p_staff_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    RETURN jsonb_build_object('success', true, 'message', 'Pedido entregado y stock descontado');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;

-- Dar permisos
GRANT EXECUTE ON FUNCTION public.confirm_order_delivery(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_order_delivery(UUID, UUID) TO service_role;

-- =============================================
-- PASO 3: MENÚ Y VISIBILIDAD (TEST jET)
-- Store ID: f1097064-302b-4851-a532-2dc4f44e5736
-- =============================================

DO $$
DECLARE
    v_store_id UUID := 'f1097064-302b-4851-a532-2dc4f44e5736';
    v_menu_id UUID;
BEGIN
    -- 3.1 Activar Menú
    -- Intentar activar un menú existente
    UPDATE menus 
    SET is_active = true, is_fallback = true 
    WHERE store_id = v_store_id
    AND id = '20f818b9-a4f2-43c2-9026-df3f8bf9bbd0'; -- ID específico mencionado en el reporte

    -- Verificar si se activó, si no, crear uno nuevo
    SELECT id INTO v_menu_id FROM menus 
    WHERE store_id = v_store_id AND is_active = true LIMIT 1;
    
    IF v_menu_id IS NULL THEN
        INSERT INTO menus (store_id, name, is_active, is_fallback, priority)
        VALUES (v_store_id, 'Menú General', true, true, 100)
        RETURNING id INTO v_menu_id;
        RAISE NOTICE 'Menu General creado: %', v_menu_id;
    ELSE
        RAISE NOTICE 'Menu existente activado: %', v_menu_id;
    END IF;

    -- 3.2 Hacer productos visibles
    UPDATE products 
    SET is_visible = true 
    WHERE store_id = v_store_id;
    -- Note: Removed 'is_available = true' restriction to ensure all potential products are visible as per "Impacto" section

    -- 3.3 Vincular productos al menú
    INSERT INTO menu_products (menu_id, product_id, is_visible, sort_order)
    SELECT 
        v_menu_id,
        id,
        true,
        ROW_NUMBER() OVER ()
    FROM products
    WHERE store_id = v_store_id
    ON CONFLICT (menu_id, product_id) DO UPDATE
    SET is_visible = true; -- Ensure it's visible if already exists

    RAISE NOTICE '✅ PASO 3 COMPLETO: Menú y Productos configurados para %', v_store_id;
END $$;

-- =============================================
-- PASO 4: CORREGIR PEDIDOS PENDIENTES
-- Marca como entregados los pedidos ready/paid sin stock descontado
-- =============================================

UPDATE orders 
SET 
    delivery_status = 'delivered', 
    status = 'served', 
    delivered_at = NOW(),
    -- delivered_by = '7336e802-9ebf-4399-a7f9-f6178c79dee4', -- Using specific user ID from consolidation script if valid, otherwise keep null or default
    updated_at = NOW()
WHERE is_paid = true 
AND stock_deducted = false 
AND status IN ('ready', 'preparing', 'in_progress')
AND status != 'cancelled';

-- =============================================
-- VERIFICACIÓN FINAL
-- =============================================

SELECT 
    '📊 VERIFICACIÓN POST-FIX' as info,
    (SELECT COUNT(*) FROM orders WHERE is_paid = true AND stock_deducted = false AND status NOT IN ('cancelled', 'pending', 'draft')) as pedidos_sin_stock,
    (SELECT COUNT(*) FROM products p LEFT JOIN inventory_items ii ON p.id = ii.id WHERE ii.id IS NULL) as productos_huerfanos,
    (SELECT COUNT(*) FROM menus WHERE store_id = 'f1097064-302b-4851-a532-2dc4f44e5736' AND is_active = true) as menus_activos_test_jet;
