-- Fix admin_add_balance_v2 to resolve wallet_id from wallets table
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
    v_wallet_id UUID; -- Variable to hold the actual wallet ID
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

    -- Resolve Wallet ID
    SELECT id INTO v_wallet_id 
    FROM public.wallets 
    WHERE user_id = p_user_id AND store_id = v_store_id;

    -- If wallet doesn't exist, create it (safety net) or handle error
    IF v_wallet_id IS NULL THEN
        INSERT INTO public.wallets (user_id, store_id, balance, currency)
        VALUES (p_user_id, v_store_id, v_new_balance, 'ARS')
        RETURNING id INTO v_wallet_id;
    ELSE
         -- Also update the independent wallet table balance if it exists separately from client.wallet_balance?
         -- The main app seems to use clients.wallet_balance for display sometimes, but WalletPage uses wallets table.
         -- To be safe and consistent, we should update the wallets table too.
         UPDATE public.wallets 
         SET balance = v_new_balance
         WHERE id = v_wallet_id;
    END IF;

    -- Insert VALID Ledger Entry
    INSERT INTO public.wallet_ledger (
        wallet_id, -- Now using the correct Foreign Key
        store_id,
        amount,
        entry_type, -- 'topup'
        payment_method, -- 'cash', 'transfer'
        description,
        source,
        balance_after,
        currency
    ) VALUES (
        v_wallet_id, -- Using v_wallet_id instead of p_user_id
        v_store_id,
        p_amount,
        'topup',
        p_payment_method,
        p_description,
        'admin_panel',
        v_new_balance,
        'ARS'
    );

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'message', 'Saldo agregado correctamente'
    );
END;
$$;
