-- P4 Fix v2: Fix transfer_stock() INSERT INTO inventory_movements schema mismatch
-- The inventory_movements table has columns: id, tenant_id, inventory_item_id, lot_id, type(enum), qty_base_units, reason, ref_order_id, created_at
-- But transfer_stock() was using non-existent columns: movement_type, quantity, from_location_id, to_location_id, user_id, notes

CREATE OR REPLACE FUNCTION public.transfer_stock(
    p_item_id uuid,
    p_from_location_id uuid,
    p_to_location_id uuid,
    p_quantity numeric,
    p_user_id uuid DEFAULT auth.uid(),
    p_notes text DEFAULT ''::text,
    p_movement_type text DEFAULT 'transfer'::text,
    p_reason text DEFAULT 'Transferencia'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_store_id uuid;
    v_item_name text;
    v_movement_id uuid;
    v_current_stock numeric;
    v_from_stock numeric;
    v_caller_id UUID;
    v_caller_store UUID;
    v_unit_type text;
    v_movement_enum_type text;
BEGIN
    -- Auth check
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'UNAUTHORIZED');
    END IF;

    -- Get caller store
    SELECT store_id INTO v_caller_store FROM profiles WHERE id = v_caller_id;

    -- Get item details with row lock
    SELECT store_id, name, current_stock, unit_type
    INTO v_store_id, v_item_name, v_current_stock, v_unit_type
    FROM inventory_items
    WHERE id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'ITEM_NOT_FOUND',
            'message', 'Item no encontrado'
        );
    END IF;

    -- Validate store access
    IF v_caller_store IS NOT NULL AND v_caller_store != v_store_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'PERMISSION_DENIED',
            'message', 'Item no pertenece a tu local');
    END IF;

    -- Validate positive quantity
    IF p_quantity <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INVALID_QUANTITY',
            'message', 'Cantidad debe ser mayor a 0'
        );
    END IF;

    -- Validate source has enough stock (for actual transfers, not restocks)
    IF p_from_location_id IS NOT NULL THEN
        SELECT COALESCE(closed_units, 0) INTO v_from_stock
        FROM inventory_location_stock
        WHERE item_id = p_item_id AND location_id = p_from_location_id;

        IF NOT FOUND OR COALESCE(v_from_stock, 0) < p_quantity THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'INSUFFICIENT_STOCK',
                'message', format('Stock insuficiente en origen. Disponible: %s, Requerido: %s',
                    COALESCE(v_from_stock, 0)::text, p_quantity::text)
            );
        END IF;
    END IF;

    -- Determine inventory_movement_enum type
    -- Enum values: 'in', 'out', 'adjustment'
    IF p_from_location_id IS NULL THEN
        v_movement_enum_type := 'in';       -- Restock = incoming
    ELSIF p_to_location_id IS NULL THEN
        v_movement_enum_type := 'out';      -- Outgoing
    ELSE
        v_movement_enum_type := 'adjustment'; -- Transfer between locations
    END IF;

    -- FIX: Create movement record matching ACTUAL inventory_movements schema
    -- Actual columns: id(auto), tenant_id(NOT NULL), inventory_item_id, lot_id, type(enum), qty_base_units, reason, ref_order_id, created_at(auto)
    -- OLD (BROKEN): used movement_type, quantity, from_location_id, to_location_id, user_id, notes — NONE of these columns exist!
    INSERT INTO inventory_movements (
        tenant_id, inventory_item_id, type, qty_base_units, reason
    ) VALUES (
        v_store_id,
        p_item_id,
        v_movement_enum_type::inventory_movement_enum,
        p_quantity,
        COALESCE(p_reason, 'Transferencia')
    ) RETURNING id INTO v_movement_id;

    -- Also log to stock_movements ledger for PURCHASE/RESTOCK operations
    IF p_from_location_id IS NULL AND p_to_location_id IS NOT NULL THEN
        INSERT INTO stock_movements (
            store_id, inventory_item_id, order_id, qty_delta,
            unit_type, reason, idempotency_key, location_id, created_by
        ) VALUES (
            v_store_id, p_item_id, NULL, p_quantity,
            COALESCE(v_unit_type, 'un'), 'restock',
            v_movement_id::text, p_to_location_id, v_caller_id
        );
    END IF;

    -- Update stock based on operation type
    IF p_from_location_id IS NULL THEN
        -- RESTOCK: Add to global stock
        UPDATE inventory_items
        SET current_stock = current_stock + p_quantity, updated_at = NOW()
        WHERE id = p_item_id;

        -- Update location stock
        IF p_to_location_id IS NOT NULL THEN
            INSERT INTO inventory_location_stock (item_id, location_id, store_id, closed_units)
            VALUES (p_item_id, p_to_location_id, v_store_id, p_quantity)
            ON CONFLICT (store_id, item_id, location_id)
            DO UPDATE SET closed_units = inventory_location_stock.closed_units + p_quantity;
        END IF;
    ELSE
        -- TRANSFER: Deduct from source, add to destination
        UPDATE inventory_location_stock
        SET closed_units = closed_units - p_quantity
        WHERE item_id = p_item_id AND location_id = p_from_location_id;

        -- Add to destination location
        IF p_to_location_id IS NOT NULL THEN
            INSERT INTO inventory_location_stock (item_id, location_id, store_id, closed_units)
            VALUES (p_item_id, p_to_location_id, v_store_id, p_quantity)
            ON CONFLICT (store_id, item_id, location_id)
            DO UPDATE SET closed_units = inventory_location_stock.closed_units + p_quantity;
        END IF;

        -- Global stock stays the same for transfers
        UPDATE inventory_items SET updated_at = NOW() WHERE id = p_item_id;
    END IF;

    -- Get updated stock
    SELECT current_stock INTO v_current_stock
    FROM inventory_items WHERE id = p_item_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Transferencia completada exitosamente',
        'data', jsonb_build_object(
            'movement_id', v_movement_id,
            'item_id', p_item_id,
            'item_name', v_item_name,
            'quantity_transferred', p_quantity,
            'new_stock_level', v_current_stock,
            'movement_type', p_movement_type
        )
    );

EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'TRANSFER_FAILED',
            'message', 'Error: ' || SQLERRM
        );
END;
$function$;
