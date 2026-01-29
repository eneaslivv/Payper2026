-- DATA REPAIR: Backfill Missing Inventory Items
-- Problem: Triggers fail because Recipies/Products point to IDs not present in inventory_items.
-- Solution: Auto-create missing inventory_items for every existing product.

DO $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    -- Insert missing items
    WITH missing_products AS (
        SELECT p.id, p.name, p.store_id, p.image
        FROM products p
        LEFT JOIN inventory_items ii ON p.id = ii.id
        WHERE ii.id IS NULL
    ),
    inserted AS (
        INSERT INTO inventory_items (
            id, 
            store_id, 
            name, 
            description, 
            sku, 
            unit_type, 
            current_stock, 
            min_stock_alert, 
            item_type, 
            is_active
        )
        SELECT 
            mp.id,
            mp.store_id,
            mp.name,
            'Auto-generated from Product',
            'GEN-' || SUBSTRING(mp.id::text, 1, 8),
            'unit', -- default unit
            0,      -- default stock
            5,      -- default alert
            'sellable', -- default type
            true
        FROM missing_products mp
        RETURNING id
    )
    SELECT count(*) INTO v_count FROM inserted;

    RAISE NOTICE 'Auto-created % missing inventory items.', v_count;
END $$;
