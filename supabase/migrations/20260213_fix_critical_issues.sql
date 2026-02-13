-- =============================================
-- MIGRATION: Fix Critical Issues from Verification Audit
-- Date: 2026-02-13
-- Issue: P0/P1 Critical fixes identified in comprehensive audit
-- Ref: Comprehensive functionality verification
-- =============================================

-- PART 1: Add UNIQUE Constraint to Prevent Duplicate Clients
-- =============================================
-- P0 CRITICAL: clients table allows duplicate emails per store
-- Impact: Data integrity, duplicate customer accounts

-- First, check for existing duplicates
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
        -- List the duplicates for manual review
        RAISE NOTICE 'Duplicates: %', (
            SELECT jsonb_agg(jsonb_build_object('email', email, 'store_id', store_id, 'count', count))
            FROM (
                SELECT email, store_id, COUNT(*) as count
                FROM clients
                WHERE email IS NOT NULL
                GROUP BY email, store_id
                HAVING COUNT(*) > 1
            ) d
        );
    ELSE
        -- Safe to add constraint
        ALTER TABLE public.clients
        ADD CONSTRAINT unique_client_email_per_store UNIQUE (email, store_id);

        RAISE NOTICE 'SUCCESS: Added UNIQUE constraint on clients(email, store_id)';
    END IF;
END $$;

COMMENT ON CONSTRAINT unique_client_email_per_store ON public.clients IS
'Prevents duplicate client emails within the same store (multi-tenant uniqueness)';


-- PART 2: Add Explicit Locks to consume_from_open_packages
-- =============================================
-- P0 CRITICAL: Race condition in concurrent stock consumption

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
    -- Validation
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INVALID_QUANTITY',
            'message', 'Quantity must be positive'
        );
    END IF;

    -- FIFO consumption with EXPLICIT LOCK to prevent race conditions
    FOR v_open_pkg IN
        SELECT id, remaining, package_capacity
        FROM open_packages
        WHERE inventory_item_id = p_item_id
          AND store_id = p_store_id
          AND is_active = true
          AND remaining > 0
        ORDER BY opened_at ASC
        FOR UPDATE  -- ← CRITICAL: Explicit row lock prevents concurrent access
    LOOP
        EXIT WHEN v_remaining_needed <= 0;

        IF v_open_pkg.remaining >= v_remaining_needed THEN
            -- Partial consumption: package still has remaining
            UPDATE open_packages
            SET remaining = remaining - v_remaining_needed,
                updated_at = NOW()
            WHERE id = v_open_pkg.id;

            v_consumed := v_consumed + v_remaining_needed;
            v_remaining_needed := 0;
            v_packages_consumed := v_packages_consumed + 1;
        ELSE
            -- Full consumption: package is now empty
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


-- PART 3: Add Explicit Lock to decrease_stock_atomic
-- =============================================
-- P1 HIGH: Ensure atomic stock deduction has proper locking

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
    -- Validation
    IF p_quantity <= 0 THEN RETURN; END IF;

    -- Get Package Size
    SELECT * INTO v_inventory_item FROM inventory_items WHERE id = p_item_id;
    IF NOT FOUND THEN RETURN; END IF;
    v_unit_size := COALESCE(v_inventory_item.package_size, 1);

    -- Lock Stock Row EXPLICITLY (prevents concurrent modifications)
    SELECT * INTO v_stock
    FROM inventory_location_stock
    WHERE item_id = p_item_id AND location_id = p_location_id AND store_id = p_store_id
    FOR UPDATE;  -- ← Explicit lock

    IF NOT FOUND THEN
        -- Create if missing (empty)
        INSERT INTO inventory_location_stock (store_id, item_id, location_id, closed_units, open_packages)
        VALUES (p_store_id, p_item_id, p_location_id, 0, '[]'::jsonb)
        RETURNING * INTO v_stock;
    END IF;

    -- 1. Consume from Open Packages (JSONB Array)
    FOR v_pkg IN SELECT * FROM jsonb_array_elements(COALESCE(v_stock.open_packages, '[]'::jsonb))
    LOOP
        v_pkg_remaining := (v_pkg->>'remaining')::NUMERIC;

        IF v_remaining_needed > 0 THEN
            IF v_pkg_remaining > v_remaining_needed THEN
                -- A. Partial consume
                v_pkg := jsonb_set(v_pkg, '{remaining}', to_jsonb(v_pkg_remaining - v_remaining_needed));
                v_remaining_needed := 0;
                v_new_open_packages := v_new_open_packages || v_pkg;
            ELSE
                -- B. Full consume (Package becomes empty)
                v_remaining_needed := v_remaining_needed - v_pkg_remaining;
            END IF;
        ELSE
            -- Keep untouched package
            v_new_open_packages := v_new_open_packages || v_pkg;
        END IF;
    END LOOP;

    -- 2. Open New Packages if needed
    WHILE v_remaining_needed > 0 LOOP
        -- Decrease Closed Units
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

    -- 3. Update Record
    UPDATE inventory_location_stock
    SET closed_units = v_stock.closed_units,
        open_packages = v_new_open_packages,
        updated_at = now()
    WHERE id = v_stock.id;

