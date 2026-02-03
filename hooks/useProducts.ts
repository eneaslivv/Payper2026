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
                // 1. Fetch PRODUCTS (Standard)
                // Usamos 'public_products' view o 'products' table
                const productsPromise = (supabase as any)
                    .from('products')
                    .select(`
                        id,
                        name,
                        description,
                        base_price,
                        category,
                        category_slug,
                        is_available,
                        is_visible,
                        active,
                        store_id,
                        image_url,
                        image
                    `)
                    .eq('store_id', storeId)
                    .eq('active', true)
                    .eq('is_visible', true);

                // 2. Fetch ALL INVENTORY items (for enrichment, ignore visibility)
                // We need all items to find images/stock even if they are not explicitly "menu visible" as standalone items
                const inventoryPromise = (supabase as any)
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
                    .eq('is_active', true);

                // 3. Fetch CATEGORIES to map IDs to Names
                const categoriesPromise = (supabase as any)
                    .from('categories')
                    .select('id, name, slug')
                    .eq('store_id', storeId);

                const [productsReq, inventoryReq, categoriesReq] = await Promise.all([
                    productsPromise,
                    inventoryPromise,
                    categoriesPromise
                ]);

                if (productsReq.error) throw productsReq.error;
                if (inventoryReq.error) console.warn('Error fetching inventory items:', inventoryReq.error);

                const rawProducts = productsReq.data || [];
                const rawInventory = inventoryReq.data || [];
                const categories = categoriesReq.data || [];

                // Create Inventory Map for faster lookup (by name)
                const inventoryMap = new Map<string, any>();
                rawInventory.forEach((item: any) => {
                    inventoryMap.set(item.name.trim().toLowerCase(), item);
                });

                // Create Category Map
                const categoryMap = new Map<string, { id: string; name: string; slug: string }>();
                categories.forEach((c: any) => {
                    if (c && c.id) categoryMap.set(c.id, c);
                });

                // Helper to check duplicates
                const productNames = new Set(rawProducts.map((p: any) => p.name.trim().toLowerCase()));

                // ENRICH PRODUCTS: If product image is missing, try to find it in inventory
                const enrichedProducts = rawProducts.map((p: any) => {
                    // Normalize image field
                    if (!p.image_url && p.image) {
                        p.image_url = p.image;
                    }

                    if (!p.image_url || p.image_url === '') {
                        const invItem = inventoryMap.get(p.name.trim().toLowerCase());
                        if (invItem && invItem.image_url) {
                            return { ...p, image_url: invItem.image_url };
                        }
                    }
                    return p;
                });

                // Map Inventory to Product Shape (Only for items NOT in products)
                const mappedInventory = rawInventory
                    .filter((item: any) => !productNames.has(item.name.trim().toLowerCase())) // Deduplicate
                    .map((item: any) => {
                        const cat = categoryMap.get(item.category_id);
                        return {
                            id: item.id,
                            name: item.name,
                            description: item.description,
                            base_price: item.price || 0, // Map price -> base_price
                            category: cat ? cat.name : 'General', // Resolve Category Name
                            category_slug: cat ? cat.slug : 'general',
                            is_available: true, // Assuming available if visible
                            is_visible: true,
                            active: true,
                            store_id: item.store_id,
                            image_url: item.image_url // Preserve image if needed
                        } as Product;
                    });

                // Combine and Sort
                const combined = [...enrichedProducts, ...mappedInventory].sort((a, b) =>
                    (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name)
                );

                setProducts(combined);

            } else {
                // Legacy / Direct access mode
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
                    .eq('is_active', true)
                    .order('name', { ascending: true });

                if (fetchError) throw fetchError;
                setProducts(data || []);
            }
        } catch (err) {
            console.error('Error in useProducts:', err);
            setError(err instanceof Error ? err.message : 'Error al cargar productos');
            // Fallback: Don't clear products if we fail, maybe show what we have? 
            // setProducts([]); // Safer to clear or keep partial? keeping cleared for now to reflect error state
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
