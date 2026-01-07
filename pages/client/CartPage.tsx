import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

  return (
    <div
      className="flex flex-col min-h-screen pb-48 transition-colors duration-500"
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
                    <div className="bg-center bg-cover rounded-[1.5rem] size-[90px] shrink-0 border shadow-2xl" style={{ backgroundImage: `url(${item.image})`, borderColor: `${textColor}1A` }}></div>
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="text-[17px] font-black uppercase italic truncate tracking-tight" style={{ color: textColor }}>{item.name}</p>
                        <button onClick={() => removeFromCart(item.id, item.size || 'Chico')} className="hover:text-red-500 transition-colors -mt-1 -mr-1 p-2" style={{ color: `${textColor}80` }}>
                          <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                      </div>
                      <p className="text-[10px] font-black uppercase tracking-widest mt-1 opacity-60" style={{ color: textColor }}>{item.size} {item.customizations?.length ? `• ${item.customizations.join(', ')}` : ''}</p>

                      <div className="flex items-center justify-between mt-4">
                        <p className="text-lg font-black italic" style={{ color: textColor }}>${item.price.toFixed(2)}</p>
                        <div
                          className="flex items-center gap-4 rounded-full p-1 border"
                          style={{
                            backgroundColor: `${textColor}05`,
                            borderColor: `${textColor}0D`
                          }}
                        >
                          <button onClick={() => updateQuantity(item.id, -1, item.size || 'Chico')} className="size-10 flex items-center justify-center rounded-full transition-colors opacity-50 hover:opacity-100" style={{ color: textColor }}><span className="material-symbols-outlined text-sm">remove</span></button>
                          <span className="text-xs font-black w-4 text-center tabular-nums" style={{ color: textColor }}>{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, 1, item.size || 'Chico')}
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
          className="fixed bottom-0 left-0 right-0 z-[60] backdrop-blur-3xl border-t px-8 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] max-w-md mx-auto shadow-[0_-30px_60px_rgba(0,0,0,0.2)]"
          style={{
            backgroundColor: `${backgroundColor}F2`,
            borderColor: `${textColor}0D`
          }}
        >
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-60" style={{ color: textColor }}>Subtotal</span>
                <span className="text-base font-black italic tracking-tighter" style={{ color: textColor }}>${subtotal.toFixed(2)}</span>
              </div>
              <div className="h-px my-2" style={{ backgroundColor: `${textColor}0D` }}></div>
              <div className="flex justify-between items-end px-1">
                <div className="flex flex-col">
                  <span className="text-xl font-black uppercase italic leading-none tracking-tighter" style={{ color: textColor }}>Total</span>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] fill-icon" style={{ color: accentColor }}>stars</span>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${pointsToEarn > 0 ? '' : 'opacity-60'}`} style={{ color: pointsToEarn > 0 ? accentColor : textColor }}>
                      {pointsToEarn > 0 ? `Ganarás ${pointsToEarn} granos` : 'Sin puntos adicionales'}
                    </span>
                  </div>
                </div>
                <span className="text-[44px] font-black italic tracking-tighter tabular-nums leading-none" style={{ color: textColor }}>${total.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => navigate(`/m/${slug}/checkout`)}
              className="group relative w-full active:scale-[0.97] transition-all duration-500 text-black font-black h-24 rounded-full flex items-center justify-between pl-12 pr-5 shadow-2xl overflow-hidden border border-white/20"
              style={{ backgroundColor: accentColor, boxShadow: `0 20px 50px ${accentColor}59` }}
            >
              <div className="flex flex-col items-start leading-none relative z-10">
                <span className="text-[14px] font-black uppercase tracking-tight">Proceder al</span>
                <span className="text-[14px] font-black uppercase tracking-tight opacity-50">Pago Seguro</span>
              </div>

              <div className="flex items-center gap-6 relative z-10">
                <div className="h-12 w-[1px] bg-black/10"></div>
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center bg-black transition-all group-hover:scale-105 shadow-2xl"
                  style={{ color: accentColor }}
                >
                  <span className="material-symbols-outlined font-black text-[32px]">arrow_forward</span>
                </div>
              </div>
              <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CartPage;
