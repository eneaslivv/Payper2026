-- =============================================
-- FIX #3: MULTI-ORDER PER TABLE ARCHITECTURE
-- Fecha: 2026-02-13
-- Problema:
--   venue_nodes.active_order_id solo permite 1 orden activa
--   pero el sistema necesita múltiples pedidos por mesa
-- Solución:
--   Usar ARRAY de order IDs + triggers automáticos
-- =============================================

-- 1. BACKUP OLD active_order_id (In case of rollback)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'venue_nodes'
        AND column_name = 'active_order_id'
    ) THEN
        -- Add temporary column to preserve data
        ALTER TABLE venue_nodes
        ADD COLUMN IF NOT EXISTS _old_active_order_id UUID;

        -- Copy existing data
        UPDATE venue_nodes
        SET _old_active_order_id = active_order_id
        WHERE active_order_id IS NOT NULL;

        RAISE NOTICE 'Backed up existing active_order_id values';
    END IF;
END $$;

-- 2. DROP OLD COLUMN AND ADD ARRAY COLUMN
ALTER TABLE venue_nodes
DROP COLUMN IF EXISTS active_order_id CASCADE;

ALTER TABLE venue_nodes
ADD COLUMN IF NOT EXISTS active_order_ids UUID[] DEFAULT '{}';

-- 3. MIGRATE OLD DATA TO ARRAY
UPDATE venue_nodes
SET active_order_ids = ARRAY[_old_active_order_id]
WHERE _old_active_order_id IS NOT NULL;

-- 4. FUNCTION: AUTO-MAINTAIN active_order_ids ARRAY
CREATE OR REPLACE FUNCTION maintain_venue_active_orders()
RETURNS TRIGGER AS $$
BEGIN
    -- ============================================
    -- CASE A: NEW ORDER CREATED
    -- ============================================
    IF TG_OP = 'INSERT' AND NEW.node_id IS NOT NULL THEN
        -- Add order to venue's active list
        UPDATE venue_nodes
        SET active_order_ids = array_append(
            COALESCE(active_order_ids, '{}'),
            NEW.id
        ),
        updated_at = NOW()
        WHERE id = NEW.node_id
          AND NOT (NEW.id = ANY(COALESCE(active_order_ids, '{}')));

        RETURN NEW;
    END IF;

    -- ============================================
    -- CASE B: ORDER STATUS CHANGED
    -- ============================================
    IF TG_OP = 'UPDATE' THEN

        -- B1: Order moved to FINALIZED status → REMOVE from active list
        IF NEW.status IN ('served', 'cancelled', 'refunded', 'completed')
           AND (OLD.status NOT IN ('served', 'cancelled', 'refunded', 'completed') OR OLD.status IS NULL)
           AND NEW.node_id IS NOT NULL THEN

            UPDATE venue_nodes
            SET active_order_ids = array_remove(active_order_ids, NEW.id),
                updated_at = NOW()
            WHERE id = NEW.node_id;

            RAISE NOTICE 'Removed order % from venue % active list (status: %)',
                NEW.id, NEW.node_id, NEW.status;
        END IF;

        -- B2: Order node changed (moved to different table)
        IF OLD.node_id IS DISTINCT FROM NEW.node_id THEN
            -- Remove from old node
            IF OLD.node_id IS NOT NULL THEN
                UPDATE venue_nodes
                SET active_order_ids = array_remove(active_order_ids, NEW.id),
                    updated_at = NOW()
                WHERE id = OLD.node_id;
            END IF;

            -- Add to new node (if not finalized)
            IF NEW.node_id IS NOT NULL
               AND NEW.status NOT IN ('served', 'cancelled', 'refunded', 'completed') THEN
                UPDATE venue_nodes
                SET active_order_ids = array_append(
                    COALESCE(active_order_ids, '{}'),
                    NEW.id
                ),
                updated_at = NOW()
                WHERE id = NEW.node_id
                  AND NOT (NEW.id = ANY(COALESCE(active_order_ids, '{}')));
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- ============================================
    -- CASE C: ORDER DELETED
    -- ============================================
    IF TG_OP = 'DELETE' AND OLD.node_id IS NOT NULL THEN
        UPDATE venue_nodes
        SET active_order_ids = array_remove(active_order_ids, OLD.id),
            updated_at = NOW()
        WHERE id = OLD.node_id;

        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. CREATE TRIGGERS
