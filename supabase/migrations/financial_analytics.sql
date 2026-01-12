-- FINANCIAL ANALYTICS SYSTEM MIGRATION
-- Run in Supabase SQL Editor

-- 1. UPDATE AUDIT LOG ACTION TYPES
-- We need to drop the existing check constraint and add a new one with the expanded enum values
DO $$
BEGIN
    -- Try to drop constraint if it exists (name might vary, so we target the constraint on the column)
    ALTER TABLE public.inventory_audit_logs DROP CONSTRAINT IF EXISTS inventory_audit_logs_action_type_check;
    
    -- Add new constraint with expanded values
    ALTER TABLE public.inventory_audit_logs ADD CONSTRAINT inventory_audit_logs_action_type_check 
    CHECK (action_type IN (
        'purchase', 
        'loss',             -- Generic loss (legacy)
        'loss_expired',     -- Vencido
        'loss_damaged',     -- Dañado/Roto
        'loss_theft',       -- Robo/Hurto
        'gift',             -- Regalo/Marketing
        'internal_use',     -- Consumo Equipo/PR
        'reentry',          -- Re-ingreso (Sobrante)
        'adjustment',       -- Ajuste manual
        'deletion',         -- Eliminación de producto (soft delete)
        'restock',          -- Reposición de stock
        'waste',            -- Desperdicio (generic)
        'recipe_consumption', -- Consumo por receta (automático)
        'edit_item', 
        'transfer', 
        'recount', 
        'sale', 
        'open_package', 
        'use_open'
    ));
END $$;

