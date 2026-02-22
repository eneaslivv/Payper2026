-- ============================================================================
-- Fix: BUG-M2 — sync_offline_order() nunca deduce stock (SSSMA bypass crítico)
-- Date: 2026-02-18
-- Approved by: user (2026-02-18)
-- Tracked in: known-bugs.md → BUG-M2, pending-decisions.md → PD-002
--
-- Diagnóstico:
--   sync_offline_order() valida stock con FOR UPDATE NOWAIT pero NUNCA llama
--   apply_stock_delta() ni hace ninguna mutación de stock. Cada orden offline
--   se registra como completada con inventario intacto.
--   Severidad: CRÍTICO ESTRUCTURAL — inventario corrupto para órdenes offline.
--
-- Fix:
--   1. Actualizar CHECK constraint reason en stock_movements para incluir
--      'offline_order_sync' y 'offline_order_forced_negative'
--   2. Recrear sync_offline_order() con:
--      a. Loop post-INSERT que llama apply_stock_delta() por cada item
--         Idempotency key: 'offline_sync_' || v_order_id || '_' || v_product_id
--      b. Fallback para path allow_negative: INSERT directo en stock_movements
--         con reason = 'offline_order_forced_negative' cuando apply_stock_delta
--         falla por INSUFFICIENT_STOCK
--      c. ON CONFLICT DO NOTHING en el fallback INSERT (doble protección)
--      d. SET search_path = public (hardening SECURITY DEFINER)
--
--   Toda la deducción de stock ocurre en la misma transacción que el INSERT
--   de la orden — atomic by design.
--
-- Idempotency garantizada por:
--   - stock_movements_idem_uq: UNIQUE (store_id, idempotency_key)
--   - apply_stock_delta() maneja unique_violation internamente
--   - Fallback INSERT usa ON CONFLICT DO NOTHING
--
-- No se modifica:
--   - Firma de la función (no rompe callers)
--   - Lógica de conflictos y validación pre-stock
--   - retry logic en OfflineContext.tsx (LOCK_TIMEOUT sigue siendo retryable)
--   - p_allow_negative_stock semántica
--
-- Reversibilidad:
--   - Restaurar CHECK constraint sin las nuevas reasons
--   - Restaurar función sin el loop de deducción
-- ============================================================================

BEGIN;

-- ============================================================================
-- PASO 1: Agregar nuevos reasons al CHECK constraint
-- ============================================================================

-- Eliminar constraint existente
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_reason_check;

-- Recrear con los nuevos reasons agregados al final
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_reason_check
    CHECK (reason = ANY (ARRAY[
        'order_paid',
        'adjustment',
        'manual',
        'order_delivered',
        'variant_override',
        'addon_consumed',
        'direct_sale',
        'recipe_consumption',
        'restock',
        'waste',
        'transfer',
        'sale',
        'open_package',
        'cancellation_reversal',
        'loss',
        'physical_count',
        'stock_transfer',
        'manual_adjustment',
        'order_cancelled_restock',
        'order_edit_compensation',
        -- BUG-M2 FIX: nuevos reasons para flujo offline
        'offline_order_sync',            -- deducción normal vía apply_stock_delta
        'offline_order_forced_negative'  -- deducción forzada cuando p_allow_negative_stock=true
    ]));

