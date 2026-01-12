-- Migration: Ensure Order Payment Triggers Robust Stock Deduction
-- Binds 'finalize_order_stock' (Loyalty/Variant aware) to Order Payment events.

-- 1. Create Wrapper Function for Trigger
CREATE OR REPLACE FUNCTION trigger_finalize_stock_wrapper() RETURNS TRIGGER AS $$
BEGIN
    -- Only run if order is paid and stock not yet deducted
    IF NEW.is_paid = TRUE AND NEW.stock_deducted = FALSE THEN
        -- Call the main logic (Idempotent check inside function usually, but good to check here too)
        PERFORM finalize_order_stock(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop potential conflicting triggers (like the old deduct_stock_for_order)
DROP TRIGGER IF EXISTS trigger_deduct_stock_on_payment ON orders;
-- Note: We replace the old trigger name to ensure we take over the behavior

-- 3. Create New Trigger
CREATE TRIGGER trigger_deduct_stock_on_payment
    AFTER UPDATE OF is_paid ON orders
    FOR EACH ROW
    EXECUTE FUNCTION trigger_finalize_stock_wrapper();

-- 4. Also Trigger on INSERT (if created as PAID directly, e.g. Local POS)
DROP TRIGGER IF EXISTS trigger_deduct_stock_on_insert_paid ON orders;
CREATE TRIGGER trigger_deduct_stock_on_insert_paid
    AFTER INSERT ON orders
    FOR EACH ROW
    WHEN (NEW.is_paid = TRUE)
    EXECUTE FUNCTION trigger_finalize_stock_wrapper();