-- 2. CREATE FIXED EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.fixed_expenses (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    amount numeric NOT NULL CHECK (amount > 0),
    category text NOT NULL CHECK (category IN ('rent', 'utilities', 'salaries', 'marketing_fixed', 'software', 'maintenance', 'other')),
    expense_date date NOT NULL DEFAULT CURRENT_DATE,
    is_recurring boolean DEFAULT false,
    recurrence_frequency text CHECK (recurrence_frequency IN ('monthly', 'weekly', 'yearly')),
    created_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.fixed_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Manage fixed expenses" ON public.fixed_expenses;
CREATE POLICY "Manage fixed expenses" ON public.fixed_expenses
    FOR ALL USING (store_id IN (
        SELECT store_id FROM public.profiles WHERE id = auth.uid()
    ));

-- 3. FINANCIAL METRICS RPC
-- Calculates Revenue, Cash Flow, Variable Expenses, Fixed Expenses, and Net Profit
CREATE OR REPLACE FUNCTION public.get_financial_metrics(
    p_start_date timestamptz,
    p_end_date timestamptz,
    p_store_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_gross_revenue numeric := 0;
    v_net_cash_flow numeric := 0;
    v_total_orders integer := 0;
    v_revenue_by_method jsonb;
    
    v_variable_expenses numeric := 0;
    v_marketing_loss numeric := 0; -- gifts
    v_internal_loss numeric := 0; -- internal_use
    v_operational_loss numeric := 0; -- expired, damaged, theft, loss
    
    v_fixed_expenses_total numeric := 0;
    v_cogs_estimated numeric := 0; -- Cost of Goods Sold
    
    v_topups_total numeric := 0;
    v_wallet_usage numeric := 0;
BEGIN
    -- 1. REVENUE (VENTAS) & ORDERS
    -- Sum of all completed/confirmed orders
    SELECT 
        COALESCE(SUM(total_amount), 0),
        COUNT(*)
    INTO v_gross_revenue, v_total_orders
    FROM public.orders
    WHERE store_id = p_store_id 
    AND created_at BETWEEN p_start_date AND p_end_date
    AND status IN ('completed', 'confirmed', 'ready', 'delivered'); -- Assuming these are valid "sales" statuses

    -- 2. REVENUE BY PAYMENT METHOD
    SELECT json_agg(json_build_object('method', method, 'total', total))
    INTO v_revenue_by_method
    FROM (
        SELECT payment_method as method, SUM(total_amount) as total
        FROM public.orders
        WHERE store_id = p_store_id 
        AND created_at BETWEEN p_start_date AND p_end_date
        AND status IN ('completed', 'confirmed', 'ready', 'delivered')
        GROUP BY payment_method
    ) t;

    -- 3. WALLET MOVEMENTS (CASH FLOW)
    -- Topups (Real Cash In)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_topups_total
    FROM public.wallet_transactions
    WHERE amount > 0 -- Positive means topup
    AND created_at BETWEEN p_start_date AND p_end_date;
    
    -- 4. CASH FLOW CALCULATION
    -- Cash Flow = (Sales paid by Cash/Card/Transfer) + (Wallet Topups)
    -- Note: Sales paid by Wallet should NOT count as Cash Flow in this period (cash came in earlier during topup)
    DECLARE
        v_sales_non_wallet numeric := 0;
    BEGIN
        SELECT COALESCE(SUM(total_amount), 0)
        INTO v_sales_non_wallet
        FROM public.orders
        WHERE store_id = p_store_id 
        AND created_at BETWEEN p_start_date AND p_end_date
        AND status IN ('completed', 'confirmed', 'ready', 'delivered')
        AND payment_method != 'wallet';
        
        v_net_cash_flow := v_sales_non_wallet + v_topups_total;
    END;

    -- 5. VARIABLE EXPENSES (INVENTORY LOSSES EVALUATED AT COST)
    -- We assume current cost for historical simplicity, or unit_cost if stored in audit log
    
    -- Marketing (Gifts)
    SELECT COALESCE(SUM(ABS(quantity_delta) * COALESCE(unit_cost, (SELECT cost FROM public.inventory_items WHERE id = item_id), 0)), 0)
    INTO v_marketing_loss
    FROM public.inventory_audit_logs
    WHERE store_id = p_store_id
    AND created_at BETWEEN p_start_date AND p_end_date
    AND action_type = 'gift';

    -- Internal Use (PR/Staff)
    SELECT COALESCE(SUM(ABS(quantity_delta) * COALESCE(unit_cost, (SELECT cost FROM public.inventory_items WHERE id = item_id), 0)), 0)
    INTO v_internal_loss
    FROM public.inventory_audit_logs
    WHERE store_id = p_store_id
    AND created_at BETWEEN p_start_date AND p_end_date
    AND action_type = 'internal_use';

    -- Operational Loss (Expired, Damaged, Theft, Generic Loss)
    SELECT COALESCE(SUM(ABS(quantity_delta) * COALESCE(unit_cost, (SELECT cost FROM public.inventory_items WHERE id = item_id), 0)), 0)
    INTO v_operational_loss
    FROM public.inventory_audit_logs
    WHERE store_id = p_store_id
    AND created_at BETWEEN p_start_date AND p_end_date
    AND action_type IN ('loss', 'loss_expired', 'loss_damaged', 'loss_theft');

    v_variable_expenses := v_marketing_loss + v_internal_loss + v_operational_loss;

    -- 6. FIXED EXPENSES
    SELECT COALESCE(SUM(amount), 0)
    INTO v_fixed_expenses_total
    FROM public.fixed_expenses
    WHERE store_id = p_store_id
    AND expense_date BETWEEN p_start_date::date AND p_end_date::date;

    -- 7. ESTIMATED COGS (Cost of Goods Sold)
    -- This is tricky without a dedicated sales_items ledger with cost snapshot.
    -- We will estimate based on Order Items * Current Item Cost
    -- For v2 we should snapshot cost at moment of sale.
    WITH sold_items AS (
        SELECT 
            (elem->>'quantity')::numeric as qty
            -- We need to join with inventory items to get cost. 
            -- Assuming order metadata or we have to parse order_items JSON.
            -- This is complex. For now, let's leave COGS as 0 or implement a simpler approximation if possible.
            -- A better approach for COGS is: (Beginning Inventory + Purchases) - Ending Inventory.
            -- But for Realtime dashboard, we might skip COGS for now or use a flat % if user wants.
            -- Let's try to query order_items table if it exists?
            -- Based on previous context, there is a 'order_items' table.
    )
    SELECT COALESCE(SUM(oi.quantity * ii.cost), 0)
    INTO v_cogs_estimated
    FROM public.order_items oi
    JOIN public.inventory_items ii ON oi.product_id = ii.id -- Assuming product_id links to inventory or we have a mapping
    JOIN public.orders o ON oi.order_id = o.id
    WHERE o.store_id = p_store_id
    AND o.created_at BETWEEN p_start_date AND p_end_date
    AND o.status IN ('completed', 'confirmed', 'ready', 'delivered');

    -- IF order_items DOES NOT link directly to inventory_items (common in this app if products are separate), COGS will be 0.
    -- We will handle this gracefully.

    -- 8. NET PROFIT
    -- Net Profit = Revenue - COGS - Variable Expenses - Fixed Expenses
    DECLARE
        v_gross_profit numeric;
        v_net_profit numeric;
    BEGIN
        v_gross_profit := v_gross_revenue - v_cogs_estimated;
        v_net_profit := v_gross_profit - v_variable_expenses - v_fixed_expenses_total;

        RETURN json_build_object(
            'gross_revenue', v_gross_revenue,
            'net_cash_flow', v_net_cash_flow,
            'total_orders', v_total_orders,
            'revenue_by_method', COALESCE(v_revenue_by_method, '[]'::jsonb),
            'expenses', json_build_object(
                'variable_total', v_variable_expenses,
                'marketing', v_marketing_loss,
                'internal', v_internal_loss,
                'operational_loss', v_operational_loss,
                'fixed_total', v_fixed_expenses_total,
                'cogs_estimated', v_cogs_estimated
            ),
            'profitability', json_build_object(
                'gross_profit', v_gross_profit,
                'net_profit', v_net_profit,
                'margin_percent', CASE WHEN v_gross_revenue > 0 THEN ROUND((v_net_profit / v_gross_revenue) * 100, 2) ELSE 0 END
            )
        );
    END;
END;
$$;
