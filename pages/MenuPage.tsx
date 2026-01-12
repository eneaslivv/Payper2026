import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../hooks/useStore';
import { useProducts } from '../hooks/useProducts';
import { useCreateOrder } from '../hooks/useCreateOrder';
import { useCheckout } from '../hooks/useCheckout';
import { useAuth } from '../contexts/AuthContext'; // Import Auth
import { PaymentCapabilityBadge } from '../components/PaymentCapabilityBadge';
import { CheckoutButton } from '../components/CheckoutButton';
import { MenuRenderer } from '../components/MenuRenderer';
import { AuthPromptModal } from '../components/AuthPromptModal'; // Import Modal
import { LoyaltyClientView } from '../components/LoyaltyClientView'; // Import Loyalty View
import type { Product, CheckoutItem } from '../types/payment';

interface CartItem {
    product: Product;
    quantity: number;
}

export function MenuPage() {
    const { storeSlug = '' } = useParams<{ storeSlug: string }>();
    const navigate = useNavigate();
    const { user } = useAuth(); // Get user status

    // Obtener datos de la tienda
    const { store, isLoading: storeLoading, error: storeError, canProcessPayments } = useStore({
        slug: storeSlug
    });

    // Obtener productos
    const { products, isLoading: productsLoading, error: productsError } = useProducts({
        storeId: store?.id || '',
        source: 'inventory_items', // Change from 'products' to 'inventory_items' to match MenuDesign
    });

    // Estado del carrito y UI
    const [cart, setCart] = useState<CartItem[]>([]);
    const [tableNumber, setTableNumber] = useState('');
    const [activeTab, setActiveTab] = useState<'menu' | 'club' | 'profile'>('menu');
    const [showAuthPrompt, setShowAuthPrompt] = useState(false);

    // Hooks de orden y checkout
    const { createOrder, isCreating } = useCreateOrder();
    const { processPayment, isProcessing } = useCheckout();

    // Calcular total
    const cartTotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + (item.product.base_price * item.quantity), 0);
    }, [cart]);

    // Agregar al carrito
    const addToCart = (product: Product) => {
        setCart(prev => {
            const existing = prev.find(item => item.product.id === product.id);
            if (existing) {
                return prev.map(item =>
                    item.product.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...prev, { product, quantity: 1 }];
        });
    };

    // Quitar del carrito
    const removeFromCart = (productId: string) => {
        setCart(prev => prev.filter(item => item.product.id !== productId));
    };

    // Actualizar cantidad
    const updateQuantity = (productId: string, quantity: number) => {
        if (quantity <= 0) {
            removeFromCart(productId);
            return;
        }
        setCart(prev =>
            prev.map(item =>
                item.product.id === productId ? { ...item, quantity } : item
            )
        );
    };

    // Procesar checkout
    const handleCheckout = async () => {
        if (!store || cart.length === 0) return;

        // 1. Crear la orden primero
        const order = await createOrder({
            storeId: store.id,
            items: cart.map(item => ({
                productId: item.product.id,
                name: item.product.name,
                quantity: item.quantity,
                unitPrice: item.product.base_price,
            })),
            channel: tableNumber ? 'table' : 'qr',
            tableNumber: tableNumber || undefined,
        });

        if (!order) {
            alert('Error al crear la orden');
            return;
        }

        // 2. Procesar el pago
        const checkoutItems: CheckoutItem[] = cart.map(item => ({
            title: item.product.name,
            quantity: item.quantity,
            unit_price: item.product.base_price,
            description: item.product.description || undefined,
        }));

        await processPayment({
            storeId: store.id,
            items: checkoutItems,
            externalReference: order.id,
            backUrls: {
                success: `${window.location.origin}/orden/${order.id}/confirmado`,
                failure: `${window.location.origin}/orden/${order.id}/error`,
                pending: `${window.location.origin}/orden/${order.id}/pendiente`,
            },
        });
    };

    // --- NAVIGATION HANDLER ---
    const handleNavClick = (tab: 'menu' | 'club' | 'profile') => {
        if (tab === 'menu') {
            setActiveTab('menu');
            return;
        }

        // Protected Tabs logic
        if (!user) {
            // Trigger Auth Prompt for guests
            setShowAuthPrompt(true);
            // Optionally set active tab visually if you want, but better to stay on menu until authed?
            // The image shows "CREA TU PERFIL" modal, implying we intercepted the navigation.
            return;
        }

        // Check if CLUB is active (assuming club feature flag or similar? for now just allow)
        setActiveTab(tab);
        if (tab === 'profile') {
            navigate('/profile'); // Or wherever the profile page is
        }
    };

    // --- THEME ENGINE ---
    const theme = useMemo(() => {
        const defaults = {
            accentColor: '#4ADE80',
            backgroundColor: '#0D0F0D',
            surfaceColor: '#141714',
            textColor: '#FFFFFF',
            borderRadius: 'xl',
            fontStyle: 'sans',
            cardStyle: 'solid',
            layoutMode: 'grid',
            columns: 1,
            headerImage: '',
            headerOverlay: 0.5,
            showImages: true,
            showPrices: true,
            showDescription: true,
            showAddButton: true,
            showBadges: true,
            headerAlignment: 'left'
        };
        return { ...defaults, ...(store?.menu_theme || {}) };
    }, [store]);

    const getRadiusClass = (r: string) => {
        switch (r) {
            case 'none': return 'rounded-none';
            case 'sm': return 'rounded-sm';
            case 'md': return 'rounded-md';
            case 'full': return 'rounded-[2rem]'; // Special for "full" look in design
            default: return 'rounded-xl';
        }
    };

    const radiusClass = getRadiusClass(theme.borderRadius);
    const fontClass = theme.fontStyle === 'serif' ? 'font-serif' : theme.fontStyle === 'mono' ? 'font-mono' : 'font-sans';

    // Loading state
    if (storeLoading || productsLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0D0F0D] text-white">
                <div className="w-10 h-10 border-4 border-[#4ADE80]/30 border-t-[#4ADE80] rounded-full animate-spin mb-4" />
                <p className="text-xs font-bold uppercase tracking-widest text-white/50">Cargando Experiencia...</p>
            </div>
        );
    }

    // Error state
    if (storeError || productsError || !store) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#0D0F0D] text-red-500 p-8 text-center">
                <span className="material-symbols-outlined text-4xl mb-4">error</span>
                <h2 className="text-xl font-bold uppercase mb-2">Error de Carga</h2>
                <p className="text-sm opacity-70">{storeError || productsError || 'Tienda no encontrada'}</p>
            </div>
        );
    }

    return (
        <div
            className={`min-h-screen transition-colors duration-500 pb-20 ${fontClass}`} // Adjusted pb-24 -> pb-20
            style={{
                backgroundColor: theme.backgroundColor,
                color: theme.textColor,
            }}
        >
            {/* MENU RENDERER */}
            {/* We force 'menu' view locally, as profile/club would be separate pages or overlays */}
            {/* CONTENT AREA: SWITCH VIEWS */}
            {activeTab === 'menu' && (
                <MenuRenderer
                    theme={theme}
                    products={products as any[]}
                    storeName={store.name}
                    logoUrl={store.logo_url}
                    mpNickname={store.mp_nickname}
                    canProcessPayments={canProcessPayments}
                    onAddToCart={addToCart}
                    isGuest={!user}
                />
            )}

            {activeTab === 'club' && (
                <LoyaltyClientView
                    theme={theme}
                    store={store}
                    user={user}
                />
            )}

            {/* EXPLICIT SPACER FOR SCROLL CLEARANCE */}
            <div className="h-64 w-full shrink-0" />

            {/* CART FLOATING BAR */}
            {cart.length > 0 && (
                <div className="fixed bottom-16 left-0 right-0 p-4 pt-12 z-40 pointer-events-none"> {/* bottom-16 to sit above nav */}
                    <div className="p-4 bg-gradient-to-t from-black/80 to-transparent absolute inset-0 -z-10" />
                    <div
                        className="max-w-2xl mx-auto backdrop-blur-xl border border-white/10 p-4 shadow-2xl animate-in slide-in-from-bottom-5 pointer-events-auto"
                        style={{
                            backgroundColor: `${theme.surfaceColor}E6`,
                            borderRadius: '1.5rem'
                        }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-black uppercase tracking-widest opacity-50">Tu Pedido ({cart.reduce((a, b) => a + b.quantity, 0)})</span>
                            <span className="text-lg font-black" style={{ color: theme.accentColor }}>${cartTotal.toLocaleString('es-AR')}</span>
                        </div>

                        <div className="flex gap-2 overflow-x-auto pb-4 mb-2 no-scrollbar">
                            {cart.map(item => (
                                <div key={item.product.id} className="shrink-0 flex items-center gap-3 bg-black/20 p-2 pr-4 rounded-full border border-white/5">
                                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold">
                                        {item.quantity}x
                                    </div>
                                    <span className="text-xs font-bold truncate max-w-[100px]">{item.product.name}</span>
                                    <button onClick={() => removeFromCart(item.product.id)} className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center hover:bg-red-500/20 hover:text-red-500 transition-colors">
                                        <span className="material-symbols-outlined text-[10px]">close</span>
                                    </button>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={handleCheckout}
                            disabled={isProcessing || isCreating}
                            className="w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                            style={{
                                backgroundColor: theme.accentColor,
                                color: '#000000',
                                boxShadow: `0 8px 20px -5px ${theme.accentColor}40`
                            }}
                        >
                            {isProcessing ? 'Procesando...' : `Confirmar Pedido • $${cartTotal.toLocaleString('es-AR')}`}
                        </button>
                    </div>
                </div>
            )}

            {/* BOTTOM NAVIGATION (Fixed) */}
            <div
                className="fixed bottom-0 left-0 right-0 h-16 border-t flex items-center justify-around px-4 z-50 backdrop-blur-md"
                style={{ backgroundColor: `${theme.backgroundColor}F0`, borderColor: `${theme.textColor}08` }}
            >
                {[
                    { id: 'menu', icon: 'restaurant_menu', label: 'MENÚ' },
                    { id: 'club', icon: 'stars', label: 'CLUB' },
                    { id: 'profile', icon: 'person', label: 'PERFIL' }
                ].map(nav => {
                    const isActive = activeTab === nav.id;
                    return (
                        <button
                            key={nav.id}
                            onClick={() => handleNavClick(nav.id as any)}
                            className="flex flex-col items-center gap-0.5"
                        >
                            <span
                                className={`material-symbols-outlined text-[24px] transition-colors ${isActive ? 'fill-icon' : ''}`}
                                style={{ color: isActive ? theme.accentColor : `${theme.textColor}40` }}
                            >
                                {nav.icon}
                            </span>
                            <span
                                className="text-[8px] font-black uppercase tracking-widest transition-colors"
                                style={{ color: isActive ? theme.accentColor : `${theme.textColor}40` }}
                            >
                                {nav.label}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* AUTH PROMPT MODAL */}
            <AuthPromptModal
                isOpen={showAuthPrompt}
                onClose={() => setShowAuthPrompt(false)}
                onRegister={() => navigate(`/m/${storeSlug}/auth`)}
                theme={theme}
            />

            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                .fill-icon { font-variation-settings: 'FILL' 1; }
            `}</style>
        </div>
    );
}
