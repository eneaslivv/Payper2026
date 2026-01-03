import React from 'react';
import { Outlet, useLocation, useParams, useNavigate } from 'react-router-dom';
import { ClientProvider, useClient } from '../../contexts/ClientContext';
import BottomNav from './BottomNav';
import ActiveOrderWidget from './ActiveOrderWidget';

import { AuthPromptModal } from '../AuthPromptModal';

const ClientLayoutContent: React.FC = () => {
    const { store, loadingStore, error, hasActiveOrder, isHubOpen, setIsHubOpen, showAuthModal, setShowAuthModal, activeOrderId, orderStatus, activeOrders, tableLabel } = useClient();
    const navigate = useNavigate();
    const location = useLocation();

    // Get accent color from store theme
    const accentColor = store?.menu_theme?.accentColor || '#4ADE80';
    const theme = store?.menu_theme || { accentColor };

    // Hide nav logic - Updated for new routes
    const isHiddenRoute = () => {
        const path = location.pathname;
        if (path.includes('/checkout')) return true;
        if (path.includes('/tracking')) return true;
        if (path.includes('/auth')) return true;
        if (path.includes('/cart')) return true;
        if (path.includes('/product/')) return true;
        return false;
    };

    if (loadingStore) return (
        <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-black">
            <div className="flex items-center gap-2 animate-pulse opacity-50">
                <div className="size-2 rounded-full" style={{ backgroundColor: accentColor }} />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50" style={{ color: accentColor }}>Cargando...</span>
            </div>
        </div>
    );

    if (error || !store) return (
        <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-black gap-4 p-8 text-center">
            <span className="material-symbols-outlined text-4xl text-red-500">error_outline</span>
            <p className="text-white font-bold">{error || 'Tienda no encontrada'}</p>
        </div>
    );

    return (
        <div
            className="relative h-[100dvh] w-full max-w-md mx-auto bg-black shadow-2xl overflow-hidden flex flex-col font-display"
            style={{ '--accent-color': accentColor } as React.CSSProperties}
        >
            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto no-scrollbar pb-24 relative z-10">
                <Outlet />
            </div>

            {/* Overlays */}
            {hasActiveOrder && !location.pathname.includes('/tracking') && !location.pathname.includes('/order/') && !location.pathname.includes('/auth') && (
                <ActiveOrderWidget
                    hasActiveOrder={hasActiveOrder}
                    status={orderStatus || 'received'}
                    isHubOpen={isHubOpen}
                    setIsHubOpen={setIsHubOpen}
                    tableNumber={tableLabel}
                    accentColor={accentColor}
                    activeOrderId={activeOrderId}
                    activeOrders={activeOrders}
                />
            )}

            {!isHiddenRoute() && <BottomNav activePath={location.pathname} accentColor={accentColor} />}

            <AuthPromptModal
                isOpen={showAuthModal}
                onClose={() => setShowAuthModal(false)}
                onRegister={() => {
                    setShowAuthModal(false);
                    navigate(`/m/${store.slug}/auth`);
                }}
                theme={theme as any}
            />
        </div>
    );
}

const ClientLayout: React.FC = () => {
    return (
        <ClientProvider>
            <ClientLayoutContent />
        </ClientProvider>
    );
};

export default ClientLayout;
