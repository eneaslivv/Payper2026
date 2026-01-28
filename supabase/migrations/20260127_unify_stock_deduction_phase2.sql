-- Phase 2: Stock Unification - Trigger Switch
-- Date: 2026-01-27
-- Requires: Phase 1 (deduct_order_stock_unified)

-- 1. Create Trigger Function Wrapper
CREATE OR REPLACE FUNCTION handle_stock_deduction_trigger()
RETURNS TRIGGER AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Strict Condition: Process when moving to 'served' OR 'Entregado' (legacy)
    -- and stock has not been deducted yet.
    IF (NEW.status IN ('served', 'Entregado') 
        AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.status IS NULL)
        AND COALESCE(NEW.stock_deducted, FALSE) = FALSE) THEN
        
        -- Call unified function with 'trigger' context (logs errors silently)
        v_result := deduct_order_stock_unified(NEW.id, 'trigger');
        
        -- Set flag ONLY if operation was successful
        IF (v_result->>'success')::BOOLEAN THEN
            NEW.stock_deducted := TRUE;
        ELSE
            -- Log warning for visibility but don't block the transaction
            -- (Error is already detailled in stock_deduction_errors table)
            RAISE WARNING 'Stock deduction failed for order % in trigger: %', 
                NEW.id, v_result->>'error';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Replace Legacy Triggers
-- We drop both known variations to ensure a clean state
DROP TRIGGER IF EXISTS trg_deduct_stock_on_delivery ON orders;
DROP TRIGGER IF EXISTS trg_finalize_stock ON orders;

-- Create the robust NEW trigger
CREATE TRIGGER trg_deduct_stock_unified
BEFORE UPDATE OF status ON orders
FOR EACH ROW
EXECUTE FUNCTION handle_stock_deduction_trigger();

COMMENT ON TRIGGER trg_deduct_stock_unified ON orders IS 'Unified stock deduction trigger. Replaces direct_sale and recipe logic v5/v20/v24.';
