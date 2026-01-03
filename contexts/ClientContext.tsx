import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CartItem, MenuItem, UserProfile, OrderStatus } from '../components/client/types';
import { MenuLogic, Store } from '../types'; // Import from global types
import { INITIAL_USER } from '../components/client/constants';
import { getQRContext, clearQRContext, QRContext } from '../lib/qrContext';

// Local interfaces removed in favor of global types

interface ClientContextType {
    store: Store | null;
    loadingStore: boolean;
    error: string | null;
    products: MenuItem[];
    categories: string[];
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
    showAuthModal: boolean;
    setShowAuthModal: (v: boolean) => void;
    activeOrderId: string | null;
    setActiveOrderId: (id: string | null) => void;
    activeOrders: any[];
    // Config Helpers
    isStoreOpen: () => boolean;
    getClosedMessage: () => string;
    isFeatureEnabled: (feature: 'wallet' | 'loyalty' | 'guestMode') => boolean;
    isChannelEnabled: (channel: 'dineIn' | 'takeaway' | 'delivery') => boolean;
    isOrderingAllowed: (channel: 'dineIn' | 'takeaway' | 'delivery') => boolean;
    getMenuRule: (rule: 'hideOutofStock' | 'showCalories') => boolean;
    // QR Context
    qrContext: QRContext | null;
    orderChannel: 'table' | 'qr' | 'takeaway' | 'delivery' | null;
    tableLabel: string | null;
    serviceMode: 'counter' | 'table' | 'club';
    // Session System
    sessionId: string | null;
    sessionValid: boolean;
    showSessionSelector: boolean;
    setShowSessionSelector: (v: boolean) => void;
    onSessionCreated: (sessionId: string, sessionType: string, label: string | null) => void;
    // Dynamic Menu System
    menuId: string | null;
}


const ClientContext = createContext<ClientContextType | undefined>(undefined);

