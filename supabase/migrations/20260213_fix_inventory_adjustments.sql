-- =============================================
-- FIX #12: INVENTORY ADJUSTMENTS & TRANSFERS
-- Fecha: 2026-02-13
-- Problema:
--   1. No hay forma de hacer ajustes por conteo físico
--   2. No hay transfers entre ubicaciones (barras)
--   3. No hay audit de quién hizo ajustes manuales
-- Solución:
--   1. RPC adjust_inventory() con created_by
--   2. RPC transfer_stock_between_locations()
--   3. Columna created_by en stock_movements
-- =============================================

-- 1. ADD created_by TO stock_movements (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'stock_movements'
        AND column_name = 'created_by'
    ) THEN
        ALTER TABLE stock_movements
        ADD COLUMN created_by UUID REFERENCES profiles(id);

        -- Create index for queries
        CREATE INDEX idx_stock_movements_created_by
        ON stock_movements(created_by);
    END IF;
END $$;

-- 2. RPC: ADJUST INVENTORY (Physical Count)
CREATE OR REPLACE FUNCTION adjust_inventory(
    p_inventory_item_id UUID,
    p_location_id UUID,
    p_new_stock NUMERIC,
    p_reason TEXT DEFAULT 'physical_count',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store_id UUID;
    v_current_stock NUMERIC;
    v_delta NUMERIC;
    v_item_name TEXT;
    v_unit_type TEXT;
    v_staff_id UUID := auth.uid();
BEGIN
    -- CRITICAL: Validate caller permissions
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = v_staff_id;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permiso para ajustar inventario'
        );
    END IF;

    -- Validate item belongs to this store
    SELECT
        ii.current_stock,
        ii.name,
        ii.unit_type
    INTO v_current_stock, v_item_name, v_unit_type
    FROM inventory_items ii
    WHERE ii.id = p_inventory_item_id
      AND ii.store_id = v_store_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'ITEM_NOT_FOUND',
            'message', 'Item de inventario no encontrado en tu tienda'
        );
    END IF;

    -- Calculate delta
    v_delta := p_new_stock - v_current_stock;

    -- Lock inventory item
    PERFORM 1
    FROM inventory_items
    WHERE id = p_inventory_item_id
    FOR UPDATE NOWAIT;

    -- Create stock movement
    INSERT INTO stock_movements (
        idempotency_key,
        store_id,
        inventory_item_id,
        location_id,
        qty_delta,
        unit_type,
        reason,
        notes,
        created_by,
        created_at
    ) VALUES (
        gen_random_uuid(),
        v_store_id,
        p_inventory_item_id,
        p_location_id,
        v_delta,
        v_unit_type,
        p_reason,
        COALESCE(p_notes, 'Ajuste manual: ' || v_current_stock || ' → ' || p_new_stock),
        v_staff_id,
        NOW()
    );

    RAISE NOTICE '[Inventory Adjustment] % adjusted by %: % → % (delta: %, reason: %)',
        v_item_name, v_staff_id, v_current_stock, p_new_stock, v_delta, p_reason;

    RETURN jsonb_build_object(
        'success', TRUE,
        'item_name', v_item_name,
        'old_stock', v_current_stock,
        'new_stock', p_new_stock,
        'delta', v_delta,
        'adjusted_by', v_staff_id
    );

EXCEPTION
    WHEN lock_not_available THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'LOCK_TIMEOUT',
            'message', 'El item está siendo modificado. Reintenta en unos segundos.'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLSTATE,
            'message', SQLERRM
        );
END;
$$;