DROP TRIGGER IF EXISTS trg_maintain_venue_orders_insert ON orders;
CREATE TRIGGER trg_maintain_venue_orders_insert
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION maintain_venue_active_orders();

DROP TRIGGER IF EXISTS trg_maintain_venue_orders_update ON orders;
CREATE TRIGGER trg_maintain_venue_orders_update
AFTER UPDATE OF status, node_id ON orders
FOR EACH ROW
EXECUTE FUNCTION maintain_venue_active_orders();

DROP TRIGGER IF EXISTS trg_maintain_venue_orders_delete ON orders;
CREATE TRIGGER trg_maintain_venue_orders_delete
AFTER DELETE ON orders
FOR EACH ROW
EXECUTE FUNCTION maintain_venue_active_orders();

-- 6. HELPER FUNCTION: Get Active Orders for a Table
CREATE OR REPLACE FUNCTION get_table_active_orders(p_node_id UUID)
RETURNS TABLE (
    order_id UUID,
    order_number TEXT,
    status order_status_enum,
    total_amount NUMERIC,
    created_at TIMESTAMPTZ,
    is_paid BOOLEAN,
    payment_method TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        o.id,
        o.order_number,
        o.status,
        o.total_amount,
        o.created_at,
        o.is_paid,
        o.payment_method
    FROM orders o
    WHERE o.id = ANY(
        SELECT unnest(active_order_ids)
        FROM venue_nodes
        WHERE id = p_node_id
    )
    ORDER BY o.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- 7. VIEW: Venue Nodes with Active Orders Summary
CREATE OR REPLACE VIEW venue_nodes_with_orders AS
SELECT
    vn.id as node_id,
    vn.label,
    vn.node_type,
    vn.capacity,
    vn.status,
    vn.active_order_ids,
    array_length(vn.active_order_ids, 1) as active_order_count,
    COALESCE(
        (
            SELECT json_agg(
                json_build_object(
                    'id', o.id,
                    'order_number', o.order_number,
                    'status', o.status,
                    'total_amount', o.total_amount,
                    'is_paid', o.is_paid,
                    'created_at', o.created_at
                )
                ORDER BY o.created_at ASC
            )
            FROM orders o
            WHERE o.id = ANY(vn.active_order_ids)
        ),
        '[]'::json
    ) as active_orders_details,
    COALESCE(
        (
            SELECT SUM(o.total_amount)
            FROM orders o
            WHERE o.id = ANY(vn.active_order_ids)
        ),
        0
    ) as total_pending_amount
FROM venue_nodes vn
WHERE vn.node_type IN ('table', 'bar');

-- 8. CLEANUP: Remove backup column after migration
-- (Keep it for now in case of rollback)
-- ALTER TABLE venue_nodes DROP COLUMN IF EXISTS _old_active_order_id;

-- 9. FIX EXISTING DATA: Rebuild active_order_ids from current orders
UPDATE venue_nodes vn
SET active_order_ids = (
    SELECT array_agg(o.id)
    FROM orders o
    WHERE o.node_id = vn.id
      AND o.status NOT IN ('served', 'cancelled', 'refunded', 'completed')
      AND o.archived_at IS NULL
);

-- 10. GRANT PERMISSIONS
GRANT EXECUTE ON FUNCTION get_table_active_orders(UUID) TO authenticated;
GRANT SELECT ON venue_nodes_with_orders TO authenticated;

-- 11. CREATE INDEX FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_venue_nodes_active_orders
ON venue_nodes USING GIN (active_order_ids);

CREATE INDEX IF NOT EXISTS idx_orders_node_status
ON orders(node_id, status)
WHERE node_id IS NOT NULL AND archived_at IS NULL;

-- 12. COMMENT
COMMENT ON COLUMN venue_nodes.active_order_ids IS
'Array of active order IDs for this table/node.
Automatically maintained by triggers when orders are created/updated/deleted.
Allows multiple simultaneous orders per table.';

COMMENT ON FUNCTION maintain_venue_active_orders IS
'Automatically maintains the active_order_ids array in venue_nodes.
Adds orders when created, removes when served/cancelled/deleted.
Handles order moves between tables.';

COMMENT ON VIEW venue_nodes_with_orders IS
'Denormalized view showing venue nodes with their active orders and summary data.
Useful for Kitchen Display and Table Management UIs.';