export const ClientProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { slug } = useParams<{ slug: string }>();
    const [store, setStore] = useState<Store | null>(null);
    const [loadingStore, setLoadingStore] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [products, setProducts] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [loadingProducts, setLoadingProducts] = useState(false);

    const [cart, setCart] = useState<CartItem[]>([]);
    const [user, setUser] = useState<UserProfile | null>(null);
    const [hasActiveOrder, setHasActiveOrder] = useState(false);
    const [isHubOpen, setIsHubOpen] = useState(false);
    const [isRedeemingPoints, setIsRedeemingPoints] = useState(false);
    const [orderStatus, setOrderStatus] = useState<OrderStatus>('received');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
    const [activeOrders, setActiveOrders] = useState<any[]>([]);

    // QR Context State
    const [qrContext, setQRContextState] = useState<QRContext | null>(null);
    const [orderChannel, setOrderChannel] = useState<'table' | 'qr' | 'takeaway' | 'delivery' | null>(null);

    // Session System State
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [sessionValid, setSessionValid] = useState(false);
    const [showSessionSelector, setShowSessionSelector] = useState(false);
    const [tableLabel, setTableLabel] = useState<string | null>(null);

    // Dynamic Menu System State
    const [menuId, setMenuId] = useState<string | null>(null);

    // Auth Listener & User Data Fetching
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (session?.user) {
                fetchUserProfile(session.user.id);
            } else {
                setUser(null);
            }
        });

        // Initial check
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (user) fetchUserProfile(user.id);
        });

        return () => subscription.unsubscribe();
    }, [store?.id]);

    const fetchUserProfile = async (userId: string) => {
        if (!store?.id) return;

        try {
            // 1. Fetch from 'clients'
            let clientDataWrapper = await supabase
                .from('clients')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (!clientDataWrapper.data) {
                // Check if user has a STAFF profile - if so, don't auto-create client profile
                const { data: staffProfile } = await supabase
                    .from('profiles')
                    .select('id, role')
                    .eq('id', userId)
                    .maybeSingle();

                if (staffProfile) {
                    // User is a staff member, don't create client profile
                    console.log('[ClientContext] User is staff, skipping client auto-creation');
                    setUser(null); // Clear user state for client context
                    return;
                }

                // Auto-create client for any non-staff user accessing the menu
                // This is more permissive than before - we create clients for anyone who
                // is not staff, regardless of their metadata role
                const { data: userData } = await supabase.auth.getUser();
                if (!userData.user) throw new Error('Usuario no autenticado');

                console.log('[ClientContext] Auto-creating client record for user:', store.id);

                const newProfile = {
                    id: userId,
                    email: userData.user.email || '',
                    name: userData.user.user_metadata?.full_name || (userData.user.email || '').split('@')[0],
                    store_id: store.id,
                    loyalty_points: 0
                };

                const { error: createError } = await supabase
                    .from('clients')
                    .insert(newProfile);

                if (createError && createError.code !== '23505') {
                    console.error("[ClientContext] Error creating client:", createError);
                }

                // Final attempt to fetch
                clientDataWrapper = await supabase
                    .from('clients')
                    .select('*')
                    .eq('id', userId)
                    .single();
            }

            const clientData = clientDataWrapper.data || {
                id: userId,
                name: user?.user_metadata?.full_name || 'Cliente Nuevo',
                email: user?.email || '',
                phone: user?.user_metadata?.phone || '',
                points_balance: 0,
                wallet_balance: 0,
                store_id: store.id,
                created_at: new Date().toISOString()
            };

            // 2. Wallet balance now comes directly from clients.wallet_balance
            // (No need to query wallets table - admin loads to clients.wallet_balance)

            // 3. Fetch Vouchers
            const { data: vouchersData } = await supabase
                .from('loyalty_vouchers')
                .select('*')
                .eq('client_id', userId);

            // 4. Fetch Order History with Items
            const { data: ordersData } = await supabase
                .from('orders')
                .select('*, order_items(*)')
                .eq('store_id', store.id)
                .eq('client_id', userId) // Use ID for reliable matching
                .order('created_at', { ascending: false });

            // 4.5 Check for Active OrderS (Plural)
            const activeOrdersFound = ordersData?.filter(o =>
                o.status === 'received' ||
                o.status === 'pending' ||
                o.status === 'preparing' ||
                o.status === 'ready'
            ) || [];

            setActiveOrders(activeOrdersFound);

            if (activeOrdersFound.length > 0) {
                console.log('[ClientContext] Found active orders:', activeOrdersFound.length);
                setHasActiveOrder(true);
                // Default to first one or keep existing selection if valid
                const currentStillActive = activeOrdersFound.find(o => o.id === activeOrderId);
                const primaryOrder = currentStillActive || activeOrdersFound[0];

                setOrderStatus(primaryOrder.status as OrderStatus);
                setActiveOrderId(primaryOrder.id);
            } else {
                setHasActiveOrder(false);
                setActiveOrderId(null);
            }

            // 5. Map to UserProfile
            const mappedUser: UserProfile = {
                id: clientData.id,
                name: clientData.name || 'Invitado',
                email: clientData.email || '',
                // Phone not currently in clients table
                points: clientData.points_balance || 0,
                balance: clientData.wallet_balance || 0,
                status: (clientData.points_balance || 0) < 500 ? 'Bronce' : (clientData.points_balance || 0) < 1200 ? 'Plata' : 'Oro',
                vouchers: (vouchersData || []).map((v: any) => ({
                    id: v.id,
                    name: 'Cupón de Regalo', // Should be linked to rewards table
                    expiry: v.expires_at ? new Date(v.expires_at).toLocaleDateString() : 'Sin expiración',
                    type: v.is_used ? 'redemption' : 'gift'
                })),
                avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${clientData.id}`,
                onboardingCompleted: true,
                orderHistory: (ordersData || []).map(o => ({
                    id: o.id.slice(0, 8).toUpperCase(),
                    date: new Date(o.created_at).toLocaleDateString(),
                    items: (o.order_items || []).map((oi: any) => `${oi.quantity}x ${oi.name}`).join(', ') || 'Pedido sin detalles',
                    total: o.total_amount,
                    // Points now come from loyalty_transactions ledger, not calculated here
                    pointsEarned: undefined
                }))
            };

            setUser(mappedUser);
        } catch (err) {
            console.error('Error fetching user profile:', err);
        }
    };
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

                if (data && (data as any).menu_theme && typeof (data as any).menu_theme === 'string') {
                    try {
                        (data as any).menu_theme = JSON.parse((data as any).menu_theme);
                    } catch (e) {
                        console.error('Error parsing menu_theme:', e);
                    }
                }

                setStore(data as any);
            } catch (err: any) {
                console.error('Error fetching store:', err);
                setError(err.message);
            } finally {
                setLoadingStore(false);
            }
        };
        fetchStore();
    }, [slug]);

    // Load QR Context and Validate Session when store is ready
    useEffect(() => {
        if (!store?.id || !slug) return;

        const validateSession = async () => {
            // 1. Check for stored session
            const storedSessionId = localStorage.getItem('client_session_id');

            if (storedSessionId) {
                // Validate with DB
                const { data: result, error } = await (supabase.rpc as any)('get_active_session', {
                    p_session_id: storedSessionId
                });

                if (result?.success && result?.session) {
                    // Session valid
                    setSessionId(storedSessionId);
                    setSessionValid(true);

                    // Use session data for channel/label
                    const sess = result.session;
                    if (sess.session_type === 'table') {
                        setOrderChannel('table');
                    } else if (sess.session_type === 'bar') {
                        setOrderChannel('qr');
                    } else if (sess.session_type === 'pickup') {
                        setOrderChannel('takeaway');
                    }

                    console.log('[Session] Valid session loaded:', storedSessionId);
                    return true;
                } else {
                    // Session expired or invalid
                    console.log('[Session] Session expired or invalid, clearing');
                    localStorage.removeItem('client_session_id');
                    setSessionId(null);
                    setSessionValid(false);
                }
            }
            return false;
        };

        const loadContext = async () => {
            const ctx = getQRContext();

            if (ctx && ctx.store_slug === slug) {
                // Context matches this store - use it
                setQRContextState(ctx);
                setOrderChannel(ctx.channel);
                setTableLabel(ctx.node_label);
                console.log('[QR Context] Loaded:', ctx.channel, ctx.node_label);

                // Also validate session
                await validateSession();
            } else if (ctx && ctx.store_slug !== slug) {
                // Context is for different store - clear it
                console.log('[QR Context] Wrong store, clearing');
                clearQRContext();
                localStorage.removeItem('client_session_id');
                setQRContextState(null);
                setOrderChannel(null);
                setTableLabel(null);
                setSessionId(null);
                setSessionValid(false);
            } else {
                // No QR context - check if we have a valid session
                const hasValidSession = await validateSession();

                // If no valid session and store is in table mode, show selector
                // (Only if service_mode requires it - counter mode doesn't need session)
                if (!hasValidSession && store?.service_mode === 'table') {
                    console.log('[Session] No valid session, will prompt for context');
                    // Don't auto-show - let the checkout page handle it
                }
            }
        };

        loadContext();
    }, [store?.id, slug]);

    // Fetch Categories and Products
    useEffect(() => {
        if (!store?.id) return;

        const fetchData = async () => {
            setLoadingProducts(true);
            try {
                // 1. Fetch Categories
                const { data: catsData, error: catsError } = await (supabase
                    .from('categories' as any)
                    .select('id, name')
                    .eq('store_id', store.id));

                if (catsError) console.error('[ClientContext] Error fetching categories:', catsError);

                const dbCategories = catsData || [];
                console.log('[ClientContext] Categories fetched:', dbCategories.length, 'items');
                const categoryMap: Record<string, string> = {};
                dbCategories.forEach((c: any) => {
                    categoryMap[c.id] = c.name;
                });

                // 2. DYNAMIC MENU RESOLUTION
                // Determine session context for menu resolution
                const sessionType = qrContext?.node_type || orderChannel || 'generic';
                const tableId = qrContext?.node_id || null;

                // Call resolve_menu RPC
                const { data: resolvedMenuId, error: menuError } = await (supabase.rpc as any)('resolve_menu', {
                    p_store_id: store.id,
                    p_session_type: sessionType,
                    p_table_id: tableId,
                    p_bar_id: null
                });

                if (menuError) {
                    console.error('[ClientContext] Error resolving menu:', menuError);
                    // Fallback: load all products directly (backward compatibility)
                }

                if (resolvedMenuId) {
                    console.log('[ClientContext] Resolved menu:', resolvedMenuId, 'for context:', sessionType);
                    setMenuId(resolvedMenuId);

                    // Fetch products from the resolved menu
                    const { data: menuProducts, error: productsError } = await (supabase.rpc as any)('get_menu_products', {
                        p_menu_id: resolvedMenuId
                    });

                    if (productsError) {
                        console.error('[ClientContext] Error fetching menu products:', productsError);
                    }

                    if (menuProducts && menuProducts.length > 0) {
                        console.log('[ClientContext] Menu products loaded:', menuProducts.length);

                        // Map menu products to MenuItem interface
                        const mappedProducts: MenuItem[] = menuProducts.map((item: any) => ({
                            id: item.product_id,
                            name: item.name,
                            description: item.description || '',
                            price: item.effective_price || item.base_price || 0,
                            image: 'https://images.unsplash.com/photo-1580828343064-fde4fc206bc6?auto=format&fit=crop&q=80&w=200',
                            category: item.category || 'General',
                            isPopular: false,
                            isOutOfStock: !item.is_available,
                            variants: [],
                            addons: [],
                            item_type: 'sellable' as const,
                        }));

                        setProducts(mappedProducts);
                    } else {
                        // Fallback: menu exists but has no products
                        console.warn('[ClientContext] Menu has no products, loading all inventory');
                        await loadAllProducts();
                    }
                } else {
                    // No menu resolved, load all products (backward compatibility)
                    console.warn('[ClientContext] No menu resolved, loading all inventory');
                    await loadAllProducts();
                }

                // Helper: Load all products directly (fallback)
                async function loadAllProducts() {
                    const { data, error } = await (supabase.from('inventory_items') as any)
                        .select('*')
                        .eq('store_id', store.id)
                        .order('name', { ascending: true });

                    if (error) throw error;

                    const mappedProducts: MenuItem[] = (data || []).map((item: any) => {
                        const catName = item.category_id ? categoryMap[item.category_id] : (item.category || 'General');
                        return {
                            id: item.id,
                            name: item.name,
                            description: item.description || '',
                            price: item.price || 0,
                            image: item.image_url || 'https://images.unsplash.com/photo-1580828343064-fde4fc206bc6?auto=format&fit=crop&q=80&w=200',
                            category: catName,
                            isPopular: item.is_popular || false,
                            isOutOfStock: (item.current_stock !== undefined && item.current_stock <= 0) || false,
                            variants: item.variants || [],
                            addons: item.addons || [],
                            item_type: (item.cost > 0 || item.price > 0) ? 'sellable' : 'ingredient',
                        };
                    });
                    setProducts(mappedProducts);
                }

                // Set categories: Filter empty names and normalize
                if (dbCategories.length > 0) {
                    const validCats = dbCategories
                        .filter((c: any) => c.name && c.name.trim() !== '')
                        .map((c: any) => ({ id: c.id, name: c.name }));
                    setCategories([{ id: 'all', name: 'Todos' }, ...validCats]);
                }
                // Note: category fallback from products is handled separately if needed

            } catch (err) {
                console.error('Error fetching data:', err);
            } finally {
                setLoadingProducts(false);
            }
        };
        fetchData();
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

    // --- LOGIC HELPERS ---

    const getLogic = (): MenuLogic | null => {
        return store?.menu_logic || null;
    };

    const isStoreOpen = (): boolean => {
        const logic = getLogic();
        // Default to OPEN if no logic defined (conservative for business continuity)
        // But if logic exists, respect the master switch
        if (!logic) return true;
        // Check legacy flat structure if migration failed or pending
        if ((logic as any).is_dining_open !== undefined) return true; // Legacy fallback

        return logic.operation?.isOpen ?? true;
    };

    const getClosedMessage = (): string => {
        const logic = getLogic();
        return logic?.operation?.messageClosed || 'Cerrado por el momento';
    };

    const isFeatureEnabled = (feature: 'wallet' | 'loyalty' | 'guestMode'): boolean => {
        const logic = getLogic();
        if (!logic) return false; // Default OFF for advanced features if no config

        // Handle Legacy
        if ((logic as any).operation === undefined) return false;

        switch (feature) {
            case 'wallet': return logic.features?.wallet?.allowPayment ?? false;
            case 'loyalty': return logic.features?.loyalty?.enabled ?? true; // Default ON to restore visibility
            case 'guestMode': return logic.features?.guestMode?.enabled ?? true;
            default: return false;
        }
    };

    const isChannelEnabled = (channel: 'dineIn' | 'takeaway' | 'delivery'): boolean => {
        const logic = getLogic();
        if (!logic) return true; // Default ON for basic channels

        // Handle Legacy
        if ((logic as any).operation === undefined) {
            const legacy = logic as any;
            if (channel === 'dineIn') return legacy.is_dining_open ?? true;
            if (channel === 'takeaway') return legacy.is_takeaway_open ?? true;
            if (channel === 'delivery') return legacy.is_delivery_open ?? true;
            return true;
        }

        switch (channel) {
            case 'dineIn': return logic.channels?.dineIn?.enabled ?? true;
            case 'takeaway': return logic.channels?.takeaway?.enabled ?? true;
            case 'delivery': return logic.channels?.delivery?.enabled ?? true;
            default: return true;
        }
    };

    const isOrderingAllowed = (channel: 'dineIn' | 'takeaway' | 'delivery'): boolean => {
        const logic = getLogic();
        if (!logic) return true;

        if ((logic as any).operation === undefined) {
            // Legacy
            if (channel === 'dineIn') return (logic as any).allowTableOrder ?? true;
            if (channel === 'takeaway') return (logic as any).allowTakeaway ?? true;
            return true;
        }

        switch (channel) {
            case 'dineIn': return logic.channels?.dineIn?.allowOrdering ?? true;
            // Takeaway/Delivery don't have explicit strict "allowOrdering" sub-flag in schema, usually enabled=open
            // But we can default to enabled check or always true if channel is open
            default: return true;
        }
    };

    const getMenuRule = (rule: 'hideOutofStock' | 'showCalories'): boolean => {
        const logic = getLogic();
        if (!logic) return false;

        // Handle Legacy (no rules existed)
        if ((logic as any).operation === undefined) return false;

        switch (rule) {
            case 'hideOutofStock': return logic.rules?.hideOutofStock ?? false;
            case 'showCalories': return logic.rules?.showCalories ?? false;
            default: return false;
        }
    };

    // Handler for when session is created manually (via SessionSelector)
    const onSessionCreated = (newSessionId: string, sessionType: string, label: string | null) => {
        setSessionId(newSessionId);
        setSessionValid(true);
        setShowSessionSelector(false);

        // Set channel based on session type
        if (sessionType === 'table') {
            setOrderChannel('table');
        } else if (sessionType === 'bar') {
            setOrderChannel('qr');
        } else if (sessionType === 'pickup') {
            setOrderChannel('takeaway');
        }

        if (label) {
            setTableLabel(label);
        }

        console.log('[Session] Created:', newSessionId, sessionType, label);
    };

    return (
        <ClientContext.Provider value={{
            store,
            loadingStore,
            error,
            products,
            categories,
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
            setOrderStatus,
            showAuthModal,
            setShowAuthModal,
            activeOrderId,
            setActiveOrderId,
            activeOrders,
            isStoreOpen,
            getClosedMessage,
            isFeatureEnabled,
            isChannelEnabled,
            isOrderingAllowed,
            getMenuRule,
            // QR Context
            qrContext,
            orderChannel,
            tableLabel,
            serviceMode: store?.service_mode || 'counter',
            // Session System
            sessionId,
            sessionValid,
            showSessionSelector,
            setShowSessionSelector,
            onSessionCreated,
            // Dynamic Menu System
            menuId,
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