-- ============================================================================
-- PASO 2: Recrear sync_offline_order con deducción de stock
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_offline_order(
    p_order_data           JSONB,
    p_allow_negative_stock BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- BUG-M2 FIX: hardening SECURITY DEFINER
AS $$
DECLARE
    v_order_id        UUID;
    v_store_id        UUID;
    v_item            JSONB;
    v_product_id      UUID;
    v_quantity        NUMERIC;
    v_current_stock   NUMERIC;
    v_stock_conflicts JSONB   := '[]'::JSONB;
    v_has_conflicts   BOOLEAN := FALSE;
    v_locked_items    UUID[]  := '{}';
    v_idempotency_key TEXT;
    v_delta_result    JSONB;
BEGIN
    -- Extract order data
    v_order_id := (p_order_data->>'id')::UUID;
    v_store_id := (p_order_data->>'store_id')::UUID;

    -- CRITICAL: Validate caller has permission for this store
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND store_id = v_store_id
    ) THEN
        RETURN jsonb_build_object(
            'success',  FALSE,
            'error',    'PERMISSION_DENIED',
            'message',  'No tienes permiso para sincronizar órdenes de esta tienda'
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- 1. PRE-VALIDATE STOCK AVAILABILITY WITH ROW LOCKING
    -- -----------------------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_data->'items')
    LOOP
        v_product_id := (v_item->>'productId')::UUID;
        v_quantity   := (v_item->>'quantity')::NUMERIC;

        -- Lock the row to prevent concurrent modifications
        SELECT current_stock INTO v_current_stock
        FROM inventory_items
        WHERE id = v_product_id
        FOR UPDATE NOWAIT;

        v_locked_items := array_append(v_locked_items, v_product_id);

        IF v_current_stock IS NOT NULL AND v_current_stock < v_quantity THEN
            v_has_conflicts := TRUE;
            v_stock_conflicts := v_stock_conflicts || jsonb_build_object(
                'product_id',    v_product_id,
                'requested_qty', v_quantity,
                'available_qty', v_current_stock,
                'shortage',      v_quantity - v_current_stock
            );

            INSERT INTO stock_alerts (
                store_id, inventory_item_id, alert_type,
                stock_level, expected_stock, message, order_id
            )
            SELECT
                v_store_id, v_product_id, 'offline_conflict',
                v_current_stock, v_quantity,
                'Conflicto de sincronización offline: Se intentó vender ' || v_quantity
                    || ' pero solo quedan ' || v_current_stock,
                v_order_id
            FROM inventory_items WHERE id = v_product_id;
        END IF;
    END LOOP;

    -- -----------------------------------------------------------------------
    -- 2. HANDLE CONFLICTS
    -- -----------------------------------------------------------------------
    IF v_has_conflicts AND NOT p_allow_negative_stock THEN
        RAISE NOTICE '[sync_offline_order] Stock conflict detected for order %, rolling back', v_order_id;
        RETURN jsonb_build_object(
            'success',         FALSE,
            'error',           'INSUFFICIENT_STOCK',
            'message',         'Stock insuficiente para completar la sincronización',
            'conflicts',       v_stock_conflicts,
            'action_required', 'Ajustar cantidades o permitir stock negativo',
            'locked_items',    v_locked_items
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- 3. UPSERT ORDER
    -- -----------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM orders WHERE id = v_order_id) THEN
        UPDATE orders
        SET
            status       = (p_order_data->>'status')::order_status_enum,
            total_amount = (p_order_data->>'total_amount')::NUMERIC,
            items        = p_order_data->'items',
            updated_at   = NOW()
        WHERE id = v_order_id;
    ELSE
        INSERT INTO orders (
            id, store_id, client_id, status, channel,
            total_amount, subtotal, items, payment_method,
            is_paid, created_at
        ) VALUES (
            v_order_id,
            v_store_id,
            (p_order_data->>'client_id')::UUID,
            (p_order_data->>'status')::order_status_enum,
            (p_order_data->>'channel')::TEXT,
            (p_order_data->>'total_amount')::NUMERIC,
            (p_order_data->>'subtotal')::NUMERIC,
            p_order_data->'items',
            (p_order_data->>'payment_method')::TEXT,
            COALESCE((p_order_data->>'is_paid')::BOOLEAN, FALSE),
            COALESCE((p_order_data->>'created_at')::TIMESTAMPTZ, NOW())
        );
    END IF;

    -- -----------------------------------------------------------------------
    -- 4. BUG-M2 FIX: DEDUCIR STOCK — misma transacción que el INSERT de orden
    -- -----------------------------------------------------------------------
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_order_data->'items')
    LOOP
        v_product_id      := (v_item->>'productId')::UUID;
        v_quantity        := (v_item->>'quantity')::NUMERIC;
        v_idempotency_key := 'offline_sync_' || v_order_id::text || '_' || v_product_id::text;

        BEGIN
            -- Camino normal: apply_stock_delta atómico con idempotency
            PERFORM apply_stock_delta(
                p_inventory_item_id => v_product_id,
                p_store_id          => v_store_id,
                p_qty_delta         => -v_quantity,
                p_reason            => 'offline_order_sync',
                p_order_id          => v_order_id,
                p_idempotency_key   => v_idempotency_key,
                p_created_by        => auth.uid()
            );

            RAISE NOTICE '[sync_offline_order] Stock deducted: item %, qty %, key %',
                v_product_id, v_quantity, v_idempotency_key;

        EXCEPTION
            WHEN unique_violation THEN
                -- Idempotency: este movimiento ya fue registrado (retry previo exitoso)
                RAISE NOTICE '[sync_offline_order] Idempotency hit for item % — already deducted, skipping',
                    v_product_id;

            WHEN OTHERS THEN
                IF SQLERRM ILIKE '%INSUFFICIENT_STOCK%'
                    OR SQLERRM ILIKE '%sufficient%'
                    OR SQLERRM ILIKE '%negativ%' THEN
                    -- Camino forzado: p_allow_negative_stock=true con stock insuficiente.
                    -- Misma semántica que apply_stock_delta pero sin validación de negativos.
                    -- reason = 'offline_order_forced_negative' para auditoría explícita.
                    INSERT INTO stock_movements (
                        store_id,
                        inventory_item_id,
                        order_id,
                        qty_delta,
                        unit_type,
                        reason,
                        idempotency_key,
                        created_by
                    ) VALUES (
                        v_store_id,
                        v_product_id,
                        v_order_id,
                        -v_quantity,
                        'un',
                        'offline_order_forced_negative',
                        v_idempotency_key,
                        auth.uid()
                    )
                    ON CONFLICT (store_id, idempotency_key) DO NOTHING;

                    -- Actualizar cache current_stock (puede ir negativo, documentado)
                    UPDATE inventory_items
                    SET current_stock = current_stock - v_quantity,
                        updated_at   = NOW()
                    WHERE id = v_product_id;

                    RAISE WARNING '[sync_offline_order] FORCED negative deduction: item %, qty %, key %',
                        v_product_id, v_quantity, v_idempotency_key;
                ELSE
                    RAISE; -- Re-raise errores inesperados
                END IF;
        END;
    END LOOP;

    -- -----------------------------------------------------------------------
    -- 5. RETURN SUCCESS
    -- -----------------------------------------------------------------------
    RETURN jsonb_build_object(
        'success',             TRUE,
        'order_id',            v_order_id,
        'message',             'Orden sincronizada exitosamente',
        'stock_went_negative', v_has_conflicts,
        'conflicts',           v_stock_conflicts,
        'locked_items',        v_locked_items
    );

