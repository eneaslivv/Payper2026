import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useClient } from '../../contexts/ClientContext';

const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { cart, removeFromCart, updateQuantity, isRedeemingPoints, setIsRedeemingPoints, store, user } = useClient();

  // Theme support
  const theme = store?.menu_theme || {};
  const accentColor = theme.accentColor || '#36e27b';
  const backgroundColor = theme.backgroundColor || '#000000';
  const textColor = theme.textColor || '#FFFFFF';

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discount = isRedeemingPoints ? 2.00 : 0;
  const total = Math.max(0, subtotal - discount);
  const pointsToEarn = isRedeemingPoints ? 0 : Math.floor(total * 10);

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

      <main className="p-5 flex flex-col gap-3">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-6 border"
              style={{
                backgroundColor: `${textColor}05`,
                borderColor: `${textColor}0D`
              }}
            >
              <span className="material-symbols-outlined text-4xl opacity-40" style={{ color: textColor }}>shopping_cart</span>
            </div>
            <h3 className="text-lg font-black uppercase italic tracking-tighter mb-2" style={{ color: textColor }}>Tu bolsa está vacía</h3>
            <button
              onClick={() => navigate(`/m/${slug}`)}
              className="mt-6 text-[10px] font-black uppercase tracking-[0.3em] border px-10 py-4 rounded-full active:scale-95 transition-all"
              style={{ color: accentColor, borderColor: `${accentColor}33` }}
            >
              Explorar Menú
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2.5">
              {cart.map((item, idx) => (
                <div
                  key={`${item.id}-${item.size}-${idx}`}
                  className="flex items-center gap-3.5 px-4 py-3 rounded-2xl border"
                  style={{
                    backgroundColor: `${textColor}06`,
                    borderColor: `${textColor}0A`
                  }}
                >
                  <div
                    className="bg-no-repeat rounded-xl size-14 shrink-0 border"
                    style={{
                      backgroundImage: `url(${item.image})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundColor: `${textColor}08`,
                      borderColor: `${textColor}0A`
                    }}
                  ></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold truncate" style={{ color: textColor }}>{item.name}</p>
                        {(item.variant_id || item.addon_ids?.length) && (
                          <p className="text-[9px] font-medium uppercase tracking-wider mt-0.5 opacity-40" style={{ color: textColor }}>
                            {item.variant_id && item.variants?.find(v => v.id === item.variant_id)?.name}{item.addon_ids?.length ? ` · ${item.addon_ids.map(aid => item.addons?.find(a => a.id === aid)?.name || '').filter(Boolean).join(', ')}` : ''}
                          </p>
                        )}
                      </div>
                      <button onClick={() => removeFromCart(item.id, item.size)} className="opacity-30 hover:opacity-80 transition-opacity -mr-1 p-1" style={{ color: textColor }}>
                        <span className="material-symbols-outlined text-[16px]">close</span>
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-sm font-bold" style={{ color: textColor }}>${item.price.toFixed(2)}</p>
                      <div
                        className="flex items-center gap-2 rounded-full px-1 py-0.5 border"
                        style={{
                          backgroundColor: `${textColor}05`,
                          borderColor: `${textColor}0A`
                        }}
                      >
                        <button onClick={() => updateQuantity(item.id, -1, item.size)} className="size-7 flex items-center justify-center rounded-full transition-colors opacity-40 hover:opacity-80" style={{ color: textColor }}><span className="material-symbols-outlined text-[14px]">remove</span></button>
                        <span className="text-[11px] font-bold w-3 text-center tabular-nums" style={{ color: textColor }}>{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, 1, item.size)}
                          className="size-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                          style={{ color: accentColor }}
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Solo mostrar si el usuario tiene 50+ puntos de fidelidad */}
            {user && user.points >= 50 && (
              <div
                className="flex items-center justify-between gap-4 rounded-2xl border px-5 py-4"
                style={{ borderColor: `${accentColor}20`, backgroundColor: `${accentColor}08` }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="material-symbols-outlined fill-icon text-lg" style={{ color: accentColor }}>stars</span>
                  <div>
                    <p className="text-[12px] font-bold" style={{ color: textColor }}>Usar Puntos</p>
                    <p className="text-[9px] font-medium uppercase tracking-wider opacity-40" style={{ color: textColor }}>50 pts = $2.00 off</p>
                  </div>
                </div>
                <label
                  className={`relative flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full p-1 transition-all duration-500`}
                  style={{
                    backgroundColor: isRedeemingPoints ? accentColor : `${textColor}1A`,
                    boxShadow: isRedeemingPoints ? `0 0 12px ${accentColor}33` : 'none'
                  }}
                >
                  <input type="checkbox" className="sr-only" checked={isRedeemingPoints} onChange={() => setIsRedeemingPoints(!isRedeemingPoints)} />
                  <div className={`h-5 w-5 rounded-full shadow-md transition-transform duration-500 ${isRedeemingPoints ? 'translate-x-5' : 'translate-x-0'}`} style={{ backgroundColor: isRedeemingPoints ? '#FFFFFF' : `${textColor}66` }}></div>
                </label>
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
