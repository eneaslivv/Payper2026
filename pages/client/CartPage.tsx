import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useClient } from '../../contexts/ClientContext'; // Import context

const CartPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { cart, removeFromCart, updateQuantity, isRedeemingPoints, setIsRedeemingPoints } = useClient();

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discount = isRedeemingPoints ? 2.00 : 0;
  const total = Math.max(0, subtotal - discount);
  const pointsToEarn = isRedeemingPoints ? 0 : Math.floor(total * 10);

  return (
    <div className="flex flex-col min-h-screen pb-48 bg-black">
      <header className="sticky top-0 z-50 flex items-center bg-black/90 pt-[calc(1rem+env(safe-area-inset-top))] px-6 pb-4 justify-between border-b border-white/5 backdrop-blur-xl">
        <button onClick={() => navigate(-1)} className="text-white flex size-12 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors active:scale-90">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-white text-base font-black tracking-tight uppercase italic pr-12">Tu Bolsa</h2>
      </header>

      <main className="flex-1 p-6 flex flex-col gap-6">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 px-8 text-center">
            <div className="w-24 h-24 rounded-full bg-white/[0.03] flex items-center justify-center mb-8 border border-white/5">
              <span className="material-symbols-outlined text-slate-800 text-5xl">shopping_cart</span>
            </div>
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">Tu bolsa está vacía</h3>
            <button onClick={() => navigate(`/m/${slug}`)} className="mt-8 text-primary text-[10px] font-black uppercase tracking-[0.3em] border border-primary/20 px-12 py-5 rounded-full active:scale-95 transition-all">Explorar Menú</button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-5">
              {cart.map((item, idx) => (
                <div key={`${item.id}-${item.size}-${idx}`} className="flex flex-col bg-white/[0.02] p-6 rounded-[2.5rem] border border-white/5 shadow-2xl">
                  <div className="flex gap-5">
                    <div className="bg-center bg-cover rounded-[1.5rem] size-[90px] shrink-0 border border-white/10 shadow-2xl" style={{ backgroundImage: `url(${item.image})` }}></div>
                    <div className="flex-1 flex flex-col justify-center min-w-0">
                      <div className="flex justify-between items-start">
                        <p className="text-white text-[17px] font-black uppercase italic truncate tracking-tight">{item.name}</p>
                        <button onClick={() => removeFromCart(item.id, item.size || 'Chico')} className="text-slate-800 hover:text-red-500 transition-colors -mt-1 -mr-1 p-2">
                          <span className="material-symbols-outlined text-xl">close</span>
                        </button>
                      </div>
                      <p className="text-slate-600 text-[10px] font-black uppercase tracking-widest mt-1">{item.size} {item.customizations?.length ? `• ${item.customizations.join(', ')}` : ''}</p>

                      <div className="flex items-center justify-between mt-4">
                        <p className="text-white text-lg font-black italic">${item.price.toFixed(2)}</p>
                        <div className="flex items-center gap-4 bg-white/[0.05] rounded-full p-1 border border-white/5">
                          <button onClick={() => updateQuantity(item.id, -1, item.size || 'Chico')} className="size-10 flex items-center justify-center rounded-full text-slate-500 hover:text-white transition-colors"><span className="material-symbols-outlined text-sm">remove</span></button>
                          <span className="text-white text-xs font-black w-4 text-center tabular-nums">{item.quantity}</span>
                          <button onClick={() => updateQuantity(item.id, 1, item.size || 'Chico')} className="size-10 flex items-center justify-center rounded-full text-primary hover:text-white transition-colors"><span className="material-symbols-outlined text-sm">add</span></button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between gap-6 rounded-[2.5rem] border border-primary/20 bg-primary/5 p-8 shadow-2xl">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary fill-icon" style={{ fontSize: '24px' }}>stars</span>
                    <p className="text-white text-[15px] font-black uppercase italic tracking-tight">Redimir 50 Granos</p>
                  </div>
                  <p className="text-slate-600 text-[9px] font-black uppercase tracking-widest">Ahorra $2.00 en esta compra</p>
                </div>
                <label className={`relative flex h-9 w-16 shrink-0 cursor-pointer items-center rounded-full p-1.5 transition-all duration-500 ${isRedeemingPoints ? 'bg-primary shadow-[0_0_20px_rgba(54,226,123,0.3)]' : 'bg-white/10'}`}>
                  <input type="checkbox" className="sr-only" checked={isRedeemingPoints} onChange={() => setIsRedeemingPoints(!isRedeemingPoints)} />
                  <div className={`h-6 w-6 rounded-full bg-white shadow-xl transition-transform duration-500 ${isRedeemingPoints ? 'translate-x-7' : 'translate-x-0'}`}></div>
                </label>
              </div>
            </div>
          </>
        )}
      </main>

      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] bg-black/95 backdrop-blur-3xl border-t border-white/5 px-8 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] max-w-md mx-auto shadow-[0_-30px_60px_rgba(0,0,0,0.8)]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center px-1">
                <span className="text-slate-600 text-[10px] font-black uppercase tracking-widest">Subtotal</span>
                <span className="text-white text-base font-black italic tracking-tighter">${subtotal.toFixed(2)}</span>
              </div>
              <div className="h-px bg-white/5 my-2"></div>
              <div className="flex justify-between items-end px-1">
                <div className="flex flex-col">
                  <span className="text-white text-xl font-black uppercase italic leading-none tracking-tighter">Total</span>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary fill-icon">stars</span>
                    <span className={`text-[9px] font-black uppercase tracking-widest ${pointsToEarn > 0 ? 'text-primary' : 'text-slate-700'}`}>
                      {pointsToEarn > 0 ? `Ganarás ${pointsToEarn} granos` : 'Sin puntos adicionales'}
                    </span>
                  </div>
                </div>
                <span className="text-white text-[44px] font-black italic tracking-tighter tabular-nums leading-none">${total.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => navigate(`/m/${slug}/checkout`)}
              className="group relative w-full bg-primary active:scale-[0.97] transition-all duration-500 text-black font-black h-24 rounded-full flex items-center justify-between pl-12 pr-5 shadow-[0_20px_50px_rgba(54,226,123,0.35)] overflow-hidden border border-white/20"
            >
              <div className="flex flex-col items-start leading-none relative z-10">
                <span className="text-[14px] font-black uppercase tracking-tight">Proceder al</span>
                <span className="text-[14px] font-black uppercase tracking-tight opacity-50">Pago Seguro</span>
              </div>

              <div className="flex items-center gap-6 relative z-10">
                <div className="h-12 w-[1px] bg-black/10"></div>
                <div className="w-16 h-16 rounded-full flex items-center justify-center bg-black text-primary transition-all group-hover:scale-105 shadow-2xl">
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
