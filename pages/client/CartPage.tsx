import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLayoutEffect } from 'react';
import { useClient } from '../../contexts/ClientContext'; // Import context

const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { cart, removeFromCart, updateQuantity, isRedeemingPoints, setIsRedeemingPoints, store, user } = useClient();

  // Theme support
  const theme = store?.menu_theme || {};
  const accentColor = theme.accentColor || '#36e27b';
  const backgroundColor = theme.backgroundColor || '#000000';
  const textColor = theme.textColor || '#FFFFFF';
  const surfaceColor = theme.surfaceColor || '#141714';

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discount = isRedeemingPoints ? 2.00 : 0;
  const total = Math.max(0, subtotal - discount);
  const pointsToEarn = isRedeemingPoints ? 0 : Math.floor(total * 10);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    const raf = window.requestAnimationFrame(() => window.scrollTo(0, 0));
    const timeout = window.setTimeout(() => window.scrollTo(0, 0), 50);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
    };
  }, []);

  return (
    <div
      className="flex flex-col min-h-screen pb-40 transition-colors duration-500"
      style={{ backgroundColor, color: textColor }}
    >
      <header
        className="sticky top-0 z-50 flex items-center pt-[calc(1rem+env(safe-area-inset-top))] px-6 pb-4 justify-between border-b backdrop-blur-xl"
        style={{
          backgroundColor: `${backgroundColor}E6`,
          borderColor: `${textColor}0D`
        }}
      >
        <button
          onClick={() => navigate(-1)}
          className="flex size-12 items-center justify-center rounded-full transition-colors active:scale-90"
          style={{ backgroundColor: `${textColor}0D`, color: textColor }}
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-base font-black tracking-tight uppercase italic pr-12" style={{ color: textColor }}>Tu Bolsa</h2>
      </header>

      <main className="flex-1 p-6 flex flex-col gap-6">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center mb-8 border"
              style={{
                backgroundColor: `${textColor}05`,
                borderColor: `${textColor}0D`
              }}
            >
              <span className="material-symbols-outlined text-5xl opacity-50" style={{ color: textColor }}>shopping_cart</span>
            </div>
            <h3 className="text-2xl font-black uppercase italic tracking-tighter mb-2" style={{ color: textColor }}>Tu bolsa está vacía</h3>
            <button
              onClick={() => navigate(`/m/${slug}`)}
              className="mt-8 text-[10px] font-black uppercase tracking-[0.3em] border px-12 py-5 rounded-full active:scale-95 transition-all"
              style={{ color: accentColor, borderColor: `${accentColor}33` }}
            >
              Explorar Menú
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5">
              {cart.map((item, idx) => (
                <div
                  key={`${item.id}-${item.size}-${idx}`}
                  className="flex flex-col p-6 rounded-[2.5rem] border shadow-2xl"
                  style={{
                    backgroundColor: `${surfaceColor}40`,
                    borderColor: `${textColor}0D`
                  }}
                >
                  <div className="flex gap-5">
                    <div
                      className="bg-no-repeat rounded-[1.5rem] size-[90px] shrink-0 border shadow-2xl"
                      style={{
                        backgroundImage: `url(${item.image})`,
                        backgroundSize: 'contain',
                        backgroundPosition: 'top center',
                        backgroundColor,
                        borderColor: `${textColor}1A`
                      }}
                    ></div>
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="text-[17px] font-black uppercase italic truncate tracking-tight" style={{ color: textColor }}>{item.name}</p>
                        <button onClick={() => removeFromCart(item.id, item.size)} className="hover:text-red-500 transition-colors -mt-1 -mr-1 p-2" style={{ color: `${textColor}80` }}>
                          <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest mt-1 opacity-60" style={{ color: textColor }}>{item.variant_id && item.variants?.find(v => v.id === item.variant_id)?.name}{item.addon_ids?.length ? ` • ${item.addon_ids.map(aid => item.addons?.find(a => a.id === aid)?.name || '').filter(Boolean).join(', ')}` : ''}</p>

                      <div className="flex items-center justify-between mt-4">
                        <p className="text-lg font-black italic" style={{ color: textColor }}>${item.price.toFixed(2)}</p>
                        <div
                          className="flex items-center gap-4 rounded-full p-1 border"
                          style={{
                            backgroundColor: `${textColor}05`,
                            borderColor: `${textColor}0D`
                          }}
                        >
                          <button onClick={() => updateQuantity(item.id, -1, item.size)} className="size-10 flex items-center justify-center rounded-full transition-colors opacity-50 hover:opacity-100" style={{ color: textColor }}><span className="material-symbols-outlined text-sm">remove</span></button>
                          <span className="text-xs font-black w-4 text-center tabular-nums" style={{ color: textColor }}>{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, 1, item.size)}
                            className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                            style={{ color: accentColor }}
                          >
                            <span className="material-symbols-outlined text-sm">add</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Solo mostrar si el usuario tiene 50+ puntos de fidelidad */}
            {user && user.points >= 50 && (
              <div className="mt-4">
                <div
                  className="flex items-center justify-between gap-6 rounded-[2.5rem] border p-8 shadow-2xl"
                  style={{ borderColor: `${accentColor}33`, backgroundColor: `${accentColor}0D` }}
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined fill-icon" style={{ fontSize: '24px', color: accentColor }}>stars</span>
                      <p className="text-[15px] font-black uppercase italic tracking-tight" style={{ color: textColor }}>Usar Puntos</p>
                    </div>
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-60" style={{ color: textColor }}>Canjear 50 puntos por $2.00 de descuento</p>
                  </div>
                  <label
                    className={`relative flex h-9 w-16 shrink-0 cursor-pointer items-center rounded-full p-1.5 transition-all duration-500 ${isRedeemingPoints ? 'shadow-2xl' : ''}`}
                    style={{
                      backgroundColor: isRedeemingPoints ? accentColor : `${textColor}1A`,
                      boxShadow: isRedeemingPoints ? `0 0 20px ${accentColor}4D` : 'none'
                    }}
                  >
                    <input type="checkbox" className="sr-only" checked={isRedeemingPoints} onChange={() => setIsRedeemingPoints(!isRedeemingPoints)} />
                    <div className={`h-6 w-6 rounded-full shadow-xl transition-transform duration-500 ${isRedeemingPoints ? 'translate-x-7' : 'translate-x-0'}`} style={{ backgroundColor: isRedeemingPoints ? '#FFFFFF' : `${textColor}66` }}></div>
                  </label>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {cart.length > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[60] backdrop-blur-2xl px-5 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] max-w-md mx-auto"
          style={{
            backgroundColor: `${backgroundColor}CC`,
          }}
        >
          {/* Soft top fade instead of hard border */}
          <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${textColor}0A, transparent)` }}></div>

          <div className="flex flex-col gap-4">
            {/* Compact summary row */}
            <div className="flex justify-between items-center px-2">
              <div className="flex items-center gap-2.5">
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-40" style={{ color: textColor }}>Subtotal</span>
                {pointsToEarn > 0 && (
                  <span className="flex items-center gap-1 opacity-60">
                    <span className="material-symbols-outlined text-[11px] fill-icon" style={{ color: accentColor }}>stars</span>
                    <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: accentColor }}>+{pointsToEarn}</span>
                  </span>
                )}
              </div>
              <span className="text-sm font-bold tracking-tight opacity-70" style={{ color: textColor }}>${subtotal.toFixed(2)}</span>
            </div>

            {/* Main CTA button - compact and elegant */}
            <button
              onClick={() => navigate(`/m/${slug}/checkout`)}
              className="group relative w-full active:scale-[0.98] transition-all duration-300 text-black font-black h-[3.75rem] rounded-[1.25rem] flex items-center justify-between pl-7 pr-2.5 overflow-hidden"
              style={{ backgroundColor: accentColor }}
            >
              <div className="flex items-center gap-3 relative z-10">
                <span className="text-[13px] font-black uppercase tracking-tight">Pagar</span>
                <span className="text-[13px] font-black opacity-50 tracking-tight">${total.toFixed(2)}</span>
              </div>

              <div
                className="w-12 h-12 rounded-[0.875rem] flex items-center justify-center bg-black/15 transition-all group-hover:bg-black/20 relative z-10"
              >
                <span className="material-symbols-outlined font-bold text-[22px]">arrow_forward</span>
              </div>
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/5 to-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPage;
