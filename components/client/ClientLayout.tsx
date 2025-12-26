import React from 'react';
import { Outlet, useLocation, useParams } from 'react-router-dom';
import { ClientProvider, useClient } from '../../contexts/ClientContext';
import BottomNav from './BottomNav';
import ActiveOrderWidget from './ActiveOrderWidget';

const ClientLayoutContent: React.FC = () => {
    const { store, loadingStore, error, hasActiveOrder, isHubOpen, setIsHubOpen } = useClient();
    const location = useLocation();

    // Get accent color from store theme
    const accentColor = store?.menu_theme?.accentColor || '#4ADE80';

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
        <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-black gap-4">
            <div
                className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: `${accentColor}33`, borderTopColor: accentColor }}
            />
            <p
                className="font-mono text-xs uppercase tracking-widest animate-pulse"
                style={{ color: accentColor }}
            >
                Cargando Sistema...
            </p>
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
            {hasActiveOrder && !location.pathname.includes('/tracking') && (
                <ActiveOrderWidget
                    hasActiveOrder={hasActiveOrder}
                    status={'received'}
                    isHubOpen={isHubOpen}
                    setIsHubOpen={setIsHubOpen}
                    tableNumber="05"
                />
            )}

            {!isHiddenRoute() && <BottomNav activePath={location.pathname} accentColor={accentColor} />}
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