END;
$$;

COMMENT ON FUNCTION public.decrease_stock_atomic IS
'Atomically decrease stock with FIFO package consumption and explicit row locking. Updated 2026-02-13.';


-- PART 4: Verify finalize_order_stock Trigger Exists and is Singular
-- =============================================
-- P1 HIGH: Ensure only ONE version of finalize_order_stock exists

DO $$
DECLARE
    v_trigger_count INTEGER;
    v_function_count INTEGER;
BEGIN
    -- Count triggers named finalize_order_stock on orders table
    SELECT COUNT(*)
    INTO v_trigger_count
    FROM information_schema.triggers
    WHERE event_object_table = 'orders'
      AND trigger_name LIKE '%finalize_order_stock%';

    -- Count functions named finalize_order_stock
    SELECT COUNT(*)
    INTO v_function_count
    FROM pg_proc
    WHERE proname = 'finalize_order_stock'
      AND pronamespace = 'public'::regnamespace;

    IF v_trigger_count = 0 THEN
        RAISE WARNING 'No finalize_order_stock trigger found on orders table';
    ELSIF v_trigger_count > 1 THEN
        RAISE WARNING 'Multiple finalize_order_stock triggers found: %. Manual cleanup needed.', v_trigger_count;
    END IF;

    IF v_function_count = 0 THEN
        RAISE WARNING 'No finalize_order_stock function found';
    ELSIF v_function_count > 1 THEN
        RAISE WARNING 'Multiple finalize_order_stock functions found: %. Manual cleanup needed.', v_function_count;
    END IF;

    IF v_trigger_count = 1 AND v_function_count = 1 THEN
        RAISE NOTICE 'SUCCESS: Exactly 1 finalize_order_stock trigger and 1 function found (correct)';
    END IF;
END $$;


-- PART 5: Document Loyalty Points Schema Decision
-- =============================================
-- P2 MEDIUM: Dual schema (profiles.points_balance vs clients.loyalty_points)

COMMENT ON COLUMN public.clients.loyalty_points IS
'PRIMARY loyalty points balance for clients. Updated by trigger_process_loyalty_earn and trigger_process_loyalty_on_delivery.';

COMMENT ON COLUMN public.profiles.points_balance IS
'DEPRECATED: Use clients.loyalty_points instead. This column exists for backward compatibility with staff roles.';

-- Add validation to ensure consistency (if both exist)
CREATE OR REPLACE FUNCTION validate_loyalty_points_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- If profile has associated client, sync points
    IF NEW.id IN (SELECT user_id FROM clients WHERE user_id IS NOT NULL) THEN
        UPDATE clients
        SET loyalty_points = NEW.points_balance
        WHERE user_id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

-- Note: Only create trigger if profiles.points_balance column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'profiles' AND column_name = 'points_balance'
    ) THEN
        DROP TRIGGER IF EXISTS sync_profile_points_to_client ON public.profiles;

        CREATE TRIGGER sync_profile_points_to_client
        AFTER UPDATE OF points_balance ON public.profiles
        FOR EACH ROW
        WHEN (OLD.points_balance IS DISTINCT FROM NEW.points_balance)
        EXECUTE FUNCTION validate_loyalty_points_consistency();

        RAISE NOTICE 'Created sync trigger for profiles.points_balance → clients.loyalty_points';
    ELSE
        RAISE NOTICE 'profiles.points_balance column does not exist, skipping sync trigger';
    END IF;
END $$;


-- PART 6: Verification and Summary
-- =============================================

-- Verify UNIQUE constraint was added
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
        RAISE NOTICE 'SUCCESS: UNIQUE constraint on clients(email, store_id) verified';
    ELSE
        RAISE WARNING 'UNIQUE constraint not added (likely due to existing duplicates - review warnings above)';
    END IF;
END $$;

-- Show updated functions
SELECT
    proname AS function_name,
    pronargs AS arg_count,
    pg_get_functiondef(oid)::text LIKE '%FOR UPDATE%' AS has_explicit_lock
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('consume_from_open_packages', 'decrease_stock_atomic')
ORDER BY proname;

-- Expected: both functions should show has_explicit_lock = true

RAISE NOTICE 'Migration completed: Critical fixes applied';
RAISE NOTICE '- P0: UNIQUE constraint on clients (conditional on no duplicates)';
RAISE NOTICE '- P0: Explicit locks in consume_from_open_packages';
RAISE NOTICE '- P1: Explicit locks in decrease_stock_atomic';
RAISE NOTICE '- P1: finalize_order_stock verification';
RAISE NOTICE '- P2: Loyalty points schema documented';
