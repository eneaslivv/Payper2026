import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Product, InventoryItem } from '../types/payment';

interface UseProductsOptions {
    storeId: string;
    // Usa 'products' o 'inventory_items' según tu configuración
    source?: 'products' | 'inventory_items';
}

interface UseProductsReturn {
    products: Product[] | InventoryItem[];
    isLoading: boolean;
    error: string | null;
    refetch: () => void;
}

export function useProducts({
    storeId,
    source = 'products'
}: UseProductsOptions): UseProductsReturn {
    const [products, setProducts] = useState<Product[] | InventoryItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchProducts = useCallback(async () => {
        if (!storeId) {
            setIsLoading(false);
            return;
        }

        try {
            setIsLoading(true);
            setError(null);

            if (source === 'products') {
                // Obtener de tabla products
                const { data, error: fetchError } = await (supabase as any)
                    .from('products')
                    .select(`
            id,
            name,
            description,
            base_price,
            category,
            category_slug,
            is_available,
            active,
            store_id
          `)
                    .eq('store_id', storeId)
                    .eq('active', true)
                    .eq('is_available', true)
                    .order('category', { ascending: true })
                    .order('name', { ascending: true });

                if (fetchError) throw fetchError;
                setProducts(data || []);
            } else {
                // Obtener de tabla inventory_items (para menú)
                const { data, error: fetchError } = await (supabase as any)
                    .from('inventory_items')
                    .select(`
            id,
            name,
            description,
            price,
            category_id,
            is_menu_visible,
            image_url,
            store_id
          `)
                    .eq('store_id', storeId)
                    .eq('is_menu_visible', true)
                    .order('name', { ascending: true });

                if (fetchError) throw fetchError;
                setProducts(data || []);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al cargar productos');
            setProducts([]);
        } finally {
            setIsLoading(false);
        }
    }, [storeId, source]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    return {
        products,
        isLoading,
        error,
        refetch: fetchProducts,
    };
}
