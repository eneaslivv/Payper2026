
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartItem } from '../types';

interface CheckoutPageProps {
  cart: CartItem[];
  isRedeemingPoints: boolean;
  clearCart: () => void;
  setHasActiveOrder: (val: boolean) => void;
  tableNumber: string | null;
}

type PaymentMethodType = 'wallet' | 'mercadopago';

const CheckoutPage: React.FC<CheckoutPageProps> = ({ cart, isRedeemingPoints, clearCart, setHasActiveOrder, tableNumber: initialTable }) => {
  const navigate = useNavigate();
  const [deliveryMode, setDeliveryMode] = useState<'local' | 'takeout'>(initialTable ? 'local' : 'takeout');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('wallet');
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  
  // Gestión de ubicación dinámica
  const [currentTable, setCurrentTable] = useState(initialTable || '05');
  const [currentBar, setCurrentBar] = useState('01');
  const [isEditingLocation, setIsEditingLocation] = useState(false);
  const [tempValue, setTempValue] = useState('');
  
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discount = isRedeemingPoints ? 2.00 : 0;
  const tax = subtotal * 0.08;
  const total = subtotal + tax - discount;

  const handlePlaceOrder = () => {
    setIsProcessingPayment(true);
    setTimeout(() => {
      setHasActiveOrder(true);
      clearCart();
      navigate('/tracking');
    }, 1800);
  };

  const saveLocation = () => {
    if (tempValue.trim()) {
      if (deliveryMode === 'local') {
        setCurrentTable(tempValue.padStart(2, '0'));
      } else {
        setCurrentBar(tempValue.padStart(2, '0'));
      }
      setIsEditingLocation(false);
    }
  };

  const toggleLocationEdit = () => {
    setTempValue(deliveryMode === 'local' ? currentTable : currentBar);
    setIsEditingLocation(true);
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden pb-48 bg-background-dark font-display">
      {/* HEADER AJUSTADO A SAFE AREA TOP */}
      <header className="sticky top-0 z-50 flex items-center justify-between bg-black/95 pt-[calc(1.5rem+env(safe-area-inset-top))] px-6 pb-6 backdrop-blur-2xl border-b border-white/5">
        <button onClick={() => navigate(-1)} className="flex size-12 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-all active:scale-90 group border border-white/5">
          <span className="material-symbols-outlined text-slate-500 group-active:scale-90">arrow_back</span>
        </button>
        <h2 className="flex-1 text-center text-[10px] font-black tracking-[0.5em] uppercase pr-12 italic text-white/40">Finalizar Orden</h2>
      </header>

      <main className="flex-1 py-8">
        {/* SECCIÓN ENTREGA CON INDICADOR DINÁMICO */}
        <section className="px-6 mb-12">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-700">Modo de Entrega</h3>
            
            <div className="relative flex items-center">
              {isEditingLocation ? (
                <div className="flex items-center gap-2 bg-white/5 p-1.5 pl-4 rounded-full border border-primary/40 animate-in zoom-in-95 duration-300">
                  <input 
                    autoFocus
                    type="number"
                    value={tempValue}
                    onChange={(e) => setTempValue(e.target.value)}
                    onBlur={saveLocation}
                    onKeyDown={(e) => e.key === 'Enter' && saveLocation()}
                    className="bg-transparent border-none p-0 w-12 text-primary font-black italic text-xs focus:ring-0 text-center"
                  />
                  <button onClick={saveLocation} className="w-8 h-8 rounded-full bg-primary text-black flex items-center justify-center shadow-[0_0_15px_rgba(54,226,123,0.4)]">
                    <span className="material-symbols-outlined text-sm font-black">check</span>
                  </button>
                </div>
              ) : (
                <button 
                  onClick={toggleLocationEdit}
                  className="flex items-center gap-3 bg-primary/10 px-5 py-2.5 rounded-full border border-primary/20 active:scale-95 transition-all group/loc"
                >
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_#36e27b]"></span>
                  <span className="text-[10px] font-black text-primary uppercase tracking-widest italic leading-none">
                    {deliveryMode === 'local' ? `MESA ${currentTable}` : `BARRA ${currentBar}`}
                  </span>
                  <span className="material-symbols-outlined text-[14px] text-primary/30 group-hover/loc:text-primary transition-colors">edit</span>
                </button>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-5">
            <button 
              onClick={() => { setDeliveryMode('local'); setIsEditingLocation(false); }}
              className={`relative flex flex-col items-center justify-center h-48 rounded-[2.5rem] border-2 transition-all duration-700 overflow-hidden active:scale-95 ${
                deliveryMode === 'local' 
                ? 'border-primary bg-primary/[0.04] shadow-[0_20px_50px_rgba(54,226,123,0.15)]' 
                : 'border-white/5 bg-white/[0.01] opacity-30 grayscale'
              }`}
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 blur-3xl rounded-full -mr-12 -mt-12"></div>
              <span className={`material-symbols-outlined text-[44px] mb-4 transition-all duration-700 ${deliveryMode === 'local' ? 'text-primary fill-icon scale-110' : 'text-slate-700 scale-90'}`}>local_cafe</span>
              <span className={`text-[11px] font-black uppercase tracking-[0.2em] italic ${deliveryMode === 'local' ? 'text-primary' : 'text-slate-600'}`}>Consumo Local</span>
              {deliveryMode === 'local' && <div className="absolute bottom-4 w-6 h-1 bg-primary rounded-full shadow-[0_0_10px_#36e27b]"></div>}
            </button>

            <button 
              onClick={() => { setDeliveryMode('takeout'); setIsEditingLocation(false); }}
              className={`relative flex flex-col items-center justify-center h-48 rounded-[2.5rem] border-2 transition-all duration-700 overflow-hidden active:scale-95 ${
                deliveryMode === 'takeout' 
                ? 'border-primary bg-primary/[0.04] shadow-[0_20px_50px_rgba(54,226,123,0.15)]' 
                : 'border-white/5 bg-white/[0.01] opacity-30 grayscale'
              }`}
            >
              <span className={`material-symbols-outlined text-[44px] mb-4 transition-all duration-700 ${deliveryMode === 'takeout' ? 'text-primary fill-icon scale-110' : 'text-slate-700 scale-90'}`}>shopping_bag</span>
              <span className={`text-[11px] font-black uppercase tracking-[0.2em] italic ${deliveryMode === 'takeout' ? 'text-primary' : 'text-slate-600'}`}>Para llevar</span>
              {deliveryMode === 'takeout' && <div className="absolute bottom-4 w-6 h-1 bg-primary rounded-full shadow-[0_0_10px_#36e27b]"></div>}
            </button>
          </div>
        </section>

        {/* MÉTODO DE PAGO REFORZADO */}
        <section className="px-6 mb-12">
          <h3 className="mb-6 text-[10px] font-black uppercase tracking-[0.4em] text-slate-700 px-1">Método de Pago</h3>
          <div className="flex flex-col gap-4">
            <div 
              onClick={() => setPaymentMethod('wallet')}
              className={`group flex cursor-pointer items-center justify-between rounded-[2.8rem] bg-white/[0.02] p-6 active:scale-[0.98] transition-all duration-500 border-2 ${
                paymentMethod === 'wallet' ? 'border-primary shadow-2xl bg-primary/[0.03]' : 'border-white/5 opacity-50'
              }`}
            >
              <div className="flex items-center gap-6">
                <div className={`flex size-16 items-center justify-center rounded-[1.4rem] ${paymentMethod === 'wallet' ? 'bg-primary text-black shadow-xl' : 'bg-white/5 text-slate-700'}`}>
                  <span className="material-symbols-outlined text-3xl font-black">account_balance_wallet</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-black text-[15px] uppercase tracking-tight italic text-white">Brew Wallet</span>
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Saldo Personal</span>
                </div>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-700 ${paymentMethod === 'wallet' ? 'bg-primary text-black scale-100' : 'bg-white/5 text-transparent scale-50'}`}>
                <span className="material-symbols-outlined text-xl font-black">check</span>
              </div>
            </div>

            <div 
              onClick={() => setPaymentMethod('mercadopago')}
              className={`group flex cursor-pointer items-center justify-between rounded-[2.8rem] bg-white/[0.02] p-6 active:scale-[0.98] transition-all duration-500 border-2 ${
                paymentMethod === 'mercadopago' ? 'border-[#009ee3] shadow-2xl bg-blue-500/[0.03]' : 'border-white/5 opacity-50'
              }`}
            >
              <div className="flex items-center gap-6">
                <div className={`flex size-16 items-center justify-center rounded-[1.4rem] ${paymentMethod === 'mercadopago' ? 'bg-[#009ee3] text-white shadow-xl' : 'bg-white/5 text-slate-700'}`}>
                   <img src="https://img.icons8.com/color/48/000000/mercado-pago.png" alt="MP" className={`w-10 h-10 transition-all ${paymentMethod === 'mercadopago' ? 'brightness-0 invert' : 'grayscale'}`} />
                </div>
                <div className="flex flex-col">
                  <span className="font-black text-[15px] uppercase tracking-tight italic text-white">Mercado Pago</span>
                  <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest mt-1">Plataforma Externa</span>
                </div>
              </div>
              <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-all duration-700 ${paymentMethod === 'mercadopago' ? 'bg-[#009ee3] text-white scale-100' : 'bg-white/5 text-transparent scale-50'}`}>
                <span className="material-symbols-outlined text-xl font-black">check</span>
              </div>
            </div>
          </div>
        </section>

        {/* RESUMEN FINAL */}
        <section className="px-6 mb-16">
          <div className="rounded-[3.5rem] bg-white/[0.02] p-10 border border-white/5 shadow-2xl">
            <div className="flex justify-between py-4">
              <p className="font-black text-slate-600 uppercase tracking-widest text-[11px]">Subtotal</p>
              <p className="font-black italic text-white text-[18px] tracking-tighter">${subtotal.toFixed(2)}</p>
            </div>
            <div className="my-6 h-px w-full bg-white/5"></div>
            <div className="flex justify-between items-end">
              <p className="text-[12px] font-black uppercase tracking-[0.5em] text-white italic">Monto a Pagar</p>
              <p className="text-[48px] font-black tabular-nums tracking-tighter italic text-white leading-none">${total.toFixed(2)}</p>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER ACTION POWER BUTTON - OPTIMIZADO PARA IPHONE */}
      <div className="fixed bottom-0 left-0 right-0 z-[60] p-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] bg-black/95 backdrop-blur-3xl border-t border-white/5 flex justify-center shadow-[0_-25px_80px_rgba(0,0,0,1)]">
        <div className="w-full max-w-md">
          <button 
            onClick={handlePlaceOrder}
            disabled={isProcessingPayment}
            className={`group relative flex h-24 w-full items-center justify-between pl-12 pr-5 transition-all duration-500 active:scale-[0.97] shadow-[0_25px_60px_rgba(0,0,0,0.6)] overflow-hidden disabled:opacity-50 rounded-full border border-white/20 ${
              paymentMethod === 'mercadopago' ? 'bg-[#009ee3] text-white' : 'bg-primary text-black'
            }`}
          >
            <div className="relative z-10 flex flex-col items-start leading-none text-left">
               <span className="text-[14px] font-black uppercase tracking-tight">
                 {isProcessingPayment ? 'VERIFICANDO...' : 'CONFIRMAR'}
               </span>
               <span className="text-[14px] font-black uppercase tracking-tight opacity-50 italic">PAGO SEGURO</span>
            </div>

            <div className="flex items-center gap-6 relative z-10">
              <div className={`h-12 w-[1px] ${paymentMethod === 'mercadopago' ? 'bg-white/20' : 'bg-black/10'}`}></div>
              <div className="flex items-center gap-4">
                <span className="text-[28px] font-black italic tracking-tighter tabular-nums leading-none">${total.toFixed(2)}</span>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all group-hover:scale-105 shadow-2xl ${paymentMethod === 'mercadopago' ? 'bg-white text-[#009ee3]' : 'bg-black text-primary'}`}>
                  {isProcessingPayment ? (
                    <span className="material-symbols-outlined animate-spin text-2xl font-black">refresh</span>
                  ) : (
                    <span className="material-symbols-outlined font-black text-[32px]">arrow_forward</span>
                  )}
                </div>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
