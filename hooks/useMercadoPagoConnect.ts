import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface MPConnectionStatus {
    is_connected: boolean;
    mp_user_id: string | null;
    mp_nickname: string | null;
    mp_email: string | null;
    mp_access_token?: string | null;
    mp_public_key?: string | null;
}

const MP_APP_ID = "2839669811317212"; // Public App ID provided in documentation
const REDIRECT_URI = window.location.origin + '/admin/settings'; // Adjust route as needed

export const useMercadoPagoConnect = (storeId: string) => {
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<MPConnectionStatus | null>(null);

    // 1. Get current connection status (using RPC for security)
    const fetchStatus = useCallback(async () => {
        if (!storeId) return;
        try {
            // Using RPC to avoid reading protected columns directly if possible,
            // or select specific public columns if RLS permits.
            // Documentation implies we should use `get_store_mp_status` RPC.
            const { data, error } = await (supabase as any)
                .rpc('get_store_mp_status', { p_store_id: storeId });

            if (error) {
                // Fallback: Check public columns directly if RPC fails or doesn't exist yet in dev
                console.warn('RPC get_store_mp_status failed, falling back to direct select', error);
                const { data: store, error: storeError } = await supabase
                    .from('stores')
                    .select('mp_user_id, mp_nickname, mp_email, mp_access_token, mp_public_key')
                    .eq('id', storeId)
                    .single();

                if (storeError) throw storeError;

                const storeData = store as any;

                setStatus({
                    is_connected: !!storeData?.mp_user_id,
                    mp_user_id: storeData?.mp_user_id,
                    mp_nickname: storeData?.mp_nickname,
                    mp_email: storeData?.mp_email,
                    mp_access_token: storeData?.mp_access_token,
                    mp_public_key: storeData?.mp_public_key
                });
            } else {
                // RPC returns an array usually, or single object depending on definition
                // The docs say "RETURNS TABLE", so it returns an array of rows.
                const result = Array.isArray(data) ? data[0] : data;
                setStatus(result);
            }
        } catch (err) {
            console.error('Error fetching MP status:', err);
        }
    }, [storeId]);

    // 2. Initiate OAuth Flow
    const connect = () => {
        const authUrl = `https://auth.mercadopago.com.ar/authorization?client_id=${MP_APP_ID}&response_type=code&platform_id=mp&state=${storeId}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
        window.location.href = authUrl;
    };

    // 3. Handle OAuth Callback (Extract code and call Edge Function)
    const handleCallback = useCallback(async (code: string) => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.functions.invoke('mp-connect', {
                body: {
                    code,
                    redirect_uri: REDIRECT_URI,
                    store_id: storeId
                }
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.message || 'Error vinculando cuenta');

            await fetchStatus(); // Refresh status
            return { success: true };
        } catch (error: any) {
            console.error('MP Connect Error:', error);
            return { success: false, error: error.message };
        } finally {
            setIsLoading(false);
        }
    }, [storeId, fetchStatus]);

    // 4. Disconnect
    const disconnect = async () => {
        if (!confirm('¿Estás seguro de desvincular Mercado Pago? Dejarás de recibir pagos.')) return;

        setIsLoading(true);
        try {
            // Usually we just clear the fields in the DB
            const { error } = await supabase
                .from('stores')
                .update({
                    mp_access_token: null,
                    mp_refresh_token: null,
                    mp_user_id: null,
                    mp_nickname: null,
                    mp_email: null
                } as any)
                .eq('id', storeId);

            if (error) throw error;
            await fetchStatus();
        } catch (error) {
            console.error('Error disconnecting:', error);
            alert('Error al desvincular');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    return {
        connect,
        disconnect,
        handleCallback,
        status,
        isLoading,
        refreshStatus: fetchStatus
    };
};
