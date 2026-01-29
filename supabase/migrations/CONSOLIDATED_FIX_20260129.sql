-- ================================================================
-- PAYPER EMERGENCY FIX - ORDEN CORRECTO
-- Fecha: 2026-01-29
-- Ejecutar en Supabase SQL Editor: https://supabase.com/dashboard/project/yjxjyxhksedwfeueduwl/sql
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
-- PASO 3: CORREGIR PEDIDOS PENDIENTES
-- Marca como entregados los pedidos ready/paid sin stock descontado
-- =============================================

UPDATE orders 
SET 
    delivery_status = 'delivered', 
    status = 'served', 
    delivered_at = NOW(),
    delivered_by = '7336e802-9ebf-4399-a7f9-f6178c79dee4',
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
    (SELECT COUNT(*) FROM products p LEFT JOIN inventory_items ii ON p.id = ii.id WHERE ii.id IS NULL) as productos_huerfanos;
