import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CartItem, MenuItem, UserProfile, OrderStatus } from '../components/client/types';
import { INITIAL_USER } from '../components/client/constants';

interface Store {
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
    theme_color?: string; // Hex
}

interface ClientContextType {
    store: Store | null;
    loadingStore: boolean;
    error: string | null;
    products: MenuItem[];
    loadingProducts: boolean;
    cart: CartItem[];
    addToCart: (item: MenuItem, quantity: number, customs: string[], size: string, notes: string) => void;
    removeFromCart: (itemId: string, size?: string) => void;
    updateQuantity: (itemId: string, delta: number, size: string) => void;
    clearCart: () => void;
    user: UserProfile | null;
    setUser: (u: UserProfile | null) => void;
    hasActiveOrder: boolean;
    setHasActiveOrder: (v: boolean) => void;
    isHubOpen: boolean;
    setIsHubOpen: (v: boolean) => void;
    isRedeemingPoints: boolean;
    setIsRedeemingPoints: (v: boolean) => void;
    orderStatus: OrderStatus;
    setOrderStatus: (status: OrderStatus) => void;
}

const ClientContext = createContext<ClientContextType | undefined>(undefined);

export const ClientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { slug } = useParams<{ slug: string }>();
    const [store, setStore] = useState<Store | null>(null);
    const [loadingStore, setLoadingStore] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [products, setProducts] = useState<MenuItem[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    const [cart, setCart] = useState<CartItem[]>([]);
    const [user, setUser] = useState<UserProfile | null>(null); // Start null, auth page handles login
    const [hasActiveOrder, setHasActiveOrder] = useState(false);
    const [isHubOpen, setIsHubOpen] = useState(false);
    const [isRedeemingPoints, setIsRedeemingPoints] = useState(false);
    const [orderStatus, setOrderStatus] = useState<OrderStatus>('received');

    // Fetch Store by Slug
    // ... rest of code
    useEffect(() => {
        if (!slug) return;
        const fetchStore = async () => {
            setLoadingStore(true);
            try {
                const { data, error } = await supabase
                    .from('stores')
                    .select('*')
                    .eq('slug', slug)
                    .maybeSingle();

                if (error) throw error;
                if (!data) throw new Error('Tienda no encontrada');

                setStore(data);
            } catch (err: any) {
                console.error('Error fetching store:', err);
                setError(err.message);
            } finally {
                setLoadingStore(false);
            }
        };
        fetchStore();
    }, [slug]);

    // Fetch Products when Store is set
    useEffect(() => {
        if (!store?.id) return;
        const fetchProducts = async () => {
            setLoadingProducts(true);
            try {
                // Assuming simplified product schema mapping or usage of *
                const { data, error } = await supabase
                    .from('products')
                    .select('*')
                    .eq('store_id', store.id)
                    .eq('is_archived', false); // Assuming available flag

                if (error) throw error;

                // Map DB products to MenuItem interface if necessary
                // For now assuming direct mapping or compatible fields
                setProducts(data as any || []);
            } catch (err) {
                console.error(err);
            } finally {
                setLoadingProducts(false);
            }
        };
        fetchProducts();
    }, [store?.id]);

    const addToCart = (item: MenuItem, quantity: number, customs: string[], size: string, notes: string) => {
        setCart(prev => [...prev, { ...item, quantity, customizations: customs, size, notes }]);
    };

    const updateQuantity = (itemId: string, delta: number, size: string) => {
        setCart(prev => prev.map(item => {
            if (item.id === itemId && item.size === size) {
                return { ...item, quantity: Math.max(1, item.quantity + delta) };
            }
            return item;
        }));
    };

    const removeFromCart = (itemId: string, size?: string) => {
        setCart(prev => prev.filter(i => !(i.id === itemId && i.size === size)));
    };

    const clearCart = () => setCart([]);

    return (
        <ClientContext.Provider value={{
            store,
            loadingStore,
            error,
            products,
            loadingProducts,
            cart,
            addToCart,
            removeFromCart,
            updateQuantity,
            clearCart,
            user,
            setUser,
            hasActiveOrder,
            setHasActiveOrder,
            isHubOpen,
            setIsHubOpen,
            isRedeemingPoints,
            setIsRedeemingPoints,
            orderStatus,
            setOrderStatus
        }}>
            {children}
        </ClientContext.Provider>
    );
};

export const useClient = () => {
    const context = useContext(ClientContext);
    if (context === undefined) {
        throw new Error('useClient must be used within a ClientProvider');
    }
    return context;
};
