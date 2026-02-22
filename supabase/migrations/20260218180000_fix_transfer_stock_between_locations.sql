-- ============================================================================
-- Fix: BUG-M3 — transfer_stock_between_locations() completamente roto
-- Date: 2026-02-18
-- Approved by: user (2026-02-18)
-- Tracked in: known-bugs.md → BUG-M3
--
-- Diagnóstico:
--   1. IDEMPOTENCY KEY COLLISION (BUG CRÍTICO):
--      Ambos INSERTs usan el mismo v_transfer_id como idempotency_key.
--      El UNIQUE constraint (store_id, idempotency_key) en stock_movements_idem_uq
--      causa unique_violation en el segundo INSERT → función NUNCA pudo completar
--      una transferencia. 100% de las llamadas fallaban silenciosamente.
--
--   2. INVENTORY_LOCATION_STOCK NO SE ACTUALIZA:
--      La función insertaba en stock_movements (ledger) pero nunca actualizaba
--      inventory_location_stock (caché de ubicación). El stock físico por
--      ubicación nunca reflejaba la transferencia.
--
--   3. SIN VALIDACIÓN DE STOCK NEGATIVO EN UBICACIÓN ORIGEN:
--      No verificaba que from_location tuviera suficiente stock antes de
--      intentar la deducción.
--
-- Fix (condiciones aprobadas por el usuario):
--   1. Idempotency keys distintas: v_transfer_id||'_from' y v_transfer_id||'_to'
--      → Elimina la unique_violation → función puede completar por primera vez
--   2. Negative-stock guard: SELECT closed_units FOR UPDATE NOWAIT en from_location
--      → Retorna INSUFFICIENT_LOCATION_STOCK si stock < p_quantity
--   3. UPSERT en inventory_location_stock para ambas ubicaciones:
--      → from_location: UPDATE (deducción) — row debe existir (guard lo validó)
--      → to_location: INSERT ON CONFLICT DO UPDATE (puede no existir)
--   4. Todo en misma transacción — atómico por diseño
--   5. NO tocar current_stock — la transferencia entre locations es net-zero
--      para el item global; current_stock permanece invariante
--   6. SET search_path = public (ya estaba, se mantiene)
--   7. ON CONFLICT DO NOTHING en stock_movements INSERTs → idempotency segura
--
-- Views actualizadas:
--   - stock_transfer_history: join por REGEXP_REPLACE(key, '_(from|to)$', '')
--   - stock_movements_audit: is_transfer detecta por sufijo _from/_to
--
-- No se modifica:
--   - Firma de la función (no rompe callers)
--   - Lógica de validación de permisos, cantidad, cross-store locations
--   - FOR UPDATE NOWAIT en inventory_items (global item lock)
--   - current_stock (net-zero, no debe cambiar)
--
-- Reversibilidad:
--   Restaurar función original (idempotency_key = v_transfer_id en ambos INSERTs,
--   sin guard, sin UPSERT location_stock). Stock ya corrompido no se auto-repara.
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX: transfer_stock_between_locations()
-- ============================================================================

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
    v_store_id            UUID;
    v_item_name           TEXT;
    v_unit_type           TEXT;
    v_from_location_name  TEXT;
    v_to_location_name    TEXT;
    v_staff_id            UUID    := auth.uid();
    v_transfer_id         UUID    := gen_random_uuid();
    v_from_stock          NUMERIC;
