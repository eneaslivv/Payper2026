import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Store } from '../types/payment';

interface UseStoreOptions {
    slug: string;
}

interface UseStoreReturn {
    store: Store | null;
    isLoading: boolean;
    error: string | null;
    canProcessPayments: boolean;
    refetch: () => void;
}

export function useStore({ slug }: UseStoreOptions): UseStoreReturn {
    const [store, setStore] = useState<Store | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStore = useCallback(async () => {
        if (!slug) {
            setError('No se proporcionó slug de tienda');
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            const { data, error: fetchError } = await (supabase as any)
                .from('stores')
                .select(`
          id,
          name,
          slug,
          logo_url,
          address,
          menu_theme,
          menu_logic,
          mp_user_id,
          mp_nickname,
          mp_email
        `)
                .eq('slug', slug)
                .eq('is_active', true)
                .maybeSingle();

            if (fetchError) {
                throw fetchError;
            }

            if (!data) {
                setError('Tienda no encontrada');
                setStore(null);
            } else {
                setStore(data as unknown as Store);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al cargar tienda');
            setStore(null);
        } finally {
            setIsLoading(false);
        }
    }, [slug]);

    useEffect(() => {
        fetchStore();
    }, [fetchStore]);

    return {
        store,
        isLoading,
        error,
        // Si mp_user_id existe, la tienda puede procesar pagos
        canProcessPayments: !!store?.mp_user_id,
        refetch: fetchStore,
    };
}
