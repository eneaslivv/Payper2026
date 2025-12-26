import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MenuItem } from '../../components/client/types';
import { useClient } from '../../contexts/ClientContext';

const MenuPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { store, products, user, hasActiveOrder, setIsHubOpen, cart } = useClient();

  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Get theme from store or use defaults
  const theme = store?.menu_theme || {};
  const accentColor = theme.accentColor || '#4ADE80';
  const showImages = theme.showImages !== false;
  const showPrices = theme.showPrices !== false;
  const layout = theme.layout || 'grid';
  const cardStyle = theme.cardStyle || 'minimal';
  const borderRadius = theme.borderRadius || 'xl';
  const fontStyle = theme.fontStyle || 'modern';
  const headerImage = theme.headerImage;

  // Dynamic classes based on theme
  const fontClass = fontStyle === 'serif' ? 'font-serif' : fontStyle === 'mono' ? 'font-mono' : 'font-sans';
  const radiusClass = borderRadius === 'none' ? 'rounded-none' : borderRadius === 'md' ? 'rounded-lg' : borderRadius === 'full' ? 'rounded-[2.5rem]' : 'rounded-xl';

  // Card style classes
  const getCardClass = () => {
    switch (cardStyle) {
      case 'glass': return 'bg-white/[0.05] backdrop-blur-xl border-white/10';
      case 'solid': return 'bg-zinc-900 border-zinc-800';
      case 'border': return 'bg-transparent border-white/20';
      case 'minimal':
      default: return 'bg-white/[0.02] border-white/5';
    }
  };

  // Computar Categorías desde los productos
  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category)));
    return ['Todos', ...cats];
  }, [products]);

  const itemsMatchingSearch = useMemo(() => {
    return products.filter(item =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  const popularItems = useMemo(() => itemsMatchingSearch.filter(item => item.isPopular), [itemsMatchingSearch]);

  const otherItems = useMemo(() => itemsMatchingSearch.filter(item =>
    selectedCategory === 'Todos' ? !item.isPopular : item.category === selectedCategory
  ), [itemsMatchingSearch, selectedCategory]);

  const cartTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  if (!store) return null;

  return (
    <div className={`flex flex-col pb-48 min-h-screen bg-black ${fontClass}`}>
      {/* HEADER CON IMAGEN DE PORTADA */}
      {headerImage && (
        <div className="relative h-40 w-full overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${headerImage})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-black" />
        </div>
      )}

      <header className={`sticky top-0 z-50 bg-black/95 backdrop-blur-3xl border-b border-white/5 ${headerImage ? 'pt-4' : 'pt-[calc(1.2rem+env(safe-area-inset-top))]'} px-6 pb-6`}>
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex flex-col">
            {store.logo_url && (
              <img src={store.logo_url} alt={store.name} className="h-10 w-auto object-contain mb-2" />
            )}
            <h1 className="text-[28px] font-black leading-[0.85] tracking-tighter uppercase text-white italic">
              {store.name} <br /> <span style={{ color: accentColor }} className="text-[24px]">Menu</span>
            </h1>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
              <span className="text-[7px] font-black uppercase text-white/40 tracking-[0.2em]">SISTEMA: ONLINE</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <button
                onClick={() => setIsHubOpen(true)}
                className={`relative flex items-center justify-center h-14 w-14 ${radiusClass} bg-white/[0.03] border border-white/10 active:scale-90 transition-all group shadow-2xl`}
              >
                <span className="material-symbols-outlined text-white/40 text-xl" style={{ '--hover-color': accentColor } as any}>room_service</span>
                {hasActiveOrder && (
                  <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full animate-ping" style={{ backgroundColor: accentColor, boxShadow: `0 0 12px ${accentColor}` }} />
                )}
              </button>
            ) : (
              <button
                onClick={() => navigate(`/m/${slug}/auth`)}
                className={`h-14 px-8 ${radiusClass} text-black text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all shadow-xl border border-white/20`}
                style={{ backgroundColor: accentColor }}
              >
                ENTRAR
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-6">
        {/* GUEST CTA BANNER */}
        {!user && (
          <div className="px-6 pt-6">
            <div
              className={`relative group ${getCardClass()} border ${radiusClass} p-7 overflow-hidden shadow-2xl transition-all hover:bg-white/[0.03] active:scale-[0.98] cursor-pointer`}
              onClick={() => navigate(`/m/${slug}/auth`)}
            >
              <div className="absolute top-0 right-0 w-32 h-32 blur-[50px] rounded-full -mr-16 -mt-16 pointer-events-none" style={{ backgroundColor: `${accentColor}20` }} />
              <div className="flex items-center justify-between relative z-10">
                <div className="flex flex-col gap-1">
                  <span className="text-[7px] font-black uppercase tracking-[0.3em] italic mb-1" style={{ color: `${accentColor}66` }}>Status: Guest_Mode</span>
                  <h3 className="text-[20px] font-black uppercase italic tracking-tighter text-white leading-none">Pide desde tu mesa</h3>
                  <p className="text-[10px] font-medium text-white/30 tracking-tight mt-1 max-w-[180px]">Evita las filas, realiza tu pedido y acumula beneficios.</p>
                </div>
                <div
                  className="w-14 h-14 rounded-full text-black flex items-center justify-center"
                  style={{ backgroundColor: accentColor, boxShadow: `0 10px 25px ${accentColor}33` }}
                >
                  <span className="material-symbols-outlined font-black text-[28px]">bolt</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SEARCH BAR */}
        <div className="px-6 py-2">
          <div className="relative group">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="BUSCAR PRODUCTO..."
              className={`w-full h-16 pl-14 pr-6 ${radiusClass} border border-white/5 bg-white/[0.02] text-white placeholder:text-white/10 placeholder:tracking-[0.3em] placeholder:text-[8px] placeholder:font-black transition-all font-bold text-sm`}
              style={{ '--focus-color': accentColor } as any}
            />
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 transition-colors">
              <span className="material-symbols-outlined text-lg">search</span>
            </div>
          </div>
        </div>

        {/* CATEGORIES */}
        <div className="sticky top-[calc(100px+env(safe-area-inset-top))] z-40 bg-black/90 backdrop-blur-3xl border-b border-white/5 py-4 no-scrollbar overflow-x-auto">
          <div className="flex gap-3 px-6 items-center">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 h-9 px-6 ${radiusClass} text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-500 border`}
                style={selectedCategory === cat ? {
                  backgroundColor: accentColor,
                  borderColor: accentColor,
                  color: 'black',
                  boxShadow: `0 8px 20px ${accentColor}33`
                } : {
                  backgroundColor: 'transparent',
                  borderColor: 'rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.2)'
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* PRODUCTS */}
        <div className="px-6 flex flex-col gap-10 mt-4">
          {selectedCategory === 'Todos' && popularItems.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-6 px-1">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }} />
                  <h2 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 italic">Los más votados</h2>
                </div>
                <div className="h-px flex-1 ml-4 bg-white/[0.03]" />
              </div>
              <div className={layout === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-4'}>
                {popularItems.map(item => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    onClick={() => navigate(`/m/${slug}/product/${item.id}`)}
                    showImage={showImages}
                    showPrice={showPrices}
                    accentColor={accentColor}
                    cardClass={getCardClass()}
                    radiusClass={radiusClass}
                    layout={layout}
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-6 px-1">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white/10" />
                <h2 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 italic">
                  {selectedCategory === 'Todos' ? 'Menú Completo' : selectedCategory}
                </h2>
              </div>
              <div className="h-px flex-1 ml-4 bg-white/[0.03]" />
            </div>
            <div className={layout === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-4'}>
              {otherItems.map(item => (
                <ProductCard
                  key={item.id}
                  item={item}
                  onClick={() => navigate(`/m/${slug}/product/${item.id}`)}
                  showImage={showImages}
                  showPrice={showPrices}
                  accentColor={accentColor}
                  cardClass={getCardClass()}
                  radiusClass={radiusClass}
                  layout={layout}
                />
              ))}
              {otherItems.length === 0 && <div className="text-white/20 text-center text-xs py-10 col-span-2">No hay productos en esta categoría</div>}
            </div>
          </section>
        </div>
      </main>

      {/* CART FLOATING BUTTON */}
      {cartCount > 0 && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-0 right-0 z-50 px-6 max-w-md mx-auto animate-in slide-in-from-bottom-12 duration-700">
          <button
            onClick={() => navigate(`/m/${slug}/cart`)}
            className={`w-full h-20 ${radiusClass} shadow-[0_30px_70px_rgba(0,0,0,0.8)] flex items-center justify-between pl-10 pr-4 transition-all active:scale-[0.97] group overflow-hidden border border-white/20`}
            style={{ backgroundColor: accentColor }}
          >
            <div className="flex items-center gap-5 relative z-10 shrink-0">
              <div className={`w-12 h-12 ${radiusClass} bg-black flex items-center justify-center font-black text-xs shadow-2xl border border-white/5`} style={{ color: accentColor }}>{cartCount}</div>
              <div className="flex flex-col items-start leading-[1] text-left">
                <span className="text-[9px] font-black text-black/50 uppercase tracking-[0.2em] mb-1">Tu Bolsa</span>
                <span className="text-black font-black text-[22px] italic tracking-tighter tabular-nums leading-none">${cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 relative z-10">
              <div className={`w-12 h-12 rounded-full bg-black flex items-center justify-center shadow-xl group-hover:scale-105 transition-all`} style={{ color: accentColor }}>
                <span className="material-symbols-outlined font-black text-[24px]">arrow_forward</span>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

// Product Card Component
interface ProductCardProps {
  item: MenuItem;
  onClick: () => void;
  showImage: boolean;
  showPrice: boolean;
  accentColor: string;
  cardClass: string;
  radiusClass: string;
  layout: 'grid' | 'list';
}

const ProductCard: React.FC<ProductCardProps> = ({ item, onClick, showImage, showPrice, accentColor, cardClass, radiusClass, layout }) => {
  if (layout === 'list') {
    return (
      <div
        onClick={item.isOutOfStock ? undefined : onClick}
        className={`group relative flex items-center gap-5 p-4 ${radiusClass} border transition-all duration-700 overflow-hidden ${cardClass} ${item.isOutOfStock ? 'opacity-20 cursor-not-allowed grayscale' : 'active:scale-[0.98] shadow-2xl cursor-pointer'}`}
      >
        {showImage && (
          <div
            className={`w-24 h-24 bg-center bg-cover ${radiusClass} shrink-0 shadow-lg ring-1 ring-white/5 transition-transform duration-700 group-hover:scale-105`}
            style={{ backgroundImage: `url(${item.image})` }}
          >
            {item.isPopular && !item.isOutOfStock && (
              <div className="absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 backdrop-blur-md border border-white/20 shadow-xl" style={{ color: accentColor }}>
                <span className="material-symbols-outlined text-[10px] font-black fill-icon">star</span>
              </div>
            )}
          </div>
        )}
        <div className={`flex-1 flex flex-col justify-between min-w-0 ${showImage ? 'h-24' : 'h-16'} py-1`}>
          <div>
            <h3 className="text-[16px] font-black tracking-tight uppercase italic leading-tight text-white mb-1">{item.name}</h3>
            <p className="text-[10px] font-medium leading-tight line-clamp-2 text-white/20 tracking-tight">{item.description}</p>
          </div>
          {showPrice && (
            <div className="flex items-center justify-between mt-auto">
              <span className="text-lg font-black tracking-tighter italic text-white/90">${item.price.toFixed(2)}</span>
              {!item.isOutOfStock && (
                <div className={`flex h-8 w-8 items-center justify-center ${radiusClass} bg-white/[0.03] text-white/20 group-hover:text-black transition-all border border-white/5`} style={{ '--hover-bg': accentColor } as any}>
                  <span className="material-symbols-outlined font-black text-base">add</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Grid layout
  return (
    <div
      onClick={item.isOutOfStock ? undefined : onClick}
      className={`group relative flex flex-col ${radiusClass} border transition-all duration-700 overflow-hidden ${cardClass} ${item.isOutOfStock ? 'opacity-20 cursor-not-allowed grayscale' : 'active:scale-[0.98] shadow-2xl cursor-pointer'}`}
    >
      {showImage && (
        <div
          className="w-full aspect-square bg-center bg-cover transition-transform duration-700 group-hover:scale-105"
          style={{ backgroundImage: `url(${item.image})` }}
        >
          {item.isPopular && !item.isOutOfStock && (
            <div className="absolute top-3 left-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-md border border-white/20 shadow-xl" style={{ color: accentColor }}>
              <span className="material-symbols-outlined text-[12px] font-black fill-icon">star</span>
            </div>
          )}
        </div>
      )}
      <div className="p-4 flex flex-col gap-2">
        <h3 className="text-[14px] font-black tracking-tight uppercase italic leading-tight text-white">{item.name}</h3>
        {showPrice && (
          <div className="flex items-center justify-between">
            <span className="text-lg font-black tracking-tighter italic text-white/90">${item.price.toFixed(2)}</span>
            {!item.isOutOfStock && (
              <div
                className={`flex h-8 w-8 items-center justify-center ${radiusClass} text-black transition-all`}
                style={{ backgroundColor: accentColor }}
              >
                <span className="material-symbols-outlined font-black text-base">add</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuPage;
