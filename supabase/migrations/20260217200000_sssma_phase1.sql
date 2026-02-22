-- ============================================================================
-- SSSMA Phase 1: Single Source Stock Mutation Architecture
-- Date: 2026-02-17
--
-- Creates the foundational infrastructure for unified stock mutations:
--   1a. apply_stock_delta() — the ONLY function that touches current_stock + stock_movements
--   1b. validate_stock_integrity() — audits drift between cache and ledger
--   1c. Fix adjust_inventory() — currently broken (never updates current_stock)
--   1d. Constraints: qty_delta != 0, remove duplicate CHECK
--
-- Hierarchy of Authority:
--   stock_movements = source of truth (append-only ledger)
--   inventory_items.current_stock = materialized CACHE (not source of truth)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1a. apply_stock_delta() — the atomic stock mutation function
--
-- Every stock change in the system should eventually flow through this function.
-- Phase 1: only adjust_inventory() uses it.
-- Phase 2: transfer_stock, finalize_order_stock, rollback will be migrated.
--
-- It does exactly TWO things:
--   1. INSERT into stock_movements (the ledger)
--   2. UPDATE inventory_items.current_stock (the cache)
--
-- It does NOT:
--   - Touch inventory_location_stock (that's the trigger's job)
--   - Touch open_packages (that's the wrapper's job)
--   - Call recalculation functions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_stock_delta(
    p_inventory_item_id UUID,
    p_store_id UUID,
    p_qty_delta NUMERIC,
    p_reason TEXT,
    p_location_id UUID DEFAULT NULL,
    p_order_id UUID DEFAULT NULL,
    p_unit_type TEXT DEFAULT 'un',
    p_idempotency_key TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
    v_movement_id BIGINT;
BEGIN
    -- Validate: delta must not be zero
    IF p_qty_delta = 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'noop', true,
            'message', 'Delta is zero, no change needed'
        );
    END IF;

    -- Validate: reason must be provided
    IF p_reason IS NULL OR p_reason = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'MISSING_REASON',
            'message', 'Reason is required for stock mutations'
        );
    END IF;

    -- Lock the item row and get current stock
    SELECT current_stock
    INTO v_current_stock
    FROM inventory_items
    WHERE id = p_inventory_item_id AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ITEM_NOT_FOUND',
            'message', 'Item not found in store'
        );
    END IF;

    -- Validate: negative delta must not exceed current stock
    IF p_qty_delta < 0 AND v_current_stock < ABS(p_qty_delta) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_STOCK',
            'message', format('Stock insuficiente: disponible %s, necesitas %s',
                v_current_stock::text, ABS(p_qty_delta)::text),
            'current_stock', v_current_stock,
            'requested_delta', p_qty_delta
        );
    END IF;

    -- STEP 1: Write to the ledger (source of truth)
    INSERT INTO stock_movements (
        idempotency_key,
        store_id,
        inventory_item_id,
        order_id,
        qty_delta,
        unit_type,
        reason,
        location_id,
        created_by,
        created_at
    ) VALUES (
        COALESCE(p_idempotency_key, gen_random_uuid()::text),
        p_store_id,
        p_inventory_item_id,
        p_order_id,
        p_qty_delta,
        p_unit_type,
        p_reason,
        p_location_id,
        COALESCE(p_created_by, auth.uid()),
        NOW()
    ) RETURNING id INTO v_movement_id;

    -- STEP 2: Update the cache
    UPDATE inventory_items
    SET current_stock = current_stock + p_qty_delta,
        updated_at = NOW()
    WHERE id = p_inventory_item_id;

    -- Read back the new stock value
    v_new_stock := v_current_stock + p_qty_delta;

    RETURN jsonb_build_object(
        'success', true,
        'movement_id', v_movement_id,
        'old_stock', v_current_stock,
        'new_stock', v_new_stock,
        'delta', p_qty_delta,
        'reason', p_reason
    );

EXCEPTION
    WHEN check_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'CHECK_VIOLATION',
            'message', 'Stock constraint violation: ' || SQLERRM
        );
    WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'DUPLICATE_MOVEMENT',
            'message', 'Duplicate idempotency key: ' || SQLERRM
        );
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLSTATE,
            'message', SQLERRM
        );
