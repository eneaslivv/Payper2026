import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MenuItem } from '../../components/client/types';
import { useClient } from '../../contexts/ClientContext';
import { MenuRenderer } from '../../components/MenuRenderer';
import SessionSelector from '../../components/client/SessionSelector';

const MenuPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams();
  const {
    store, products, user, hasActiveOrder, setIsHubOpen, cart,
    getMenuRule, isOrderingAllowed, serviceMode, tableLabel,
    showSessionSelector, setShowSessionSelector, onSessionCreated
  } = useClient();

  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Get ALL theme values from store or use defaults
  const theme = store?.menu_theme || {};

  // Paleta Cromática
  const accentColor = theme.accentColor || '#4ADE80';
  const backgroundColor = theme.backgroundColor || '#000000';
  const cardColor = theme.surfaceColor || theme.cardColor || '#1A1C19'; // Fixed: uses surfaceColor from DB
  const textColor = theme.textColor || '#FFFFFF';

  // Marca & Cabecera
  const headerImage = theme.headerImage;
  const headerOverlay = theme.headerOverlay ?? 50;
  const headerAlignment = theme.headerAlignment || 'left';

  // Disposición & Tarjetas
  const layout = theme.layoutMode || 'grid'; // Fixed: was 'layout', now 'layoutMode' to match DB
  const columns = theme.columns || 2;
  const cardStyle = theme.cardStyle || 'minimal';
  const borderRadius = theme.borderRadius || 'xl';
  const fontStyle = theme.fontStyle || 'modern';

  // Visibilidad de Contenido
  const showImages = theme.showImages !== false;
  const showPrices = theme.showPrices !== false;
  const showDescription = theme.showDescription !== false;
  const showQuickAdd = theme.showQuickAdd !== false;
  const showBadges = theme.showBadges !== false;

  // Dynamic classes based on theme
  const fontClass = fontStyle === 'serif' ? 'font-serif' : fontStyle === 'mono' ? 'font-mono' : 'font-sans';

  const getRadiusClass = (size: string = borderRadius) => {
    switch (size) {
      case 'none': return 'rounded-none';
      case 'sm': return 'rounded-md';
      case 'md': return 'rounded-lg';
      case 'lg': return 'rounded-xl';
      case 'xl': return 'rounded-2xl';
      case 'full': return 'rounded-[2.5rem]';
      default: return 'rounded-xl';
    }
  };

  const getCardStyles = () => {
    const base = { backgroundColor: cardColor, borderColor: `${textColor}10` };
    switch (cardStyle) {
      case 'glass': return { ...base, backgroundColor: `${cardColor}80`, backdropFilter: 'blur(12px)' };
      case 'solid': return { ...base };
      case 'border': return { backgroundColor: 'transparent', borderColor: `${textColor}20`, borderWidth: '2px' };
      case 'floating': return { ...base, boxShadow: '0 20px 40px rgba(0,0,0,0.4)' };
      case 'minimal':
      default: return { backgroundColor: `${textColor}05`, borderColor: `${textColor}05` };
    }
  };

  // Consume categories from context (Synced with DB)
  const { categories } = useClient();

  const hideOutOfStock = getMenuRule('hideOutofStock');

  const filteredProducts = useMemo(() => {
    let filtered = products;

    // 1. Filter by Stock Rule
    if (hideOutOfStock) {
      filtered = filtered.filter(p => !p.isOutOfStock);
    }

    // 2. Filter by Search & Category
    // When no search and "Todos" is selected, return filtered list
    if (!searchQuery && selectedCategory === 'Todos') {
      return filtered;
    }

    return filtered.filter(item => {
      const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === 'Todos' || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchQuery, selectedCategory, hideOutOfStock]);

  // Determine if ordering is allowed (Gateway)
  // TODO: Detect actual channel (takeaway vs dineIn) from URL or Context. Defaulting to dineIn for now.
  const allowOrdering = isOrderingAllowed('dineIn');

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (!store) return null;

  const radiusClass = getRadiusClass();

  return (
    <div className={`flex flex-col min-h-screen w-full overflow-x-hidden ${fontClass}`} style={{ backgroundColor, color: textColor }}>
      {/* UNIFIED RENDERER */}
      <MenuRenderer
        theme={{
          ...theme,
          storeName: store.name,
          accentColor,
          backgroundColor,
          surfaceColor: cardColor,
          textColor,
          layoutMode: layout,
          columns: columns as 1 | 2,
          cardStyle: cardStyle as any,
          borderRadius: borderRadius as any,
          fontStyle: fontStyle as any,
          showImages,
          showPrices,
          showDescription,
          showAddButton: showQuickAdd,
          showBadges
        }}
        products={filteredProducts as any}
        categories={categories}
        storeName={store.name}
        logoUrl={store.logo_url}
        activeCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        allowOrdering={allowOrdering}
        onItemClick={(item) => navigate(`/m/${slug}/product/${item.id}`)}
        onAddToCart={(item) => navigate(`/m/${slug}/product/${item.id}`)} // Or direct add if desired
        serviceMode={serviceMode}
        tableLabel={tableLabel}
      />

      {/* USER HUB BUTTON (Floating Overlay) */}
      <div className="fixed top-[calc(1.2rem+env(safe-area-inset-top))] right-6 z-[60]">
        <div className="flex items-center gap-3">
          {user ? (
            <button
              onClick={() => setIsHubOpen(true)}
              className={`relative flex items-center justify-center h-14 w-14 ${radiusClass} border active:scale-90 transition-all group shadow-2xl backdrop-blur-xl`}
              style={{ backgroundColor: `${textColor}10`, borderColor: `${textColor}20` }}
            >
              <span className="material-symbols-outlined text-xl" style={{ color: textColor }}>room_service</span>
              {hasActiveOrder && (
                <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: accentColor }} />
              )}
            </button>
          ) : (
            <button
              onClick={() => navigate(`/m/${slug}/auth`)}
              className={`h-14 px-8 ${radiusClass} text-black text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all shadow-xl`}
              style={{ backgroundColor: accentColor }}
            >
              ENTRAR
            </button>
          )}
        </div>
      </div>

      {/* CART FLOATING BUTTON */}
      {cartCount > 0 && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-0 right-0 z-50 px-6 max-w-md mx-auto animate-in slide-in-from-bottom-12 duration-700">
          <button
            onClick={() => navigate(`/m/${slug}/cart`)}
            className={`w-full h-20 ${radiusClass} shadow-[0_30px_70px_rgba(0,0,0,0.8)] flex items-center justify-between pl-10 pr-4 transition-all active:scale-[0.97] group overflow-hidden border`}
            style={{ backgroundColor: accentColor, borderColor: `${textColor}33` }}
          >
            <div className="flex items-center gap-5 relative z-10 shrink-0">
              <div
                className={`w-12 h-12 ${radiusClass} flex items-center justify-center font-black text-xs shadow-2xl border`}
                style={{ backgroundColor: backgroundColor, color: accentColor, borderColor: `${textColor}10` }}
              >
                {cartCount}
              </div>
              <div className="flex flex-col items-start leading-[1] text-left text-black">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] mb-1 opacity-50">Tu Bolsa</span>
                <span className="font-black text-[22px] italic tracking-tighter tabular-nums leading-none">${cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 relative z-10">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center shadow-xl group-hover:scale-105 transition-all"
                style={{ backgroundColor: backgroundColor, color: accentColor }}
              >
                <span className="material-symbols-outlined font-black text-[24px]">arrow_forward</span>
              </div>
            </div>
          </button>
        </div>
      )}
      {/* SESSION SELECTOR MODAL */}
      {showSessionSelector && store && (
        <SessionSelector
          storeId={store.id}
          storeSlug={slug || ''}
          accentColor={accentColor}
          onSessionCreated={onSessionCreated}
          onClose={() => setShowSessionSelector(false)}
        />
      )}
    </div>
  );
};


export default MenuPage;