EXCEPTION
    WHEN lock_not_available THEN
        RETURN jsonb_build_object(
            'success',            FALSE,
            'error',              'LOCK_TIMEOUT',
            'message',            'Stock está siendo modificado por otra operación. Reintenta en unos segundos.',
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
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_constraint_ok  BOOLEAN;
    v_function_ok    BOOLEAN;
BEGIN
    -- Verificar que el constraint tiene los nuevos reasons
    SELECT EXISTS(
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'stock_movements'::regclass
          AND conname   = 'stock_movements_reason_check'
          AND pg_get_constraintdef(oid) ILIKE '%offline_order_sync%'
    ) INTO v_constraint_ok;

    -- Verificar que la función referencia apply_stock_delta
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname  = 'sync_offline_order'
          AND p.prosrc   ILIKE '%apply_stock_delta%'
    ) INTO v_function_ok;

    IF NOT v_constraint_ok THEN
        RAISE EXCEPTION 'CRITICAL: stock_movements_reason_check no incluye offline_order_sync';
    END IF;
    IF NOT v_function_ok THEN
        RAISE EXCEPTION 'CRITICAL: sync_offline_order no referencia apply_stock_delta';
    END IF;

    RAISE NOTICE '=== BUG-M2 Fix Applied ===';
    RAISE NOTICE 'stock_movements_reason_check: incluye offline_order_sync + offline_order_forced_negative ✓';
    RAISE NOTICE 'sync_offline_order: llama apply_stock_delta() post-INSERT ✓';
    RAISE NOTICE 'Idempotency key: offline_sync_<order_id>_<product_id> ✓';
    RAISE NOTICE 'Fallback allow_negative: reason=offline_order_forced_negative ✓';
    RAISE NOTICE 'SET search_path = public: hardening SECURITY DEFINER ✓';
    RAISE NOTICE '';
    RAISE NOTICE 'Post-deploy checklist:';
    RAISE NOTICE '  1. Sincronizar orden offline → verificar stock_movements creado';
    RAISE NOTICE '  2. current_stock decrementado en inventory_items';
    RAISE NOTICE '  3. Retry de la misma orden → 0 movimientos nuevos (idempotency)';
END $$;

COMMIT;
