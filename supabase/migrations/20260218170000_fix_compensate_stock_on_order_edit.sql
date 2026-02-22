-- ============================================================================
-- Fix: BUG-M1 — compensate_stock_on_order_edit() sin SSSMA (drift en ediciones)
-- Date: 2026-02-18
-- Approved by: user (2026-02-18)
-- Tracked in: known-bugs.md → BUG-M1, pending-decisions.md → PD-002
--
-- Diagnóstico:
--   compensate_stock_on_order_edit() (trigger BEFORE UPDATE OF items en orders)
--   inserta directamente en stock_movements pero NUNCA actualiza
--   inventory_items.current_stock. Resultado: ledger correcto, cache stale,
--   drift detectado por validate_stock_integrity() tras cada edición.
--
--   Además usa gen_random_uuid() como idempotency_key — si el trigger dispara
--   dos veces (retry, doble-update), duplica movimientos sin control.
--
-- Fix:
--   1. Reemplazar INSERT stock_movements directo por apply_stock_delta()
--      → ledger + cache en una llamada atómica
--   2. Idempotency key determinista:
--      'edit_comp_' || order_id || '_' || item_id || '_' || md5(old_qty || new_qty)
--      → mismo edit = misma key → retry seguro (PERFORM descarta DUPLICATE_MOVEMENT)
--   3. Mantener SELECT FOR UPDATE NOWAIT antes de apply_stock_delta
--      → el FOR UPDATE interno de apply_stock_delta es no-op en la misma tx
--      → lock_not_available sigue siendo atrapado por el EXCEPTION handler
--   4. SET search_path = public (hardening SECURITY DEFINER)
--
-- Idempotency garantizada por:
--   - stock_movements_idem_uq: UNIQUE (store_id, idempotency_key)
--   - apply_stock_delta captura unique_violation internamente → PERFORM silencioso
--
-- No se modifica:
--   - Firma de la función (trigger, sin params)
--   - Lógica de diff old/new items
--   - Branching recipe vs direct product
--   - Condición de skip (items sin cambio, stock_deducted=false, cancelled)
--   - Trigger trg_compensate_stock_on_edit (sin cambios)
--
-- Hallazgo secundario (no corregido aquí):
--   - apply_stock_delta devuelve success=false en duplicate (en lugar de noop=true)
--     No afecta este trigger (usa PERFORM) pero confunde callers RPC.
--
-- Reversibilidad:
--   Restaurar versión anterior con INSERT directo y gen_random_uuid() como key.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION compensate_stock_on_order_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public  -- BUG-M1 FIX: hardening SECURITY DEFINER
AS $$
DECLARE
    v_old_item              JSONB;
    v_new_item              JSONB;
    v_old_items_map         JSONB := '{}'::JSONB;
    v_new_items_map         JSONB := '{}'::JSONB;
    v_product_id            UUID;
    v_old_qty               NUMERIC;
    v_new_qty               NUMERIC;
    v_qty_delta             NUMERIC;
    v_has_recipe            BOOLEAN;
    v_recipe_record         RECORD;
    v_active_inventory_item_id UUID;
    v_target_location_id    UUID;
    v_direct_unit           TEXT;
    v_idempotency_key       TEXT;