-- 3. RPC: TRANSFER STOCK BETWEEN LOCATIONS
CREATE OR REPLACE FUNCTION transfer_stock_between_locations(
    p_inventory_item_id UUID,
    p_from_location_id UUID,
    p_to_location_id UUID,
    p_quantity NUMERIC,
    p_reason TEXT DEFAULT 'stock_transfer',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store_id UUID;
    v_item_name TEXT;
    v_unit_type TEXT;
    v_current_stock NUMERIC;
    v_from_location_name TEXT;
    v_to_location_name TEXT;
    v_staff_id UUID := auth.uid();
    v_transfer_id UUID := gen_random_uuid();
BEGIN
    -- CRITICAL: Validate caller permissions
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = v_staff_id;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permiso para transferir stock'
        );
    END IF;

    -- Validate quantity
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INVALID_QUANTITY',
            'message', 'La cantidad debe ser mayor a 0'
        );
    END IF;

    -- Validate same location
    IF p_from_location_id = p_to_location_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'SAME_LOCATION',
            'message', 'No puedes transferir a la misma ubicación'
        );
    END IF;

    -- Get item details
    SELECT
        ii.current_stock,
        ii.name,
        ii.unit_type
    INTO v_current_stock, v_item_name, v_unit_type
    FROM inventory_items ii
    WHERE ii.id = p_inventory_item_id
      AND ii.store_id = v_store_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'ITEM_NOT_FOUND',
            'message', 'Item de inventario no encontrado'
        );
    END IF;

    -- Get location names
    SELECT name INTO v_from_location_name
    FROM storage_locations
    WHERE id = p_from_location_id AND store_id = v_store_id;

    SELECT name INTO v_to_location_name
    FROM storage_locations
    WHERE id = p_to_location_id AND store_id = v_store_id;

    IF v_from_location_name IS NULL OR v_to_location_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INVALID_LOCATION',
            'message', 'Ubicación no válida o no pertenece a tu tienda'
        );
    END IF;

    -- Lock inventory item
    PERFORM 1
    FROM inventory_items
    WHERE id = p_inventory_item_id
    FOR UPDATE NOWAIT;

    -- Create OUTGOING movement (from origin)
    INSERT INTO stock_movements (
        idempotency_key,
        store_id,
        inventory_item_id,
        location_id,
        qty_delta,
        unit_type,
        reason,
        notes,
        created_by,
        created_at
    ) VALUES (
        v_transfer_id,  -- Same transfer_id for both movements
        v_store_id,
        p_inventory_item_id,
        p_from_location_id,
        -p_quantity,  -- Negative (outgoing)
        v_unit_type,
        p_reason,
        COALESCE(p_notes, '') || ' | Transfer OUT: ' || v_from_location_name || ' → ' || v_to_location_name,
        v_staff_id,
        NOW()
    );

    -- Create INCOMING movement (to destination)
    INSERT INTO stock_movements (
        idempotency_key,
        store_id,
        inventory_item_id,
        location_id,
        qty_delta,
        unit_type,
        reason,
        notes,
        created_by,
        created_at
    ) VALUES (
        v_transfer_id,  -- Same transfer_id links both movements
        v_store_id,
        p_inventory_item_id,
        p_to_location_id,
        p_quantity,  -- Positive (incoming)
        v_unit_type,
        p_reason,
        COALESCE(p_notes, '') || ' | Transfer IN: ' || v_from_location_name || ' → ' || v_to_location_name,
        v_staff_id,
        NOW()
    );

    RAISE NOTICE '[Stock Transfer] % transferred % %s from % to % by %',
        v_item_name, p_quantity, v_unit_type, v_from_location_name, v_to_location_name, v_staff_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'transfer_id', v_transfer_id,
        'item_name', v_item_name,
        'quantity', p_quantity,
        'unit_type', v_unit_type,
        'from_location', v_from_location_name,
        'to_location', v_to_location_name,
        'transferred_by', v_staff_id
    );

EXCEPTION
    WHEN lock_not_available THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'LOCK_TIMEOUT',
            'message', 'El item está siendo modificado. Reintenta en unos segundos.'
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', SQLSTATE,
            'message', SQLERRM
        );
END;
$$;