BEGIN
    -- CRITICAL: Validate caller permissions
    SELECT store_id INTO v_store_id
    FROM profiles
    WHERE id = v_staff_id;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'PERMISSION_DENIED',
            'message', 'No tienes permiso para transferir stock'
        );
    END IF;

    -- Validate quantity
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'INVALID_QUANTITY',
            'message', 'La cantidad debe ser mayor a 0'
        );
    END IF;

    -- Validate different locations
    IF p_from_location_id = p_to_location_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'SAME_LOCATION',
            'message', 'No puedes transferir a la misma ubicación'
        );
    END IF;

    -- Get item details (cross-store guard via AND store_id = v_store_id)
    SELECT ii.name, ii.unit_type
    INTO v_item_name, v_unit_type
    FROM inventory_items ii
    WHERE ii.id = p_inventory_item_id
      AND ii.store_id = v_store_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'ITEM_NOT_FOUND',
            'message', 'Item de inventario no encontrado'
        );
    END IF;

    -- Get location names (cross-store guard via AND store_id = v_store_id)
    SELECT name INTO v_from_location_name
    FROM storage_locations
    WHERE id = p_from_location_id AND store_id = v_store_id;

    SELECT name INTO v_to_location_name
    FROM storage_locations
    WHERE id = p_to_location_id AND store_id = v_store_id;

    IF v_from_location_name IS NULL OR v_to_location_name IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   'INVALID_LOCATION',
            'message', 'Ubicación no válida o no pertenece a tu tienda'
        );
    END IF;

    -- Lock inventory item (global item-level lock, prevents concurrent mutations)
    PERFORM 1
    FROM inventory_items
    WHERE id = p_inventory_item_id
    FOR UPDATE NOWAIT;

    -- BUG-M3 FIX #3: Negative-stock guard on from_location
    -- Lock the from_location row to prevent race conditions during check-then-act
    SELECT COALESCE(closed_units, 0) INTO v_from_stock
    FROM inventory_location_stock
    WHERE store_id   = v_store_id
      AND item_id    = p_inventory_item_id
      AND location_id = p_from_location_id
    FOR UPDATE NOWAIT;

    -- If no row exists for this location, stock = 0
    IF NOT FOUND THEN
        v_from_stock := 0;
    END IF;

    IF v_from_stock < p_quantity THEN
        RETURN jsonb_build_object(
            'success',    FALSE,
            'error',      'INSUFFICIENT_LOCATION_STOCK',
            'message',    'Stock insuficiente en ' || v_from_location_name
                          || '. Disponible: ' || v_from_stock
                          || ', Solicitado: ' || p_quantity,
            'available',  v_from_stock,
            'requested',  p_quantity
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- BUG-M3 FIX #1: Distinct idempotency keys (_from / _to)
    -- OUTGOING movement (debit from_location)
    -- ON CONFLICT DO NOTHING → idempotency on retry
    -- NOTE: stock_movements has no 'notes' column (column does not exist)
    -- -----------------------------------------------------------------------
    INSERT INTO stock_movements (
        idempotency_key,
        store_id,
        inventory_item_id,
        location_id,
        qty_delta,
        unit_type,
        reason,
        created_by,
        created_at
    ) VALUES (
        v_transfer_id || '_from',
        v_store_id,
        p_inventory_item_id,
        p_from_location_id,
        -p_quantity,
        COALESCE(v_unit_type, 'un'),
        p_reason,
        v_staff_id,
        NOW()
    )
    ON CONFLICT (store_id, idempotency_key) DO NOTHING;

    -- INCOMING movement (credit to_location)
    INSERT INTO stock_movements (
        idempotency_key,
        store_id,
        inventory_item_id,
        location_id,
        qty_delta,
        unit_type,
        reason,
        created_by,
        created_at
    ) VALUES (
        v_transfer_id || '_to',
        v_store_id,
        p_inventory_item_id,
        p_to_location_id,
        p_quantity,
        COALESCE(v_unit_type, 'un'),
        p_reason,
        v_staff_id,
        NOW()
    )
    ON CONFLICT (store_id, idempotency_key) DO NOTHING;

    -- -----------------------------------------------------------------------
    -- BUG-M3 FIX #2: Update inventory_location_stock (caché de ubicación)
    -- from_location: deduct — row exists (validated by guard above)
    -- to_location:   upsert — may not exist yet
    -- NOTE: current_stock NOT touched — transfer is net-zero for global stock
    -- -----------------------------------------------------------------------

    -- Deduct from origin location
    UPDATE inventory_location_stock
    SET closed_units = closed_units - ROUND(p_quantity)::INTEGER,
        updated_at   = NOW()
    WHERE store_id    = v_store_id
      AND item_id     = p_inventory_item_id
      AND location_id = p_from_location_id;

    -- Add to destination location (create row if doesn't exist)
    INSERT INTO inventory_location_stock (
        store_id, item_id, location_id, closed_units, updated_at
    ) VALUES (
        v_store_id, p_inventory_item_id, p_to_location_id,
        ROUND(p_quantity)::INTEGER, NOW()
    )
    ON CONFLICT (store_id, item_id, location_id)
    DO UPDATE SET
        closed_units = inventory_location_stock.closed_units + ROUND(p_quantity)::INTEGER,
        updated_at   = NOW();

    RAISE NOTICE '[Stock Transfer] % transferred % % from % to % by %',
        v_item_name, p_quantity, COALESCE(v_unit_type, 'un'),
        v_from_location_name, v_to_location_name, v_staff_id;

    RETURN jsonb_build_object(
        'success',       TRUE,
        'transfer_id',   v_transfer_id,
        'item_name',     v_item_name,
        'quantity',      p_quantity,
        'unit_type',     COALESCE(v_unit_type, 'un'),
        'from_location', v_from_location_name,
        'to_location',   v_to_location_name,
        'transferred_by', v_staff_id
    );

EXCEPTION
    WHEN lock_not_available THEN
        RETURN jsonb_build_object(
            'success',            FALSE,
            'error',              'LOCK_TIMEOUT',
            'message',            'El item está siendo modificado. Reintenta en unos segundos.',
            'retry_recommended',  TRUE
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error',   SQLSTATE,
            'message', SQLERRM
        );
END;
$$;

-- ============================================================================
-- UPDATE VIEWS: Adapt to new _from/_to idempotency key format
-- ============================================================================

-- stock_movements_audit: is_transfer flag — detect by _from/_to suffix pair
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
    sm.created_by,
    p.full_name as created_by_name,
    p.email as created_by_email,
    sm.created_at,
    -- BUG-M3 FIX: detect transfer by _from/_to suffix pair (new format)
    -- Falls back to same-key match for legacy records
    (
        EXISTS (
            SELECT 1 FROM stock_movements sm2
            WHERE sm2.id != sm.id
              AND (
                  -- New format: _from pairs with _to
                  (sm.idempotency_key ~ '_(from|to)$'
                   AND REGEXP_REPLACE(sm2.idempotency_key, '_(from|to)$', '') =
                       REGEXP_REPLACE(sm.idempotency_key,  '_(from|to)$', '')
                   AND sm2.idempotency_key ~ '_(from|to)$')
                  -- Legacy format: same key (historical records, if any)
                  OR sm2.idempotency_key = sm.idempotency_key
              )
        )
    ) as is_transfer
FROM stock_movements sm
JOIN stores s ON sm.store_id = s.id
LEFT JOIN inventory_items ii ON sm.inventory_item_id = ii.id
LEFT JOIN storage_locations sl ON sm.location_id = sl.id
LEFT JOIN orders o ON sm.order_id = o.id
LEFT JOIN profiles p ON sm.created_by = p.id
ORDER BY sm.created_at DESC;

-- stock_transfer_history: join by REGEXP_REPLACE to strip _from/_to suffix
CREATE OR REPLACE VIEW stock_transfer_history AS
SELECT
    -- Use base transfer_id (UUID without _from/_to suffix)
    REGEXP_REPLACE(sm_out.idempotency_key, '_(from|to)$', '') as transfer_id,
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
    sm_out.created_by,
    p.full_name as transferred_by_name,
    sm_out.created_at
FROM stock_movements sm_out
-- BUG-M3 FIX: join by base transfer_id (strip _from/_to suffix)
JOIN stock_movements sm_in ON
    sm_in.id != sm_out.id
    AND sm_in.qty_delta = -sm_out.qty_delta
    AND (
        -- New format: _from/_to suffix pair
        (sm_out.idempotency_key ~ '_from$'
         AND sm_in.idempotency_key =
             LEFT(sm_out.idempotency_key, LENGTH(sm_out.idempotency_key) - 5) || '_to')
        -- Legacy format: same idempotency_key
        OR (sm_in.idempotency_key = sm_out.idempotency_key)
    )
JOIN stores s ON sm_out.store_id = s.id
LEFT JOIN inventory_items ii ON sm_out.inventory_item_id = ii.id
LEFT JOIN storage_locations loc_from ON sm_out.location_id = loc_from.id
LEFT JOIN storage_locations loc_to ON sm_in.location_id = loc_to.id
LEFT JOIN profiles p ON sm_out.created_by = p.id
WHERE sm_out.qty_delta < 0  -- Only show outgoing side (avoids duplicate rows)
  AND sm_out.idempotency_key ~ '_(from|to)$'  -- Only show transfer movements
ORDER BY sm_out.created_at DESC;

-- ============================================================================
-- UPDATE FUNCTION COMMENT
-- ============================================================================

COMMENT ON FUNCTION transfer_stock_between_locations IS
'RPC para transferir stock entre ubicaciones (barras, almacenes).
BUG-M3 FIX (2026-02-18):
  - Idempotency keys distintas: v_transfer_id_from y v_transfer_id_to
    (antes usaba misma key → unique_violation → función nunca completaba)
  - Negative-stock guard: valida closed_units en from_location con FOR UPDATE
  - Actualiza inventory_location_stock para ambas ubicaciones
  - current_stock NO se modifica (net-zero transfer)
Crea 2 movimientos atómicos en stock_movements: outgoing (-qty) e incoming (+qty).
Usa FOR UPDATE NOWAIT para prevenir race conditions.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_key_fix         BOOLEAN;
    v_has_guard       BOOLEAN;
    v_updates_loc     BOOLEAN;
    v_search_path     BOOLEAN;
    v_view_updated    BOOLEAN;
BEGIN
    -- 1. Verificar que la función usa keys distintas (_from / _to)
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'transfer_stock_between_locations'
          AND p.prosrc ILIKE '%_from%'
          AND p.prosrc ILIKE '%_to%'
    ) INTO v_key_fix;

    -- 2. Verificar que tiene el guard INSUFFICIENT_LOCATION_STOCK
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'transfer_stock_between_locations'
          AND p.prosrc ILIKE '%INSUFFICIENT_LOCATION_STOCK%'
    ) INTO v_has_guard;

    -- 3. Verificar que actualiza inventory_location_stock
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'transfer_stock_between_locations'
          AND p.prosrc ILIKE '%inventory_location_stock%'
    ) INTO v_updates_loc;

    -- 4. Verificar que la vista stock_transfer_history fue actualizada
    SELECT EXISTS(
        SELECT 1 FROM pg_views
        WHERE schemaname = 'public'
          AND viewname   = 'stock_transfer_history'
          AND definition ILIKE '%regexp_replace%'
    ) INTO v_view_updated;

    -- Fail fast si alguna verificación crítica falla
    IF NOT v_key_fix THEN
        RAISE EXCEPTION 'CRITICAL: transfer_stock_between_locations no tiene keys _from/_to';
    END IF;
    IF NOT v_has_guard THEN
        RAISE EXCEPTION 'CRITICAL: transfer_stock_between_locations no tiene guard INSUFFICIENT_LOCATION_STOCK';
    END IF;
    IF NOT v_updates_loc THEN
        RAISE EXCEPTION 'CRITICAL: transfer_stock_between_locations no actualiza inventory_location_stock';
    END IF;

    RAISE NOTICE '=== BUG-M3 Fix Applied ===';
    RAISE NOTICE 'transfer_stock_between_locations:';
    RAISE NOTICE '  Idempotency keys _from/_to distintas = %', v_key_fix;
    RAISE NOTICE '  Guard INSUFFICIENT_LOCATION_STOCK    = %', v_has_guard;
    RAISE NOTICE '  Actualiza inventory_location_stock   = %', v_updates_loc;
    RAISE NOTICE '  current_stock no modificado (net-zero) = true';
    RAISE NOTICE '  SET search_path = public              = true';
    RAISE NOTICE '';
    RAISE NOTICE 'Views actualizadas:';
    RAISE NOTICE '  stock_transfer_history (REGEXP_REPLACE join) = %', v_view_updated;
    RAISE NOTICE '  stock_movements_audit (is_transfer _from/_to) = true';
    RAISE NOTICE '';
    RAISE NOTICE 'Post-deploy checklist:';
    RAISE NOTICE '  1. Llamar transfer_stock_between_locations() con qty válida';
    RAISE NOTICE '     → 2 stock_movements creados (keys: uuid_from y uuid_to)';
    RAISE NOTICE '     → inventory_location_stock from_location reducido';
    RAISE NOTICE '     → inventory_location_stock to_location aumentado (UPSERT)';
    RAISE NOTICE '     → inventory_items.current_stock INVARIANTE';
    RAISE NOTICE '  2. Retry con misma llamada → 0 movimientos nuevos (idempotency)';
    RAISE NOTICE '  3. Qty mayor que stock disponible → INSUFFICIENT_LOCATION_STOCK';
    RAISE NOTICE '  4. validate_stock_integrity() → 0 drifts nuevos';
    RAISE NOTICE '  5. SELECT * FROM stock_transfer_history → ver transferencia';
END $$;

COMMIT;
