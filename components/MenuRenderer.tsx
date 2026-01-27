import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MenuTheme, InventoryItem, Product } from '../types';
import { PaymentCapabilityBadge } from './PaymentCapabilityBadge';
import { WalletTransferModal } from './WalletTransferModal';

// Helper to unify Product and InventoryItem for display
type DisplayItem = Partial<Product> & Partial<InventoryItem> & {
    id: string;
    name: string;
    description?: string;
    price?: number; // base_price or price
    base_price?: number;
    image?: string; // image or image_url
    image_url?: string;
};

interface MenuRendererProps {
    theme: MenuTheme;
    products: DisplayItem[];
    categories?: { id: string, name: string }[];
    storeName: string;
    logoUrl?: string;
    mpNickname?: string;
    canProcessPayments?: boolean;
    onAddToCart?: (item: any) => void;
    onItemClick?: (item: any) => void; // Added for navigation
    layoutOverride?: 'grid' | 'list';

    // Interactivity Props
    // Interactivity Props
    activeCategory: string;
    onCategoryChange: (category: string) => void;
    searchQuery?: string;
    onSearchChange?: (query: string) => void;
    allowOrdering?: boolean;
    serviceMode?: 'counter' | 'table' | 'club';
    tableLabel?: string | null;
    isGuest?: boolean;
    userBalance?: number;
}

