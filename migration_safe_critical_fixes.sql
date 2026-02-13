-- =============================================
-- MIGRATION: Critical Fixes (SAFE VERSION - No non-existent tables)
-- Date: 2026-02-13
-- This version only modifies tables that exist
-- =============================================

-- PART 1: Add UNIQUE Constraint to clients
-- =============================================
DO $$
DECLARE
    v_duplicates INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO v_duplicates
    FROM (
        SELECT email, store_id, COUNT(*) as count
        FROM clients
        WHERE email IS NOT NULL
        GROUP BY email, store_id
        HAVING COUNT(*) > 1
    ) dupes;

    IF v_duplicates > 0 THEN
        RAISE WARNING 'Found % duplicate email+store_id combinations in clients table', v_duplicates;
        RAISE NOTICE 'Manual intervention required: Review and merge duplicate client accounts before adding UNIQUE constraint';
    ELSE
        ALTER TABLE public.clients
        ADD CONSTRAINT unique_client_email_per_store UNIQUE (email, store_id);
        RAISE NOTICE 'SUCCESS: Added UNIQUE constraint on clients(email, store_id)';
    END IF;
END $$;

-- PART 2: Fix consume_from_open_packages with FOR UPDATE lock
-- =============================================
CREATE OR REPLACE FUNCTION public.consume_from_open_packages(
    p_item_id UUID,
    p_store_id UUID,
    p_quantity NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_remaining_needed NUMERIC := p_quantity;
    v_open_pkg RECORD;
    v_consumed NUMERIC := 0;
    v_packages_consumed INTEGER := 0;
BEGIN
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INVALID_QUANTITY',
            'message', 'Quantity must be positive'
        );
    END IF;

    FOR v_open_pkg IN
        SELECT id, remaining, package_capacity
        FROM open_packages
        WHERE inventory_item_id = p_item_id
          AND store_id = p_store_id
          AND is_active = true
          AND remaining > 0
        ORDER BY opened_at ASC
        FOR UPDATE  -- ← CRITICAL FIX: Prevents race conditions
    LOOP
        EXIT WHEN v_remaining_needed <= 0;

        IF v_open_pkg.remaining >= v_remaining_needed THEN
            UPDATE open_packages
            SET remaining = remaining - v_remaining_needed,
                updated_at = NOW()
            WHERE id = v_open_pkg.id;

            v_consumed := v_consumed + v_remaining_needed;
            v_remaining_needed := 0;
            v_packages_consumed := v_packages_consumed + 1;
        ELSE
            UPDATE open_packages
            SET remaining = 0,
                is_active = FALSE,
                closed_at = NOW(),
                updated_at = NOW()
            WHERE id = v_open_pkg.id;

            v_consumed := v_consumed + v_open_pkg.remaining;
            v_remaining_needed := v_remaining_needed - v_open_pkg.remaining;
            v_packages_consumed := v_packages_consumed + 1;
        END IF;
    END LOOP;

    IF v_remaining_needed > 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INSUFFICIENT_STOCK',
            'message', 'Not enough open packages to fulfill quantity',
            'consumed', v_consumed,
            'remaining_needed', v_remaining_needed
        );
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'consumed', v_consumed,
        'packages_consumed', v_packages_consumed
    );
END;
$$;

COMMENT ON FUNCTION public.consume_from_open_packages IS
'FIFO consumption from open packages with explicit row locking to prevent race conditions. Fixed 2026-02-13.';

-- PART 3: Fix decrease_stock_atomic with FOR UPDATE lock
-- =============================================
CREATE OR REPLACE FUNCTION public.decrease_stock_atomic(
    p_store_id UUID,
    p_location_id UUID,
    p_item_id UUID,
    p_quantity NUMERIC,
    p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_stock RECORD;
    v_new_open_packages JSONB := '[]'::jsonb;
    v_pkg JSONB;
    v_remaining_needed NUMERIC := p_quantity;
    v_unit_size NUMERIC;
    v_new_pkg_qty NUMERIC;
    v_pkg_remaining NUMERIC;
    v_inventory_item RECORD;
BEGIN
    IF p_quantity <= 0 THEN RETURN; END IF;

    SELECT * INTO v_inventory_item FROM inventory_items WHERE id = p_item_id;
    IF NOT FOUND THEN RETURN; END IF;
    v_unit_size := COALESCE(v_inventory_item.package_size, 1);

    SELECT * INTO v_stock
    FROM inventory_location_stock
    WHERE item_id = p_item_id AND location_id = p_location_id AND store_id = p_store_id
    FOR UPDATE;  -- ← CRITICAL FIX: Prevents race conditions

    IF NOT FOUND THEN
        INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units, open_packages)
        VALUES (p_store_id, p_item_id, p_location_id, 0, '[]'::jsonb)
        RETURNING * INTO v_stock;
    END IF;

    FOR v_pkg IN SELECT * FROM jsonb_array_elements(COALESCE(v_stock.open_packages, '[]'::jsonb))
    LOOP
        v_pkg_remaining := (v_pkg->>'remaining')::NUMERIC;

        IF v_remaining_needed > 0 THEN
            IF v_pkg_remaining > v_remaining_needed THEN
                v_pkg := jsonb_set(v_pkg, '{remaining}', to_jsonb(v_pkg_remaining - v_remaining_needed));
                v_remaining_needed := 0;
                v_new_open_packages := v_new_open_packages || v_pkg;
            ELSE
                v_remaining_needed := v_remaining_needed - v_pkg_remaining;
            END IF;
        ELSE
            v_new_open_packages := v_new_open_packages || v_pkg;
        END IF;
    END LOOP;

    WHILE v_remaining_needed > 0 LOOP
        v_stock.closed_units := v_stock.closed_units - 1;
        v_new_pkg_qty := v_unit_size;

        IF v_new_pkg_qty > v_remaining_needed THEN
            v_new_pkg_qty := v_new_pkg_qty - v_remaining_needed;
            v_remaining_needed := 0;

            v_new_open_packages := v_new_open_packages || jsonb_build_object(
                'id', gen_random_uuid(),
                'remaining', v_new_pkg_qty,
                'opened_at', now()
            );
        ELSE
            v_remaining_needed := v_remaining_needed - v_new_pkg_qty;
        END IF;
    END LOOP;

    UPDATE inventory_location_stock
    SET closed_units = v_stock.closed_units,
        open_packages = v_new_open_packages,
        updated_at = now()
    WHERE id = v_stock.id;
END;
$$;

COMMENT ON FUNCTION public.decrease_stock_atomic IS
'Atomically decrease stock with FIFO package consumption and explicit row locking. Updated 2026-02-13.';

-- PART 4: Verification
-- =============================================
DO $$
DECLARE
    v_constraint_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'unique_client_email_per_store'
          AND table_name = 'clients'
    ) INTO v_constraint_exists;

    IF v_constraint_exists THEN
        RAISE NOTICE '✅ SUCCESS: UNIQUE constraint on clients(email, store_id) verified';
    ELSE
        RAISE WARNING '⚠️ UNIQUE constraint not added (likely due to existing duplicates)';
    END IF;
END $$;

-- Show that functions have FOR UPDATE
SELECT
    proname AS function_name,
    pronargs AS arg_count,
    CASE
        WHEN pg_get_functiondef(oid)::text LIKE '%FOR UPDATE%' THEN '✅ HAS LOCK'
        ELSE '❌ NO LOCK'
    END AS lock_status
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('consume_from_open_packages', 'decrease_stock_atomic')
ORDER BY proname;
