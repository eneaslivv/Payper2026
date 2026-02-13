-- =============================================
-- MIGRATION: Rename Versioned Functions (Remove Version Suffix)
-- Date: 2026-02-13
-- Issue: Clean naming - remove _v2 and _v20 suffixes
-- =============================================

-- PART 1: Rename decrease_stock_atomic_v20 → decrease_stock_atomic
-- =============================================

-- Create new function without version suffix (same signature)
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

    -- Lock Stock Row
    SELECT * INTO v_stock
    FROM inventory_location_stock
    WHERE item_id = p_item_id AND location_id = p_location_id AND store_id = p_store_id
    FOR UPDATE;

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
'Atomically decrease stock with FIFO package consumption. Renamed from decrease_stock_atomic_v20.';

-- Drop old versioned function
DROP FUNCTION IF EXISTS public.decrease_stock_atomic_v20(UUID, UUID, UUID, NUMERIC, TEXT);


-- PART 2: Rename admin_add_balance_v2 → admin_add_balance
-- =============================================

-- Create new function without version suffix (same signature)
CREATE OR REPLACE FUNCTION public.admin_add_balance(
    p_client_id UUID,
    p_amount NUMERIC,
    p_description TEXT DEFAULT 'Admin credit'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_client_store_id UUID;
    v_new_balance NUMERIC;
    v_user_role TEXT;
    v_entry_id UUID;
BEGIN
    -- 1. Get authenticated user
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'UNAUTHORIZED',
            'message', 'Usuario no autenticado'
        );
    END IF;

    -- 2. Get user's store_id and role
    SELECT store_id, role INTO v_store_id, v_user_role
    FROM profiles
    WHERE id = v_user_id;

    IF v_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'NO_STORE',
            'message', 'Usuario no tiene tienda asignada'
        );
    END IF;

    -- 3. Verify user has admin permissions
    IF v_user_role NOT IN ('owner', 'admin', 'superadmin') THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'INSUFFICIENT_PERMISSIONS',
            'message', 'Solo administradores pueden agregar saldo'
        );
    END IF;

    -- 4. Verify client belongs to user's store
    SELECT store_id INTO v_client_store_id
    FROM clients
    WHERE id = p_client_id;

    IF v_client_store_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'CLIENT_NOT_FOUND',
            'message', 'Cliente no encontrado'
        );
    END IF;

    IF v_client_store_id != v_store_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'PERMISSION_DENIED',
            'message', 'No tienes permiso para esta operación'
        );
    END IF;

    -- 5. Calculate new balance
    SELECT COALESCE(wallet_balance, 0) + p_amount INTO v_new_balance
    FROM clients
    WHERE id = p_client_id;

    -- 6. Insert into wallet_ledger (trigger will update clients.wallet_balance)
    INSERT INTO wallet_ledger (
        wallet_id,
        store_id,
        amount,
        balance_after,
        entry_type,
        reference_type,
        reference_id,
        description,
        performed_by,
        source,
        payment_method,
        idempotency_key
    ) VALUES (
        p_client_id,
        v_store_id,
        p_amount,
        v_new_balance,
        'admin_credit',
        'admin_operation',
        gen_random_uuid(),
        p_description,
        v_user_id,
        'admin',
        'manual',
        'admin_add_balance_' || gen_random_uuid()::text
    ) RETURNING id INTO v_entry_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'new_balance', v_new_balance,
        'ledger_entry_id', v_entry_id,
        'message', 'Saldo agregado correctamente'
    );
END;
$$;

COMMENT ON FUNCTION public.admin_add_balance IS
'Admin adds balance to client wallet with store validation. Renamed from admin_add_balance_v2.';

-- Drop old versioned function
DROP FUNCTION IF EXISTS public.admin_add_balance_v2(UUID, NUMERIC, TEXT);


-- PART 3: Verification
-- =============================================

-- Verify old functions are dropped
DO $$
DECLARE
    v_old_functions TEXT[];
BEGIN
    SELECT ARRAY_AGG(proname)
    INTO v_old_functions
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('decrease_stock_atomic_v20', 'admin_add_balance_v2');

    IF v_old_functions IS NOT NULL THEN
        RAISE EXCEPTION 'Old versioned functions still exist: %', ARRAY_TO_STRING(v_old_functions, ', ');
    ELSE
        RAISE NOTICE 'SUCCESS: Old versioned functions dropped';
    END IF;
END $$;

-- Verify new functions exist
DO $$
DECLARE
    v_missing_functions TEXT[];
BEGIN
    SELECT ARRAY_AGG(fname)
    INTO v_missing_functions
    FROM (
        SELECT 'decrease_stock_atomic' AS fname
        WHERE NOT EXISTS (
            SELECT 1 FROM pg_proc
            WHERE pronamespace = 'public'::regnamespace
            AND proname = 'decrease_stock_atomic'
        )
        UNION ALL
        SELECT 'admin_add_balance'
        WHERE NOT EXISTS (
            SELECT 1 FROM pg_proc
            WHERE pronamespace = 'public'::regnamespace
            AND proname = 'admin_add_balance'
        )
    ) t;

    IF v_missing_functions IS NOT NULL THEN
        RAISE EXCEPTION 'New functions not created: %', ARRAY_TO_STRING(v_missing_functions, ', ');
    ELSE
        RAISE NOTICE 'SUCCESS: All new functions created successfully';
    END IF;
END $$;

-- Show final function list
SELECT proname, pronargs
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND proname IN ('decrease_stock_atomic', 'admin_add_balance')
ORDER BY proname;
