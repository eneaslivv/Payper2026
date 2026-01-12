-- =============================================
-- FIXED EXPENSES LOGIC
-- =============================================

-- 1. REGISTER FIXED EXPENSE
-- Allows adding a new expense record safely
-- =============================================
CREATE OR REPLACE FUNCTION public.register_fixed_expense(
    p_name TEXT,
    p_amount NUMERIC,
    p_category TEXT, -- 'rent', 'utilities', 'salaries', 'marketing_fixed', 'software', 'maintenance', 'other'
    p_description TEXT,
    p_date DATE,
    p_is_recurring BOOLEAN,
    p_recurrence_frequency TEXT, -- 'monthly', 'weekly', 'yearly'
    p_store_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_id UUID;
BEGIN
    -- Validate Category (Simple Check)
    IF p_category NOT IN ('rent', 'utilities', 'salaries', 'marketing_fixed', 'software', 'maintenance', 'other') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Categoría inválida');
    END IF;

    INSERT INTO public.fixed_expenses (
        store_id,
        name,
        amount,
        category,
        description,
        expense_date,
        is_recurring,
        recurrence_frequency,
        created_by
    ) VALUES (
        p_store_id,
        p_name,
        p_amount,
        p_category,
        p_description,
        p_date,
        p_is_recurring,
        p_recurrence_frequency,
        auth.uid()
    ) RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'success', true, 
        'id', v_new_id,
        'message', 'Gasto registrado correctamente'
    );
END;
$$;
