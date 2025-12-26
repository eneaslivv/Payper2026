import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MenuItem } from '../../components/client/types'; // Updated import
import { useClient } from '../../contexts/ClientContext';
// import { MENU_ITEMS, CATEGORIES } from '../constants'; // Removed constants

const MenuPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { store, products, user, hasActiveOrder, setIsHubOpen, cart } = useClient();

  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Get theme from store or use defaults
  const theme = store?.menu_theme || {};
  const accentColor = theme.accentColor || '#36e27b';
  const fontClass = theme.fontStyle === 'serif' ? 'font-serif' : theme.fontStyle === 'mono' ? 'font-mono' : 'font-sans';
  const borderRadius = theme.borderRadius === 'none' ? 'rounded-none' : theme.borderRadius === 'md' ? 'rounded-lg' : theme.borderRadius === 'full' ? 'rounded-[2rem]' : 'rounded-xl';

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

  if (!store) return null; // Should be handled by Layout

  // Dynamic style for accent color
  const accentStyle = { '--accent-color': accentColor } as React.CSSProperties;

  return (
    <div className={`flex flex-col pb-48 min-h-screen bg-black ${fontClass}`} style={accentStyle}>
      {/* HEADER OPTIMIZADO PARA IPHONE/PWA */}
      <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-3xl border-b border-white/5 pt-[calc(1.2rem+env(safe-area-inset-top))] px-6 pb-6">
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex flex-col">
            <h1 className="text-[28px] font-black leading-[0.85] tracking-tighter uppercase text-white italic">
              {store.name} <br /> <span style={{ color: accentColor }} className="text-[24px]">Menu</span>
            </h1>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }}></div>
              <span className="text-[7px] font-black uppercase text-white/40 tracking-[0.2em]">SISTEMA: ONLINE</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <button
                onClick={() => setIsHubOpen(true)}
                className="relative flex items-center justify-center h-14 w-14 rounded-2xl bg-white/[0.03] border border-white/10 active:scale-90 transition-all group shadow-2xl"
              >
                <span className="material-symbols-outlined text-white/40 group-hover:text-primary transition-colors text-xl">room_service</span>
                {hasActiveOrder && (
                  <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_12px_#36e27b] animate-ping"></div>
                )}
              </button>
            ) : (
              <button
                onClick={() => navigate(`/m/${slug}/auth`)}
                className="h-14 px-8 rounded-2xl bg-primary text-black text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all shadow-xl border border-white/20"
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
            <div className="relative group bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-7 overflow-hidden shadow-2xl transition-all hover:bg-white/[0.03] active:scale-[0.98]" onClick={() => navigate(`/m/${slug}/auth`)}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-[50px] rounded-full -mr-16 -mt-16 pointer-events-none"></div>
              <div className="flex items-center justify-between relative z-10">
                <div className="flex flex-col gap-1">
                  <span className="text-[7px] font-black text-primary/40 uppercase tracking-[0.3em] italic mb-1">Status: Guest_Mode</span>
                  <h3 className="text-[20px] font-black uppercase italic tracking-tighter text-white leading-none">Pide desde tu mesa</h3>
                  <p className="text-[10px] font-medium text-white/30 tracking-tight mt-1 max-w-[180px]">Evita las filas, realiza tu pedido y acumula beneficios.</p>
                </div>
                <div className="w-14 h-14 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_10px_25px_rgba(54,226,123,0.2)]">
                  <span className="material-symbols-outlined font-black text-[28px]">bolt</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* REFINED SEARCH BAR */}
        <div className="px-6 py-2">
          <div className="relative group">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="BUSCAR PRODUCTO..."
              className="w-full h-16 pl-14 pr-6 rounded-2xl border border-white/5 bg-white/[0.02] text-white placeholder:text-white/10 placeholder:tracking-[0.3em] placeholder:text-[8px] placeholder:font-black focus:border-primary/20 focus:bg-white/[0.04] transition-all font-bold text-sm"
            />
            <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-primary transition-colors">
              <span className="material-symbols-outlined text-lg">search</span>
            </div>
          </div>
        </div>

        {/* CATEGORIES STICKY ABAJO DEL MAIN HEADER */}
        <div className="sticky top-[calc(100px+env(safe-area-inset-top))] z-40 bg-black/90 backdrop-blur-3xl border-b border-white/5 py-4 no-scrollbar overflow-x-auto">
          <div className="flex gap-3 px-6 items-center">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 h-9 px-6 rounded-xl text-[8px] font-black uppercase tracking-[0.2em] transition-all duration-500 border ${selectedCategory === cat
                  ? 'bg-primary border-primary text-black shadow-[0_8px_20px_rgba(54,226,123,0.2)]'
                  : 'bg-transparent border-white/5 text-white/20 hover:text-white/40'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 flex flex-col gap-10 mt-4">
          {selectedCategory === 'Todos' && popularItems.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-6 px-1">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_#36e27b]"></div>
                  <h2 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 italic">Los más votados</h2>
                </div>
                <div className="h-px flex-1 ml-4 bg-white/[0.03]"></div>
              </div>
              <div className="flex flex-col gap-4">
                {popularItems.map(item => <MinimalCard key={item.id} item={item} onClick={() => navigate(`/m/${slug}/product/${item.id}`)} />)}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-6 px-1">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white/10"></div>
                <h2 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/30 italic">
                  {selectedCategory === 'Todos' ? 'Menú Completo' : selectedCategory}
                </h2>
              </div>
              <div className="h-px flex-1 ml-4 bg-white/[0.03]"></div>
            </div>
            <div className="flex flex-col gap-4">
              {otherItems.map(item => <MinimalCard key={item.id} item={item} onClick={() => navigate(`/m/${slug}/product/${item.id}`)} />)}
              {otherItems.length === 0 && <div className="text-white/20 text-center text-xs py-10">No hay productos en esta categoría</div>}
            </div>
          </section>
        </div>
      </main>

      {/* FOOTER CAPSULE REFINED */}
      {cartCount > 0 && (
        <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-0 right-0 z-50 px-6 max-w-md mx-auto animate-in slide-in-from-bottom-12 duration-700">
          <button
            onClick={() => navigate(`/m/${slug}/cart`)}
            className="w-full h-20 bg-primary rounded-full shadow-[0_30px_70px_rgba(0,0,0,0.8)] flex items-center justify-between pl-10 pr-4 transition-all active:scale-[0.97] group overflow-hidden border border-white/20"
          >
            <div className="flex items-center gap-5 relative z-10 shrink-0">
              <div className="w-12 h-12 rounded-xl bg-black flex items-center justify-center text-primary font-black text-xs shadow-2xl border border-white/5">{cartCount}</div>
              <div className="flex flex-col items-start leading-[1] text-left">
                <span className="text-[9px] font-black text-black/50 uppercase tracking-[0.2em] mb-1">Tu Bolsa</span>
                <span className="text-black font-black text-[22px] italic tracking-tighter tabular-nums leading-none">${cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-full bg-black text-primary flex items-center justify-center shadow-xl group-hover:scale-105 transition-all">
                <span className="material-symbols-outlined font-black text-[24px]">arrow_forward</span>
              </div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};

const MinimalCard: React.FC<{ item: MenuItem, onClick: () => void }> = ({ item, onClick }) => (
  <div
    onClick={item.isOutOfStock ? undefined : onClick}
    className={`group relative flex items-center gap-5 p-4 rounded-[1.8rem] border transition-all duration-700 overflow-hidden ${item.isOutOfStock
      ? 'bg-black opacity-20 cursor-not-allowed grayscale'
      : 'bg-[#080808] hover:bg-white/[0.01] border-white/[0.04] active:scale-[0.98] shadow-2xl'
      }`}
  >
    <div
      className="w-28 h-28 bg-center bg-cover rounded-2xl shrink-0 shadow-lg ring-1 ring-white/5 transition-transform duration-700 group-hover:scale-105"
      style={{ backgroundImage: `url(${item.image})` }}
    >
      {item.isPopular && !item.isOutOfStock && (
        <div className="absolute top-2.5 left-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-primary shadow-xl">
          <span className="material-symbols-outlined text-[12px] font-black fill-icon">star</span>
        </div>
      )}
    </div>
    <div className="flex-1 flex flex-col justify-between min-w-0 h-28 py-1">
      <div>
        <h3 className="text-[18px] font-black tracking-tight uppercase italic leading-tight text-white mb-1">{item.name}</h3>
        <p className="text-[10px] font-medium leading-tight line-clamp-2 text-white/20 tracking-tight">{item.description}</p>
      </div>
      <div className="flex items-center justify-between mt-auto">
        <span className="text-xl font-black tracking-tighter italic text-white/90">${item.price.toFixed(2)}</span>
        {!item.isOutOfStock && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.03] text-white/20 group-hover:bg-primary group-hover:text-black transition-all border border-white/5">
            <span className="material-symbols-outlined font-black text-lg">add</span>
          </div>
        )}
      </div>
    </div>
  </div>
);

export default MenuPage;