-- 4. VIEW: Stock Movements with Staff Info
CREATE OR REPLACE VIEW stock_movements_audit AS
SELECT
    sm.id,
    sm.idempotency_key,
    sm.store_id,
    s.name as store_name,
    sm.inventory_item_id,
    ii.name as item_name,
    ii.sku,
    sm.location_id,
    sl.name as location_name,
    sm.order_id,
    o.order_number,
    sm.qty_delta,
    sm.unit_type,
    sm.reason,
    sm.notes,
    sm.created_by,
    p.full_name as created_by_name,
    p.email as created_by_email,
    sm.created_at,
    -- Flag transfers (same idempotency_key, opposite signs)
    (
        SELECT COUNT(*)
        FROM stock_movements sm2
        WHERE sm2.idempotency_key = sm.idempotency_key
    ) > 1 as is_transfer
FROM stock_movements sm
JOIN stores s ON sm.store_id = s.id
LEFT JOIN inventory_items ii ON sm.inventory_item_id = ii.id
LEFT JOIN storage_locations sl ON sm.location_id = sl.id
LEFT JOIN orders o ON sm.order_id = o.id
LEFT JOIN profiles p ON sm.created_by = p.id
ORDER BY sm.created_at DESC;

-- 5. VIEW: Transfer History
CREATE OR REPLACE VIEW stock_transfer_history AS
SELECT
    sm_out.idempotency_key as transfer_id,
    sm_out.store_id,
    s.name as store_name,
    sm_out.inventory_item_id,
    ii.name as item_name,
    ABS(sm_out.qty_delta) as quantity,
    sm_out.unit_type,
    sm_out.location_id as from_location_id,
    loc_from.name as from_location_name,
    sm_in.location_id as to_location_id,
    loc_to.name as to_location_name,
    sm_out.reason,
    sm_out.notes,
    sm_out.created_by,
    p.full_name as transferred_by_name,
    sm_out.created_at
FROM stock_movements sm_out
JOIN stock_movements sm_in ON sm_in.idempotency_key = sm_out.idempotency_key
    AND sm_in.id != sm_out.id
    AND sm_in.qty_delta = -sm_out.qty_delta  -- Opposite signs
JOIN stores s ON sm_out.store_id = s.id
LEFT JOIN inventory_items ii ON sm_out.inventory_item_id = ii.id
LEFT JOIN storage_locations loc_from ON sm_out.location_id = loc_from.id
LEFT JOIN storage_locations loc_to ON sm_in.location_id = loc_to.id
LEFT JOIN profiles p ON sm_out.created_by = p.id
WHERE sm_out.qty_delta < 0  -- Only show outgoing side (to avoid duplicates)
ORDER BY sm_out.created_at DESC;

-- 6. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION adjust_inventory TO authenticated;
GRANT EXECUTE ON FUNCTION transfer_stock_between_locations TO authenticated;
GRANT SELECT ON stock_movements_audit TO authenticated;
GRANT SELECT ON stock_transfer_history TO authenticated;

-- 7. COMMENT
COMMENT ON FUNCTION adjust_inventory IS
'RPC para ajustes manuales de inventario (conteo físico).
Calcula delta automáticamente entre stock actual y nuevo.
Valida permisos multi-tenant.
Usa FOR UPDATE NOWAIT para prevenir race conditions.
Registra created_by para audit trail.';

COMMENT ON FUNCTION transfer_stock_between_locations IS
'RPC para transferir stock entre ubicaciones (barras, almacenes).
Crea 2 movimientos atómicos: outgoing (-qty) e incoming (+qty).
Ambos comparten mismo idempotency_key para tracking.
Usa FOR UPDATE NOWAIT para prevenir race conditions.
Registra created_by para audit trail.';

COMMENT ON VIEW stock_movements_audit IS
'Audit trail completo de movimientos de stock con información de staff.
Incluye: órdenes, ajustes manuales, transfers, cancelaciones.
Columna is_transfer indica si el movimiento es parte de un transfer.';

COMMENT ON VIEW stock_transfer_history IS
'Historial de transfers de stock entre ubicaciones.
Muestra from/to locations con nombres legibles.
Solo muestra 1 fila por transfer (no duplica outgoing/incoming).';