END;
$function$;


-- ============================================================================
-- 1b. validate_stock_integrity() — drift detection
--
-- Compares inventory_items.current_stock (cache) against
-- SUM(stock_movements.qty_delta) (source of truth).
--
-- Reports drift per item. Does NOT auto-correct.
-- Run post-deploy and periodically.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.validate_stock_integrity(
    p_store_id UUID DEFAULT NULL
)
RETURNS TABLE(
    item_id UUID,
    item_name TEXT,
    store_id UUID,
    cached_stock NUMERIC,
    ledger_sum NUMERIC,
    drift NUMERIC,
    has_drift BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        ii.id AS item_id,
        ii.name AS item_name,
        ii.store_id,
        ii.current_stock AS cached_stock,
        COALESCE(sm_sum.total_delta, 0) AS ledger_sum,
        ii.current_stock - COALESCE(sm_sum.total_delta, 0) AS drift,
        (ii.current_stock - COALESCE(sm_sum.total_delta, 0)) != 0 AS has_drift
    FROM inventory_items ii
    LEFT JOIN (
        SELECT
            sm.inventory_item_id,
            SUM(sm.qty_delta) AS total_delta
        FROM stock_movements sm
        GROUP BY sm.inventory_item_id
    ) sm_sum ON sm_sum.inventory_item_id = ii.id
    WHERE (p_store_id IS NULL OR ii.store_id = p_store_id)
    ORDER BY ABS(ii.current_stock - COALESCE(sm_sum.total_delta, 0)) DESC, ii.name;
END;
$function$;


-- ============================================================================
-- 1c. Fix adjust_inventory() — currently broken
--
-- BUG: adjust_inventory() only inserts into stock_movements but NEVER updates
-- inventory_items.current_stock. After an adjustment, the displayed stock is
-- wrong until something else triggers a recalculation.
--
-- FIX: Rewrite to use apply_stock_delta() for the atomic mutation.
-- Keep the same RPC signature so frontend doesn't need changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.adjust_inventory(
    p_inventory_item_id UUID,
    p_location_id UUID,
    p_new_stock NUMERIC,
    p_reason TEXT DEFAULT 'physical_count'::text,
    p_notes TEXT DEFAULT NULL::text
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_store_id UUID;
    v_current_stock NUMERIC;
    v_delta NUMERIC;
    v_item_name TEXT;
    v_unit_type TEXT;
    v_staff_id UUID := auth.uid();
    v_result JSONB;
BEGIN
    -- Get caller's store
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

    -- Get item details (validate store ownership)
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

    -- If no change, return early
    IF v_delta = 0 THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'item_name', v_item_name,
            'old_stock', v_current_stock,
            'new_stock', p_new_stock,
            'delta', 0,
            'adjusted_by', v_staff_id,
            'message', 'Stock already at target level'
        );
    END IF;

    -- FIX: Use apply_stock_delta() instead of raw INSERT
    -- This ensures both stock_movements AND current_stock are updated atomically
    v_result := apply_stock_delta(
        p_inventory_item_id := p_inventory_item_id,
        p_store_id := v_store_id,
        p_qty_delta := v_delta,
        p_reason := p_reason,
        p_location_id := p_location_id,
        p_unit_type := v_unit_type,
        p_created_by := v_staff_id
    );

    -- Check if apply_stock_delta succeeded
    IF NOT (v_result->>'success')::boolean THEN
        RETURN v_result;
    END IF;

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
$function$;


-- ============================================================================
-- 1d. Constraints
-- ============================================================================

-- Add CHECK: qty_delta must not be zero (no-op movements pollute the ledger)
ALTER TABLE stock_movements
ADD CONSTRAINT chk_nonzero_delta CHECK (qty_delta != 0);

-- Remove duplicate CHECK on current_stock (keep only one)
ALTER TABLE inventory_items
DROP CONSTRAINT IF EXISTS check_current_stock_non_negative;
-- Keeps: chk_current_stock_non_negative CHECK ((current_stock >= (0)::numeric))


COMMIT;