export const MenuRenderer: React.FC<MenuRendererProps> = ({
    theme,
    products,
    categories = [],
    storeName,
    logoUrl,
    mpNickname,
    canProcessPayments = false,
    onAddToCart,
    onItemClick,
    layoutOverride,
    activeCategory,
    onCategoryChange,
    searchQuery = '',
    onSearchChange,
    allowOrdering = true,
    serviceMode,
    tableLabel,
    isGuest = true,
    userBalance
}) => {
    const [showTransferModal, setShowTransferModal] = useState(false);

    // Derived State
    const hasProducts = products.length > 0;

    // --- STYLE HELPERS ---
    const getRadiusClass = (r: string) => {
        switch (r) {
            case 'none': return 'rounded-none';
            case 'sm': return 'rounded-sm';
            case 'md': return 'rounded-md';
            case 'full': return 'rounded-[2rem]';
            default: return 'rounded-xl';
        }
    };

    const radiusClass = getRadiusClass(theme.borderRadius);
    const fontClass = theme.fontStyle === 'serif' ? 'font-serif' : theme.fontStyle === 'mono' ? 'font-mono' : 'font-sans';
    const activeLayout = layoutOverride || theme.layoutMode;

    const getPrice = (item: DisplayItem) => item.base_price || item.price || 0;
    const getImage = (item: DisplayItem) => item.image || item.image_url || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200';

    const showAdd = theme.showAddButton && allowOrdering;

    return (
        <div
            className={`w-full min-h-full flex flex-col transition-colors duration-500 ${fontClass}`}
            style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}
        >
            {/* HEADER HERO */}
            {theme.headerImage ? (
                <div className="relative w-full h-48 md:h-64 shrink-0 overflow-hidden">
                    <motion.img
                        initial={{ scale: 1.1 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        src={theme.headerImage}
                        alt="Cover"
                        className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div
                        className="absolute inset-0"
                        style={{
                            background: `linear-gradient(to bottom, ${theme.backgroundColor}${Math.round((theme.headerOverlay || 50) * 0.5).toString(16).padStart(2, '0')}, ${theme.backgroundColor})`,
                            opacity: 1
                        }}
                    />
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className={`absolute inset-0 p-6 flex flex-col justify-end ${theme.headerAlignment === 'center' ? 'items-center text-center' : 'items-start text-left'}`}
                    >
                        {(logoUrl || theme.logoUrl) && (
                            <img src={logoUrl || theme.logoUrl} className="w-16 h-16 rounded-xl object-contain bg-black/20 border-2 border-white/10 mb-4 shadow-xl" />
                        )}
                        <h1 className="text-3xl md:text-4xl font-black uppercase tracking-tighter leading-none mb-1 shadow-black drop-shadow-lg">
                            {(serviceMode === 'table' && tableLabel) ? (
                                <>
                                    MESA <span style={{ color: theme.accentColor }}>{tableLabel}</span>
                                </>
                            ) : storeName}
                        </h1>
                        {theme.showBadges && <PaymentCapabilityBadge canProcessPayments={canProcessPayments} mpNickname={mpNickname} />}
                    </motion.div>
                </div>
            ) : (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-6 pt-12 flex flex-col justify-end shrink-0 ${theme.headerAlignment === 'center' ? 'items-center text-center' : 'items-start text-left'}`}
                >
                    {(logoUrl || theme.logoUrl) && (
                        <motion.img
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 200, damping: 20 }}
                            src={logoUrl || theme.logoUrl}
                            className="w-16 h-16 rounded-xl object-contain bg-black/20 border-2 border-white/10 mb-4 shadow-xl"
                        />
                    )}
                    <h1 className="text-4xl font-black uppercase tracking-tighter leading-none mb-2" style={{ color: theme.textColor }}>
                        {(serviceMode === 'table' && tableLabel) ? (
                            <>
                                MESA <span style={{ color: theme.accentColor }}>{tableLabel}</span>
                            </>
                        ) : storeName}
                    </h1>
                    {theme.showBadges && <PaymentCapabilityBadge canProcessPayments={canProcessPayments} mpNickname={mpNickname} />}
                </motion.div>
            )}

            {/* SMART BANNER SYSTEM (Guest Promo vs Member Balance) */}
            {(isGuest || theme.showPromoBanner) ? (
                // OPTION A: PROMO BANNER (Always for Guest, Optional for Member)
                <div className="px-6 pt-6 mb-4">
                    <div
                        className={`relative group border ${radiusClass} p-7 overflow-hidden shadow-2xl transition-all hover:scale-[1.01]`}
                        style={{
                            backgroundColor: theme.cardStyle === 'glass' ? `${theme.accentColor}10` : theme.surfaceColor,
                            borderColor: `${theme.accentColor}20`
                        }}
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 blur-[50px] rounded-full -mr-16 -mt-16 pointer-events-none" style={{ backgroundColor: `${theme.accentColor}30` }} />
                        <div className="flex items-center justify-between relative z-10">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 mb-1">
                                    <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: theme.accentColor }} />
                                    <span className="text-[7px] font-black uppercase tracking-[0.3em] italic" style={{ color: `${theme.accentColor}CC` }}>Sin Filas</span>
                                </div>
                                <h3 className="text-[20px] font-black uppercase italic tracking-tighter leading-none" style={{ color: theme.textColor }}>Pide desde tu mesa</h3>
                                <p className="text-[10px] font-medium tracking-tight mt-1 max-w-[180px]" style={{ color: `${theme.textColor}4D` }}>
                                    Pedí desde acá o pedí sin fila
                                </p>
                            </div>
                            <div
                                className="w-14 h-14 rounded-full text-black flex items-center justify-center transform transition-transform group-hover:rotate-12"
                                style={{ backgroundColor: theme.accentColor, boxShadow: `0 10px 25px ${theme.accentColor}40` }}
                            >
                                <span className="material-symbols-outlined font-black text-[28px]">bolt</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                // OPTION B: MEMBER BALANCE (Only if logged in and Banner OFF)
                !isGuest && userBalance !== undefined && (
                    <div className="mb-6 mx-4 p-4 rounded-2xl border border-white/5 relative overflow-hidden">
                        {/* Background with Theme Color */}
                        <div className="absolute inset-0 opacity-10" style={{ backgroundColor: theme.accentColor }} />

                        <div className="relative z-10 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Tu Saldo Disponible</h3>
                                    <div className="flex items-baseline gap-1" style={{ color: theme.accentColor }}>
                                        <span className="text-sm font-bold">$</span>
                                        <span className="text-3xl font-black tracking-tighter">{userBalance.toFixed(2)}</span>
                                    </div>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10">
                                    <span className="material-symbols-outlined text-white" style={{ color: theme.accentColor }}>account_balance_wallet</span>
                                </div>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => alert('Acércate a la caja para cargar saldo')}
                                    className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">add</span>
                                    Cargar
                                </button>
                                <button
                                    onClick={() => setShowTransferModal(true)}
                                    className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">send</span>
                                    Transferir
                                </button>
                            </div>
                        </div>
                    </div>
                )
            )}

            {/* SEARCH BAR */}
            <div className="px-6 py-2">
                <div className="relative group">
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
                        placeholder="BUSCAR PRODUCTO..."
                        className={`w-full h-16 pl-14 pr-6 ${radiusClass} border transition-all font-bold text-sm outline-none focus:ring-2`}
                        style={{
                            backgroundColor: `${theme.textColor}05`,
                            borderColor: `${theme.textColor}10`,
                            color: theme.textColor,
                            // @ts-ignore
                            '--tw-ring-color': `${theme.accentColor}40`
                        }}
                    />
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 transition-colors" style={{ color: `${theme.textColor}33` }}>
                        <span className="material-symbols-outlined text-lg">search</span>
                    </div>
                </div>
            </div>

            {/* CATEGORIES */}
            <div
                className="sticky top-0 z-40 backdrop-blur-3xl border-b py-4 no-scrollbar overflow-x-auto"
                style={{ backgroundColor: `${theme.backgroundColor}E6`, borderColor: `${theme.textColor}10` }}
            >
                <div className="flex gap-3 px-6 items-center">
                    {(categories.length > 0 ? categories : [{ name: 'Todos' }, ...Array.from(new Set(products.map(p => p.category || 'General'))).map(c => ({ name: c }))]).map((catObj) => {
                        const catName = typeof catObj === 'string' ? catObj : catObj.name;
                        const isSelected = activeCategory === catName;
                        return (
                            <button
                                key={catName}
                                onClick={() => onCategoryChange(catName)}
                                className={`shrink-0 h-9 px-6 ${radiusClass} text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-500 border flex items-center justify-center`}
                                style={isSelected ? {
                                    backgroundColor: theme.accentColor,
                                    borderColor: theme.accentColor,
                                    color: 'black',
                                    boxShadow: `0 8px 20px ${theme.accentColor}33`
                                } : {
                                    backgroundColor: 'transparent',
                                    borderColor: `${theme.textColor}10`,
                                    color: `${theme.textColor}33`
                                }}
                            >
                                {catName}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* SEPARATOR (Exact alignment) */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="px-6 shrink-0 mt-8 mb-4"
            >
                <div className="flex items-center gap-2 opacity-50">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.accentColor }} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: theme.textColor }}>Carta Digital</span>
                    <div className="flex-1 h-px bg-current opacity-10" />
                </div>
            </motion.div>

            {/* PRODUCT GRID/LIST */}
            <div className={`px-4 md:px-6 pb-24`}>
                <motion.div
                    layout
                    className={activeLayout === 'grid' ? `grid gap-3 md:gap-6 ${theme.columns === 1 ? 'grid-cols-1' : 'grid-cols-2 md:grid-cols-3'}` : 'flex flex-col gap-3 md:gap-4'}
                >
                    <AnimatePresence>
                        {products.map((productRaw, i) => {
                            const isOutOfStock = productRaw.isOutOfStock || productRaw.is_available === false;
                            const product = { ...productRaw, isOutOfStock };
                            const price = getPrice(product);
                            const imageUrl = getImage(product);

                            const cardStyles = {
                                backgroundColor: theme.cardStyle === 'glass' ? `${theme.surfaceColor}80` :
                                    theme.cardStyle === 'solid' ? theme.surfaceColor :
                                        theme.cardStyle === 'border' ? 'transparent' : 'transparent',
                                borderColor: `${theme.textColor}10`,
                                borderWidth: '1px',
                                backdropFilter: theme.cardStyle === 'glass' ? 'blur(12px)' : 'none'
                            };

                            // LIST LAYOUT (CIRO Style)
                            if (activeLayout === 'list') {
                                return (
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: product.isOutOfStock ? 0.6 : 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ delay: i * 0.05 }}
                                        key={product.id}
                                        onClick={() => onItemClick && onItemClick(product)}
                                        className={`flex gap-4 p-4 items-center group transition-all duration-300 ${radiusClass} border cursor-pointer active:scale-[0.98] relative overflow-hidden`}
                                        style={cardStyles}
                                    >
                                        {theme.showImages && (
                                            <div
                                                className={`w-20 h-20 shrink-0 bg-cover bg-center ${radiusClass} border border-white/5 relative overflow-hidden ${product.isOutOfStock ? 'grayscale' : ''}`}
                                                style={{ backgroundImage: `url(${imageUrl})` }}
                                            >
                                                <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                                            <div className="flex flex-col gap-1">
                                                <h3 className="font-black text-[15px] uppercase tracking-tighter leading-none italic-black">
                                                    {product.name}
                                                    {product.isOutOfStock && <span className="ml-2 text-[8px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-bold tracking-widest uppercase">Agotado</span>}
                                                </h3>
                                                {theme.showDescription && (
                                                    <p className="text-[10px] font-medium opacity-40 leading-tight line-clamp-1">{product.description}</p>
                                                )}
                                                {theme.showPrices && (
                                                    <span className="font-black text-sm mt-1" style={{ color: theme.accentColor }}>${price.toLocaleString('es-AR')}</span>
                                                )}
                                            </div>
                                        </div>
                                        {showAdd && !product.isOutOfStock && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onAddToCart && onAddToCart(product); }}
                                                className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-white/5 hover:bg-white/10 group-hover:scale-110"
                                                style={{ border: `1px solid ${theme.accentColor}20` }}
                                            >
                                                <span className="material-symbols-outlined text-lg" style={{ color: theme.accentColor }}>add</span>
                                            </button>
                                        )}
                                    </motion.div>
                                );
                            }

                            // GRID LAYOUT (CIRO Style)
                            return (
                                <motion.div
                                    layout
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: product.isOutOfStock ? 0.6 : 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    whileHover={{ y: product.isOutOfStock ? 0 : -4 }}
                                    transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
                                    key={product.id}
                                    onClick={() => onItemClick && onItemClick(product)}
                                    className={`flex flex-col border overflow-hidden ${radiusClass} group cursor-pointer active:scale-[0.98] ${product.isOutOfStock ? 'grayscale-[0.5]' : ''}`}
                                    style={cardStyles}
                                >
                                    {theme.showImages && (
                                        <div className={`aspect-square bg-cover bg-center relative overflow-hidden ${product.isOutOfStock ? 'grayscale' : ''}`} style={{ backgroundImage: `url(${imageUrl})` }}>
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

                                            {showAdd && !product.isOutOfStock && (
                                                <motion.button
                                                    whileTap={{ scale: 0.9 }}
                                                    onClick={(e) => { e.stopPropagation(); onAddToCart && onAddToCart(product); }}
                                                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full shadow-2xl scale-0 group-hover:scale-100 transition-all duration-300 backdrop-blur-md"
                                                    style={{ backgroundColor: `${theme.accentColor}`, color: '#000' }}
                                                >
                                                    <span className="material-symbols-outlined font-black text-2xl">add</span>
                                                </motion.button>
                                            )}

                                            {product.isOutOfStock && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
                                                    <span className="px-3 py-1 bg-black/80 border border-white/10 rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-white">
                                                        Agotado
                                                    </span>
                                                </div>
                                            )}

                                            <div className="absolute inset-0 border border-white/5 pointer-events-none" />
                                        </div>
                                    )}
                                    <div className="p-4 flex-1 flex flex-col justify-between">
                                        <div className="space-y-1.5">
                                            <h3 className="font-black text-[14px] uppercase tracking-tighter leading-none italic-black break-words">
                                                {product.name}
                                            </h3>
                                            {theme.showDescription && product.description && (
                                                <p className="text-[9px] font-medium opacity-40 line-clamp-1 leading-tight">{product.description}</p>
                                            )}
                                        </div>
                                        {theme.showPrices && (
                                            <div className="mt-3 flex items-center justify-between">
                                                <span className="font-black text-[15px] italic-black" style={product.isOutOfStock ? { color: '#999', textDecoration: 'line-through' } : { color: theme.accentColor }}>${price.toLocaleString('es-AR')}</span>
                                                {!theme.showImages && showAdd && !product.isOutOfStock && (
                                                    <button onClick={(e) => { e.stopPropagation(); onAddToCart && onAddToCart(product); }} className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5">
                                                        <span className="material-symbols-outlined text-xs" style={{ color: theme.accentColor }}>add</span>
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </motion.div>
            </div>
        </div>
    );
};
