-- Migration: Restore Finalize Order Stock Trigger
-- Purpose: Ensure stock is deducted when order is paid/served. This was missing.
-- Date: 2026-01-18

-- 1. Create Wrapper Function (Trigger Function)
CREATE OR REPLACE FUNCTION public.trigger_finalize_order_stock()
RETURNS TRIGGER AS $$
BEGIN
    -- Check conditions: Served/Completed + Paid + Not yet deducted
    IF (NEW.status IN ('served', 'completed', 'delivered')) 
       AND NEW.is_paid = TRUE 
       AND NEW.stock_deducted = FALSE THEN
        
        -- Call the main logic
        -- Note: finaliz_order_stock handles the deduction and sets stock_deducted = true
        PERFORM public.finalize_order_stock(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Create Trigger on Orders
DROP TRIGGER IF EXISTS trg_finalize_stock ON public.orders;
CREATE TRIGGER trg_finalize_stock
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.trigger_finalize_order_stock();
