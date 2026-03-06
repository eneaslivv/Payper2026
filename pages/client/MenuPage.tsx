import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MenuItem } from '../../components/client/types';
import { useClient } from '../../contexts/ClientContext';
import { MenuRenderer } from '../../components/MenuRenderer';
import SessionSelector from '../../components/client/SessionSelector';
import { WalletTransferModal } from '../../components/WalletTransferModal';
import { supabase } from '../../lib/supabase';

const MenuPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams();
  const {
    store, products, user, hasActiveOrder, setIsHubOpen, cart, setUser,
    getMenuRule, isOrderingAllowed, serviceMode, tableLabel,
    showSessionSelector, setShowSessionSelector, onSessionCreated,
    disconnectTable, addToCart, updateQuantity, removeFromCart,
    reservationContext
  } = useClient();

  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');

  // Wallet modals
  const [showTopUp, setShowTopUp] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

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
  const hasOptions = (item: MenuItem) => (item.variants?.length || 0) > 0 || (item.addons?.length || 0) > 0;
  const getCartEntry = (item: MenuItem) => cart.find((c) => c.id === item.id && (!c.size || c.size === ''));
  const getCartQuantity = (item: MenuItem) => {
    if (hasOptions(item)) return 0;
    return cart
      .filter((c) => c.id === item.id && (!c.size || c.size === ''))
      .reduce((sum, c) => sum + c.quantity, 0);
  };
  const handleQuickAdd = (item: MenuItem) => {
    if (hasOptions(item)) {
      navigate(`/m/${slug}/product/${item.id}`);
      return;
    }
    const existing = getCartEntry(item);
    if (existing) {
      updateQuantity(item.id, 1, existing.size || '');
    } else {
      addToCart(item, 1, [], '', '');
    }
  };
  const handleDecrement = (item: MenuItem) => {
    const existing = getCartEntry(item);
    if (!existing) return;
    if (existing.quantity <= 1) {
      removeFromCart(item.id, existing.size || '');
      return;
    }
    updateQuantity(item.id, -1, existing.size || '');
  };
  const handleItemClick = (item: MenuItem) => {
    navigate(`/m/${slug}/product/${item.id}`);
  };

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
        onItemClick={handleItemClick}
        onAddToCart={handleQuickAdd}
        getQuantity={getCartQuantity}
        onIncrement={handleQuickAdd}
        onDecrement={handleDecrement}
        serviceMode={serviceMode}
        tableLabel={tableLabel}
        isGuest={!user}
        userBalance={user?.balance}
        onTopUp={() => user ? setShowTopUp(true) : navigate(`/m/${slug}/auth`)}
        onTransfer={() => user ? setShowTransfer(true) : navigate(`/m/${slug}/auth`)}
      />

      {/* CONTEXT BANNER (Always visible to clarify state) */}
      <div className="fixed top-0 left-0 right-0 z-[60] flex justify-center pointer-events-none">
        <div className={`mt-[calc(env(safe-area-inset-top)+1rem)] pointer-events-auto backdrop-blur-md border rounded-full py-2 px-4 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${reservationContext ? 'bg-indigo-950/90 border-indigo-500/30' : tableLabel ? 'bg-[#1a1c1a]/90 border-white/10' : 'bg-black/80 border-white/5'}`}>
          {reservationContext ? (
            <>
              <div className="flex flex-col items-center leading-none">
                <span className="text-[8px] uppercase tracking-widest text-indigo-300/60 font-bold mb-0.5">Mesa Reservada</span>
                <span className="text-sm font-black tracking-wide text-indigo-300">
                  {reservationContext.table_label}
                </span>
              </div>
              <div className="h-6 w-px bg-indigo-500/20 mx-1"></div>
              <div className="flex flex-col items-center leading-none">
                <span className="text-[8px] uppercase tracking-widest text-indigo-300/60 font-bold mb-0.5">Crédito</span>
                <span className="text-sm font-black tracking-wide text-indigo-300">
                  ${reservationContext.remaining_credit.toFixed(2)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col items-center leading-none">
                <span className="text-[8px] uppercase tracking-widest text-white/50 font-bold mb-0.5">Ubicación</span>
                <span className={`text-sm font-black tracking-wide ${tableLabel ? 'text-neon shadow-neon-soft' : 'text-white/80'}`}>
                  {tableLabel || 'QR LIBRE'}
                </span>
              </div>
            </>
          )}

          {/* Only show disconnect X if actually connected to a table */}
          {tableLabel && !reservationContext && (
            <>
              <div className="h-6 w-px bg-white/10 mx-1"></div>
              <button
                onClick={disconnectTable}
                className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* USER HUB BUTTON (Floating Overlay) */}
      <div className="fixed top-[calc(1.2rem+env(safe-area-inset-top))] right-6 z-[60]">
        <div className="flex items-center gap-3">
          {user ? (
            // User is logged in
            (hasActiveOrder || tableLabel) ? (
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
            ) : null // User logged in but no active order/table -> show nothing (bottom bar handles profile)
          ) : (
            // User NOT logged in
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
            className={`group relative w-full h-20 ${radiusClass} shadow-[0_30px_70px_rgba(0,0,0,0.8)] flex items-center justify-between pl-8 pr-5 transition-all active:scale-[0.97] overflow-hidden border border-white/20`}
            style={{ backgroundColor: accentColor }}
          >
            <div className="flex items-center gap-4 relative z-10 shrink-0">
              <div
                className={`w-12 h-12 ${radiusClass} flex items-center justify-center font-black text-xs shadow-2xl bg-black`}
                style={{ color: accentColor }}
              >
                {cartCount}
              </div>
              <div className="flex flex-col items-start leading-[1] text-left text-black">
                <span className="text-[9px] font-black uppercase tracking-[0.2em] mb-1 opacity-50">Tu Bolsa</span>
                <span className="font-black text-[22px] italic tracking-tighter tabular-nums leading-none">${cartTotal.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center gap-4 relative z-10">
              <div className="h-10 w-px bg-black/10"></div>
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-black transition-all group-hover:scale-105 shadow-xl" style={{ color: accentColor }}>
                <span className="material-symbols-outlined font-black text-[26px]">arrow_forward</span>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
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
      {/* ═══════════════════ WALLET TOP-UP MODAL ═══════════════════ */}
      {showTopUp && user && store && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-2xl animate-in fade-in duration-500" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <div
            className="w-full max-w-sm rounded-[2rem] p-8 shadow-[0_40px_100px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-300 border"
            style={{ backgroundColor: cardColor, borderColor: `${textColor}10`, color: textColor }}
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-[22px] font-black uppercase tracking-tighter italic leading-none">
                Cargar <span style={{ color: accentColor }}>Saldo</span>
              </h2>
              <button
                onClick={() => { setShowTopUp(false); setSelectedAmount(null); setCustomAmount(''); }}
                className="h-10 w-10 rounded-xl flex items-center justify-center active:scale-90"
                style={{ backgroundColor: `${textColor}08` }}
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-6">
              {/* Quick amounts */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-[0.3em] ml-1 mb-3 block opacity-40">Montos Rápidos</label>
                <div className="grid grid-cols-4 gap-2">
                  {[500, 1000, 2000, 5000].map(amt => (
                    <button
                      key={amt}
                      onClick={() => { setSelectedAmount(amt); setCustomAmount(''); }}
                      className="h-14 rounded-xl font-black text-[13px] italic transition-all duration-300 border"
                      style={selectedAmount === amt
                        ? { backgroundColor: accentColor, borderColor: accentColor, color: '#000' }
                        : { backgroundColor: `${textColor}05`, borderColor: `${textColor}10`, color: textColor }}
                    >
                      ${amt >= 1000 ? `${amt / 1000}k` : amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom amount */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-[0.3em] ml-1 mb-2 block opacity-40">Otro Monto</label>
                <div className="flex items-center h-14 px-5 rounded-xl border" style={{ backgroundColor: `${textColor}05`, borderColor: `${textColor}10` }}>
                  <span className="text-lg font-black italic mr-2 opacity-30">$</span>
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
                    placeholder="0"
                    className="bg-transparent border-none p-0 text-xl font-black italic placeholder:opacity-20 focus:ring-0 w-full tracking-tighter outline-none"
                    style={{ color: textColor }}
                  />
                </div>
              </div>

              {/* Selected total */}
              {(selectedAmount || customAmount) && (
                <div className="text-center py-4 border-t border-b" style={{ borderColor: `${textColor}10` }}>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Total a cargar</span>
                  <p className="text-[36px] font-black italic tracking-tighter leading-none mt-1" style={{ color: accentColor }}>
                    ${customAmount ? parseFloat(customAmount || '0').toLocaleString() : selectedAmount?.toLocaleString()}
                  </p>
                </div>
              )}

              {/* Payment buttons */}
              <div className="space-y-3">
                {/* MercadoPago */}
                <button
                  onClick={async () => {
                    const amount = customAmount ? parseFloat(customAmount) : (selectedAmount || 0);
                    if (!amount || amount <= 0) { triggerToast('Seleccioná un monto'); return; }
                    if (!store?.id || !user?.id) { triggerToast('Sesión no válida'); return; }
                    setIsProcessing(true);
                    try {
                      let resData: any = null;
                      let resError: any = null;
                      try {
                        const result = await supabase.functions.invoke('create-mp-preference', {
                          body: {
                            amount,
                            description: `Recarga de saldo - ${store.name}`,
                            client_id: user.id,
                            store_id: store.id,
                            type: 'balance_topup'
                          }
                        });
                        resData = result.data;
                        resError = result.error;
                      } catch (invokeErr) {
                        resError = invokeErr;
                      }

                      if (resError) {
                        let msg = 'Error al conectar con Mercado Pago';
                        try { const body = await resError?.context?.json(); if (body?.error) msg = body.error; } catch {}
                        throw new Error(msg);
                      }

                      // Parse response — handle string, Blob, and object
                      if (typeof resData === 'string') {
                        try { resData = JSON.parse(resData); } catch {}
                      } else if (resData instanceof Blob) {
                        try { resData = JSON.parse(await resData.text()); } catch {}
                      }

                      const checkoutUrl = resData?.init_point || resData?.sandbox_init_point;
                      if (checkoutUrl) {
                        window.location.href = checkoutUrl;
                      } else {
                        console.error('[MP TopUp] No init_point. Response:', typeof resData, resData);
                        throw new Error('No se recibió URL de pago');
                      }
                    } catch (err: any) {
                      console.error('MP TopUp Error:', err);
                      triggerToast(err.message || 'Error al procesar pago');
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  disabled={isProcessing || (!selectedAmount && !customAmount)}
                  className="w-full h-16 rounded-2xl font-black uppercase text-[11px] tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#009ee3', color: '#fff' }}
                >
                  {isProcessing ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-lg">credit_card</span>
                      Pagar con MercadoPago
                    </>
                  )}
                </button>

                {/* Cash */}
                <button
                  onClick={() => {
                    const amount = customAmount ? parseFloat(customAmount) : (selectedAmount || 0);
                    if (!amount || amount <= 0) { triggerToast('Seleccioná un monto'); return; }
                    setShowTopUp(false);
                    setSelectedAmount(null);
                    setCustomAmount('');
                    triggerToast(`Acercate a la caja para cargar $${amount.toLocaleString()}`);
                  }}
                  disabled={!selectedAmount && !customAmount}
                  className="w-full h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-3 border disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'transparent', borderColor: `${textColor}15`, color: textColor }}
                >
                  <span className="material-symbols-outlined text-lg">payments</span>
                  Pagar en Efectivo
                </button>
              </div>

              <p className="text-center text-[9px] opacity-30">
                Para pagos en efectivo, acercate a la caja
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════ WALLET TRANSFER MODAL ═══════════════════ */}
      {store && user && (
        <WalletTransferModal
          isOpen={showTransfer}
          onClose={() => setShowTransfer(false)}
          userBalance={user.balance || 0}
          storeId={store.id}
          theme={store.menu_theme || { accentColor, backgroundColor, textColor } as any}
          onSuccess={(newBalance) => {
            if (user && setUser) {
              setUser({ ...user, balance: newBalance });
            }
            triggerToast('¡Transferencia exitosa!');
          }}
        />
      )}

      {/* ═══════════════════ TOAST ═══════════════════ */}
      {toast && (
        <div className="fixed top-[calc(5rem+env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[110] animate-in slide-in-from-top-4 fade-in duration-300">
          <div className="px-6 py-3 rounded-2xl shadow-2xl border backdrop-blur-xl text-sm font-bold"
            style={{ backgroundColor: `${cardColor}F0`, borderColor: `${textColor}10`, color: textColor }}>
            {toast}
          </div>
        </div>
      )}

      {/* EXPLICIT SPACER FOR SCROLL CLEARANCE */}
      <div className="h-64 w-full shrink-0" />
    </div>
  );
};


export default MenuPage;
