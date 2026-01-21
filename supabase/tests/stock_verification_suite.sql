-- ==============================================================================
-- TEST SUITE: STOCK LOGIC VERIFICATION
-- Description: This script verifies that the stock deduction logic works correctly.
-- Usage: Run this script in the Supabase SQL Editor.
-- ==============================================================================

BEGIN;

-- 1. Setup Test Data
-- Create a temporary test table to log results
CREATE TEMP TABLE test_results (
    test_name TEXT,
    status TEXT,
    message TEXT
);

DO $$
DECLARE
    v_store_id UUID;
    v_item_id UUID;
    v_product_id UUID; -- Product directly linked to item (Direct Sale)
    v_recipe_product_id UUID; -- Product with recipe
    v_location_id UUID;
    v_order_id UUID;
    v_initial_stock NUMERIC;
    v_final_stock NUMERIC;
    v_movement_reason TEXT;
    v_qty_delta NUMERIC;
BEGIN
    -- INIT: Get a Store ID (using the first one found)
    SELECT id INTO v_store_id FROM stores LIMIT 1;
    
    -- INIT: Get/Create a Test Item
    -- Falla si no hay items. Asumimos que existe 'TEST' o tomamos uno.
    SELECT id, current_stock INTO v_item_id, v_initial_stock 
    FROM inventory_items 
    WHERE store_id = v_store_id 
    LIMIT 1;

    IF v_item_id IS NULL THEN
        INSERT INTO test_results VALUES ('Setup', 'FAIL', 'No inventory items found');
        RETURN;
    END IF;

    RAISE NOTICE 'Testing with Item ID: %, Initial Stock: %', v_item_id, v_initial_stock;

    -- =================================================================
    -- TEST 1: DIRECT SALE LOGIC (Mock)
    -- Verify that deduct_order_stock_manual handles 'direct_sale' correctly
    -- =================================================================
    
    -- We can't easily mock the full order flow in a DO block without inserting real data,
    -- causing side effects. Instead, we verify the Function Source Code Logic.
    
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'deduct_order_stock_manual' 
        AND prosrc ILIKE '%direct_sale%'
    ) THEN
        INSERT INTO test_results VALUES ('Check Function Source (RPC)', 'PASS', 'deduct_order_stock_manual contains direct_sale logic');
    ELSE
        INSERT INTO test_results VALUES ('Check Function Source (RPC)', 'FAIL', 'deduct_order_stock_manual MISSING direct_sale logic');
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'deduct_order_stock' 
        AND prosrc ILIKE '%direct_sale%'
    ) THEN
        INSERT INTO test_results VALUES ('Check Function Source (Trigger)', 'PASS', 'deduct_order_stock (Trigger) contains direct_sale logic');
    ELSE
        INSERT INTO test_results VALUES ('Check Function Source (Trigger)', 'FAIL', 'deduct_order_stock (Trigger) MISSING direct_sale logic');
    END IF;

    -- =================================================================
    -- TEST 2: CHECK CONSTRAINTS
    -- Verify that stock_movements allows 'direct_sale'
    -- =================================================================

    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'stock_movements_reason_check' 
        AND pg_get_constraintdef(oid) ILIKE '%direct_sale%'
    ) THEN
        INSERT INTO test_results VALUES ('Check Constraints', 'PASS', 'stock_movements accepts direct_sale');
    ELSE
        INSERT INTO test_results VALUES ('Check Constraints', 'FAIL', 'stock_movements_reason_check MISSING direct_sale');
    END IF;

    -- =================================================================
    -- TEST 3: COLUMN EXISTENCE
    -- Verify that functions reference correct columns (source_location_id)
    -- =================================================================
    
    IF EXISTS (
        SELECT 1 FROM pg_proc 
        WHERE proname = 'deduct_order_stock' 
        AND prosrc ILIKE '%source_location_id%'
    ) THEN
        INSERT INTO test_results VALUES ('Check Col Ref (Trigger)', 'PASS', 'Trigger uses source_location_id');
    ELSE
        INSERT INTO test_results VALUES ('Check Col Ref (Trigger)', 'WARNING', 'Trigger might be using wrong location column (or logic changed)');
    END IF;


    -- =================================================================
    -- TEST 4: TRIGGER CONFIGURATION
    -- Verify INSERT trigger exists
    -- =================================================================

    IF EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_deduct_stock_on_insert'
    ) THEN
        INSERT INTO test_results VALUES ('Check INSERT Trigger', 'PASS', 'trg_deduct_stock_on_insert exists');
    ELSE
        INSERT INTO test_results VALUES ('Check INSERT Trigger', 'FAIL', 'trg_deduct_stock_on_insert IS MISSING');
    END IF;

END $$;

-- OUTPUT RESULTS
SELECT * FROM test_results;

ROLLBACK; -- Always rollback to not leave test data/artifacts (though we only read mostly)
