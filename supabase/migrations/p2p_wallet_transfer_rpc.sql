-- RPC for P2P Wallet Transfer
-- Allows a logged-in user to transfer balance to another user in the SAME store using email.

CREATE OR REPLACE FUNCTION public.p2p_wallet_transfer(
    p_recipient_email TEXT,
    p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sender_id UUID;
    v_sender_store_id UUID;
    v_sender_balance NUMERIC;
    v_recipient_id UUID;
    v_recipient_wallet_id UUID;
    v_sender_wallet_id UUID;
    v_new_sender_balance NUMERIC;
    v_new_recipient_balance NUMERIC;
BEGIN
    -- 1. Identify Sender (Current User)
    v_sender_id := auth.uid();
    IF v_sender_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Usuario no autenticado');
    END IF;

    -- 2. Validate Amount
    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'message', 'El monto debe ser positivo');
    END IF;

    -- 3. Get Sender's Client Profile & Balance
    -- We need the store_id to ensure intra-store transfer
    SELECT store_id, wallet_balance INTO v_sender_store_id, v_sender_balance
    FROM public.clients
    WHERE auth_user_id = v_sender_id
    LIMIT 1;

    IF v_sender_store_id IS NULL THEN
         -- Try fallback to profile store if client record is missing (should not happen in app context)
        RETURN jsonb_build_object('success', false, 'message', 'Perfil de cliente no encontrado');
    END IF;

    -- 4. Check Funds
    IF v_sender_balance < p_amount THEN
        RETURN jsonb_build_object('success', false, 'message', 'Saldo insuficiente');
    END IF;

    -- 5. Find Recipient in specific store
    SELECT id INTO v_recipient_id
    FROM public.clients
    WHERE email = p_recipient_email
      AND store_id = v_sender_store_id
    LIMIT 1;

    IF v_recipient_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'message', 'Destinatario no encontrado en este local');
    END IF;

    IF v_recipient_id = v_sender_id THEN -- Assuming client.id is usually auth_user_id, but logically prevent self-transfer
         -- Check auth_user_id equality if ids differ in format, but usually strictly:
         -- We should check if the found client maps to the sending user
         IF EXISTS (SELECT 1 FROM public.clients WHERE id = v_recipient_id AND auth_user_id = v_sender_id) THEN
            RETURN jsonb_build_object('success', false, 'message', 'No puedes transferirte a ti mismo');
         END IF;
    END IF;

    -- 6. Get Wallets (Create Recipient's if null? Logic suggests we should, but for safety lets rely on existing)
    -- Upsert Sender Wallet
    INSERT INTO public.wallets (user_id, store_id, balance, currency)
    VALUES (v_sender_id, v_sender_store_id, 0, 'ARS')
    ON CONFLICT (user_id, store_id) DO UPDATE SET balance = wallets.balance -- No op, just get ID
    RETURNING id INTO v_sender_wallet_id;

    -- Upsert Recipient Wallet (using the auth_user_id from the found client row? 
    -- WAIT: public.clients.id IS NOT ALWAYS auth.uid. 
    -- The wallets table uses user_id REFERENCES clients(id) according to schema fix.
    -- Let's re-verify schema. fix_wallet_architecture.sql says: user_id UUID REFERENCES public.clients(id).
    -- so v_sender_id (auth.uid) might NOT be the FK. We need the client ID.
    
    -- Correction: Get Sender Client ID
    SELECT id INTO v_sender_id FROM public.clients WHERE auth_user_id = auth.uid() AND store_id = v_sender_store_id LIMIT 1;

    -- Upsert Wallets using CLIENT IDs
    INSERT INTO public.wallets (user_id, store_id, balance, currency)
    VALUES (v_sender_id, v_sender_store_id, v_sender_balance, 'ARS')
    ON CONFLICT (user_id, store_id) DO UPDATE SET balance = EXCLUDED.balance
    RETURNING id INTO v_sender_wallet_id;

    INSERT INTO public.wallets (user_id, store_id, balance, currency)
    VALUES (v_recipient_id, v_sender_store_id, 0, 'ARS')
    ON CONFLICT (user_id, store_id) DO UPDATE SET balance = wallets.balance -- Preserve existing
    RETURNING id INTO v_recipient_wallet_id;

    -- 7. EXECUTE TRANSFER (Atomic Updates)
    
    -- Deduct from Sender
    UPDATE public.clients
    SET wallet_balance = wallet_balance - p_amount
    WHERE id = v_sender_id
    RETURNING wallet_balance INTO v_new_sender_balance;

    UPDATE public.wallets
    SET balance = v_new_sender_balance
    WHERE id = v_sender_wallet_id;

    -- Add to Recipient
    UPDATE public.clients
    SET wallet_balance = COALESCE(wallet_balance, 0) + p_amount
    WHERE id = v_recipient_id
    RETURNING wallet_balance INTO v_new_recipient_balance;
    
    UPDATE public.wallets
    SET balance = v_new_recipient_balance
    WHERE id = v_recipient_wallet_id;

    -- 8. Ledger Entries
    INSERT INTO public.wallet_ledger (wallet_id, store_id, amount, entry_type, payment_method, description, source, balance_after, currency)
    VALUES (v_sender_wallet_id, v_sender_store_id, -p_amount, 'transfer_out', 'wallet', 'Transferencia a ' || p_recipient_email, 'app', v_new_sender_balance, 'ARS');

    INSERT INTO public.wallet_ledger (wallet_id, store_id, amount, entry_type, payment_method, description, source, balance_after, currency)
    VALUES (v_recipient_wallet_id, v_sender_store_id, p_amount, 'transfer_in', 'wallet', 'Recibido de ' || (SELECT email FROM clients WHERE id = v_sender_id), 'app', v_new_recipient_balance, 'ARS');

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_sender_balance,
        'recipient_email', p_recipient_email,
        'message', 'Transferencia exitosa'
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
