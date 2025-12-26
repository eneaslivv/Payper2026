
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartItem, OrderStatus } from '../types';

interface TrackingPageProps {
  cart: CartItem[];
  setHasActiveOrder: (val: boolean) => void;
  status: OrderStatus;
}

const TrackingPage: React.FC<TrackingPageProps> = ({ cart, setHasActiveOrder, status }) => {
  const navigate = useNavigate();
  const [seconds, setSeconds] = useState(12);
  const [minutes, setMinutes] = useState(5);

  const orderTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const pointsEarned = Math.floor(orderTotal * 10);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds(prev => {
        if (prev === 0) {
          if (minutes === 0) return 0;
          setMinutes(m => m - 1);
          return 59;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [minutes]);

  const handleReturn = () => {
    navigate('/');
  };

  const handleFinishAndClear = () => {
    setHasActiveOrder(false);
    navigate('/');
  };

  const getStatusDisplay = () => {
    switch(status) {
      case 'received': return 'Recibido';
      case 'preparing': return 'En Preparación';
      case 'ready': return '¡Listo para Retirar!';
      case 'delivered': return 'Entregado';
      default: return 'Procesando';
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black font-display pb-[env(safe-area-inset-bottom)]">
      <header className="sticky top-0 z-30 flex items-center justify-between pt-[calc(1.5rem+env(safe-area-inset-top))] px-6 pb-6 bg-black/95 backdrop-blur-xl border-b border-white/5">
        <button onClick={handleReturn} className="flex items-center justify-center w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 transition-colors active:scale-90 shadow-xl border border-white/5">
          <span className="material-symbols-outlined text-xl text-slate-400">arrow_back</span>
        </button>
        <h2 className="text-[11px] font-black tracking-[0.4em] uppercase italic text-white/50">Orden #4829</h2>
        <div className="w-12"></div>
      </header>

      <main className="flex-1 flex flex-col items-center w-full p-4 overflow-y-auto no-scrollbar">
        <div className="px-6 pt-10 pb-10 text-center w-full">
          <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.25em] mb-8">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_#36e27b]"></span>
            {getStatusDisplay()}
          </div>
          <h1 className="text-[36px] font-black tracking-tighter text-white uppercase italic leading-[0.9] mb-4">
            {status === 'ready' ? '¡Tu café te\nespera!' : 'Tu café se está\ncreando'}
          </h1>
        </div>

        <div className="w-full px-6 mb-12 flex justify-center gap-8">
            <div className="flex flex-col items-center">
              <span className="text-5xl font-black text-white italic tabular-nums">{String(minutes).padStart(2, '0')}</span>
              <span className="text-[9px] font-black text-slate-700 uppercase tracking-[0.4em] mt-3">Minutos</span>
            </div>
            <div className="text-4xl font-black text-slate-800 animate-pulse">:</div>
            <div className="flex flex-col items-center">
              <span className="text-5xl font-black text-primary italic tabular-nums">{String(seconds).padStart(2, '0')}</span>
              <span className="text-[9px] font-black text-slate-700 uppercase tracking-[0.4em] mt-3">Segundos</span>
            </div>
        </div>

        <div className="w-full mb-12">
          <div className="bg-white/[0.02] rounded-[3.5rem] p-10 shadow-2xl flex flex-col items-center gap-10 border border-white/5 relative overflow-hidden">
            <div className="relative p-6 bg-white rounded-[3rem] shadow-[0_30px_80px_rgba(0,0,0,0.8)]">
              <div className="w-36 h-36 bg-white">
                <img 
                  src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=order_4829&color=000" 
                  alt="Código QR" 
                  className="w-full h-full object-contain opacity-90"
                />
              </div>
            </div>

            <div className="flex flex-col items-center text-center">
              <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic mb-2">Escanea para Retirar</h3>
              <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest leading-relaxed max-w-[220px]">Presenta este código al barista para recibir tu dosis diaria.</p>
            </div>
            
            <div className="w-full bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl fill-icon">stars</span>
                  <span className="text-[13px] font-black text-white italic uppercase tracking-tight">+{pointsEarned} Granos sumados</span>
                </div>
                <div className="flex items-center gap-1.5 opacity-50">
                   <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.3em]">Motivo:</span>
                   <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Compra Miembro (Plata)</span>
                </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER ACTIONS REDESIGNED (ALTA PRECISIÓN) */}
      <footer className="fixed bottom-0 left-0 right-0 z-[60] bg-black/95 backdrop-blur-3xl border-t border-white/5 p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] max-w-md mx-auto flex gap-4 shadow-[0_-25px_80px_rgba(0,0,0,1)]">
        <button 
          onClick={handleReturn} 
          className="flex-1 h-20 rounded-full bg-white/[0.03] border border-white/5 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all"
        >
          MENÚ
        </button>
        
        <button 
          onClick={handleReturn} 
          className="group relative flex-[2.5] h-20 rounded-full bg-primary border border-white/20 text-black flex items-center justify-between pl-8 pr-3 shadow-[0_20px_50px_rgba(54,226,123,0.3)] active:scale-[0.97] transition-all overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          
          <div className="flex flex-col items-start leading-none relative z-10">
            <span className="text-[10px] font-black uppercase tracking-tight">SEGUIR</span>
            <span className="text-[10px] font-black uppercase tracking-tight opacity-40 italic">EXPLORANDO</span>
          </div>

          <div className="flex items-center gap-4 relative z-10">
            <div className="h-10 w-[1px] bg-black/10"></div>
            <div className="w-14 h-14 rounded-full bg-black text-primary flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined font-black text-[28px]">arrow_forward</span>
            </div>
          </div>
        </button>
      </footer>
      
      <button 
        onClick={handleFinishAndClear}
        className="fixed bottom-40 left-1/2 -translate-x-1/2 opacity-20 text-[8px] font-black uppercase tracking-widest pointer-events-auto"
      >
        Limpiar Orden (Simulación)
      </button>
    </div>
  );
};

export default TrackingPage;