BEGIN
    -- Skip si no hay cambio real, si stock no fue deducido, o si es cancelación
    IF NEW.items::text = OLD.items::text
       OR NEW.stock_deducted = FALSE
       OR NEW.status IN ('cancelled', 'refunded') THEN
        RETURN NEW;
    END IF;

    RAISE NOTICE '[Stock Compensation] Order % items changed, compensating stock', NEW.id;

    -- Resolver ubicación objetivo (node → default)
    IF NEW.node_id IS NOT NULL THEN
        SELECT location_id INTO v_target_location_id
        FROM venue_nodes
        WHERE id = NEW.node_id;
    END IF;

    IF v_target_location_id IS NULL THEN
        SELECT id INTO v_target_location_id
        FROM storage_locations
        WHERE store_id = NEW.store_id AND is_default = TRUE
        LIMIT 1;
    END IF;

    -- Construir mapas qty por product_id
    FOR v_old_item IN SELECT * FROM jsonb_array_elements(OLD.items)
    LOOP
        v_old_items_map := v_old_items_map || jsonb_build_object(
            v_old_item->>'productId',
            (v_old_item->>'quantity')::NUMERIC
        );
    END LOOP;

    FOR v_new_item IN SELECT * FROM jsonb_array_elements(NEW.items)
    LOOP
        v_new_items_map := v_new_items_map || jsonb_build_object(
            v_new_item->>'productId',
            (v_new_item->>'quantity')::NUMERIC
        );
    END LOOP;

    -- Iterar sobre unión de productos (old + new)
    FOR v_product_id IN
        SELECT DISTINCT key::UUID
        FROM jsonb_each(v_old_items_map || v_new_items_map)
    LOOP
        v_old_qty   := COALESCE((v_old_items_map->>v_product_id::text)::NUMERIC, 0);
        v_new_qty   := COALESCE((v_new_items_map->>v_product_id::text)::NUMERIC, 0);
        v_qty_delta := v_new_qty - v_old_qty;

        IF v_qty_delta = 0 THEN
            CONTINUE;
        END IF;

        RAISE NOTICE '[Stock Compensation] Product %: qty changed from % to % (delta: %)',
            v_product_id, v_old_qty, v_new_qty, v_qty_delta;

        SELECT EXISTS (
            SELECT 1 FROM product_recipes WHERE product_id = v_product_id
        ) INTO v_has_recipe;

        IF v_has_recipe = TRUE THEN
            -- Path receta: compensar cada ingrediente
            FOR v_recipe_record IN
                SELECT
                    pr.inventory_item_id,
                    pr.quantity_required,
                    ii.unit_type
                FROM product_recipes pr
                JOIN inventory_items ii ON pr.inventory_item_id = ii.id
                WHERE pr.product_id = v_product_id
            LOOP
                -- Mantener NOWAIT para no bloquear trigger si hay contención
                PERFORM 1
                FROM inventory_items
                WHERE id = v_recipe_record.inventory_item_id
                FOR UPDATE NOWAIT;

                -- Idempotency key determinista: único por (orden, ingrediente, transición qty)
                v_idempotency_key := 'edit_comp_' || NEW.id::text
                    || '_' || v_recipe_record.inventory_item_id::text
                    || '_' || md5(v_old_qty::text || '_' || v_new_qty::text);

                -- BUG-M1 FIX: apply_stock_delta en vez de INSERT directo
                -- → ledger + current_stock atómico
                -- → PERFORM descarta return; unique_violation silenciosa (idempotencia)
                PERFORM apply_stock_delta(
                    p_inventory_item_id => v_recipe_record.inventory_item_id,
                    p_store_id          => NEW.store_id,
                    p_qty_delta         => -(v_recipe_record.quantity_required * v_qty_delta),
                    p_reason            => 'order_edit_compensation',
                    p_location_id       => v_target_location_id,
                    p_order_id          => NEW.id,
                    p_unit_type         => v_recipe_record.unit_type,
                    p_idempotency_key   => v_idempotency_key,
                    p_created_by        => auth.uid()
                );
            END LOOP;

        ELSE
            -- Path directo: compensar el producto directamente
            BEGIN
                SELECT inventory_item_id INTO v_active_inventory_item_id
                FROM inventory_product_mapping
                WHERE product_id = v_product_id;

                IF v_active_inventory_item_id IS NULL THEN
                    v_active_inventory_item_id := v_product_id;
                END IF;

                SELECT unit_type INTO v_direct_unit
                FROM inventory_items
                WHERE id = v_active_inventory_item_id
                FOR UPDATE NOWAIT;

                IF FOUND THEN
                    -- Idempotency key determinista: único por (orden, item, transición qty)
                    v_idempotency_key := 'edit_comp_' || NEW.id::text
                        || '_' || v_active_inventory_item_id::text
                        || '_' || md5(v_old_qty::text || '_' || v_new_qty::text);

                    -- BUG-M1 FIX: apply_stock_delta en vez de INSERT directo
                    PERFORM apply_stock_delta(
                        p_inventory_item_id => v_active_inventory_item_id,
                        p_store_id          => NEW.store_id,
                        p_qty_delta         => -v_qty_delta,
                        p_reason            => 'order_edit_compensation',
                        p_location_id       => v_target_location_id,
                        p_order_id          => NEW.id,
                        p_unit_type         => COALESCE(v_direct_unit, 'unit'),
                        p_idempotency_key   => v_idempotency_key,
                        p_created_by        => auth.uid()
                    );
                END IF;
            END;
        END IF;
    END LOOP;

    RETURN NEW;

EXCEPTION
    WHEN lock_not_available THEN
        RAISE WARNING '[Stock Compensation] Lock timeout for order %, stock is being modified', NEW.id;
        RETURN NEW;
END;
$$;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_calls_apply_delta BOOLEAN;
    v_has_search_path   BOOLEAN;
    v_trigger_active    BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'compensate_stock_on_order_edit'
          AND p.prosrc ILIKE '%apply_stock_delta%'
    ) INTO v_calls_apply_delta;

    SELECT EXISTS(
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'compensate_stock_on_order_edit'
          AND p.prosrc ILIKE '%edit_comp_%'
    ) INTO v_has_search_path;  -- proxy: si tiene 'edit_comp_' es la versión nueva

    SELECT EXISTS(
        SELECT 1 FROM pg_trigger t
        JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE t.tgrelid = 'orders'::regclass
          AND p.proname = 'compensate_stock_on_order_edit'
          AND t.tgenabled = 'O'
    ) INTO v_trigger_active;

    IF NOT v_calls_apply_delta THEN
        RAISE EXCEPTION 'CRITICAL: compensate_stock_on_order_edit no llama apply_stock_delta';
    END IF;

    RAISE NOTICE '=== BUG-M1 Fix Applied ===';
    RAISE NOTICE 'compensate_stock_on_order_edit: calls apply_stock_delta() = %', v_calls_apply_delta;
    RAISE NOTICE 'Idempotency key determinista (edit_comp_...): = %', v_has_search_path;
    RAISE NOTICE 'trg_compensate_stock_on_edit: activo en orders = %', v_trigger_active;
    RAISE NOTICE 'SET search_path = public: hardening aplicado';
    RAISE NOTICE '';
    RAISE NOTICE 'Post-deploy checklist:';
    RAISE NOTICE '  1. Editar items de una orden confirmada';
    RAISE NOTICE '  2. Verificar stock_movements con reason=order_edit_compensation';
    RAISE NOTICE '  3. Verificar current_stock decrementado/incrementado correctamente';
    RAISE NOTICE '  4. Repetir la misma edición — debe ser 0 movimientos nuevos (idempotency)';
    RAISE NOTICE '  5. validate_stock_integrity() → 0 drifts nuevos';
END $$;

COMMIT;
