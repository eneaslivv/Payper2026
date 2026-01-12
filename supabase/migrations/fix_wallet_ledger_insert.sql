-- Fix admin_add_balance_v2 to include balance_after
CREATE OR REPLACE FUNCTION public.admin_add_balance_v2(
    p_user_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT, -- 'cash', 'transfer', 'card'
    p_description TEXT DEFAULT 'Carga manual'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_new_balance NUMERIC;
    v_store_id UUID;
BEGIN
    -- Get client & store
    SELECT * INTO v_client FROM public.clients WHERE id = p_user_id;
    IF v_client IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cliente no encontrado');
    END IF;
    v_store_id := v_client.store_id;

    -- Update Client Balance
    UPDATE public.clients 
    SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount 
    WHERE id = p_user_id
    RETURNING wallet_balance INTO v_new_balance;

    -- Insert VALID Ledger Entry INCLUDING balance_after
    INSERT INTO public.wallet_ledger (
        wallet_id,
        store_id,
        amount,
        entry_type, -- 'topup'
        payment_method, -- 'cash', 'transfer'
        description,
        source,
        balance_after, -- FIX: Added required column
        currency
    ) VALUES (
        p_user_id,
        v_store_id,
        p_amount,
        'topup',
        p_payment_method,
        p_description,
        'admin_panel',
        v_new_balance, -- FIX: Insert new balance
        'ARS' -- Default currency matching schema constraint if any, or general convention
    );

    RETURN jsonb_build_object(
        'success', true, 
        'new_balance', v_new_balance,
        'message', 'Saldo agregado correctamente'
    );
END;
$$;
