
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrderStatus } from '../types';

interface ActiveOrderWidgetProps {
  hasActiveOrder: boolean;
  status: OrderStatus;
  isHubOpen: boolean;
  setIsHubOpen: (val: boolean) => void;
  tableNumber: string | null;
}

const ActiveOrderWidget: React.FC<ActiveOrderWidgetProps> = ({ hasActiveOrder, status, isHubOpen, setIsHubOpen, tableNumber }) => {
  const navigate = useNavigate();
  const [isPolling, setIsPolling] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [serviceFeedback, setServiceFeedback] = useState<string | null>(null);
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');

  // Efecto visual de "Polling" para simular sincronización con el servidor
  useEffect(() => {
    if (!hasActiveOrder) return;
    const pollInterval = setInterval(() => {
      setIsPolling(true);
      setTimeout(() => setIsPolling(false), 800);
    }, 5000); // Pulso de sincronización cada 5s

    return () => clearInterval(pollInterval);
  }, [hasActiveOrder]);

  const handleServiceRequest = (type: 'waiter' | 'bill' | 'help') => {
    const messages = {
      waiter: 'Avisamos al barista, ya se acerca 🙌',
      bill: 'Estamos preparando tu cuenta 🧾',
      help: 'En breve te asistimos ☕'
    };
    setServiceFeedback(messages[type]);
    if (window.navigator.vibrate) window.navigator.vibrate(50);
    setTimeout(() => setServiceFeedback(null), 4000);
  };

  const getStatusInfo = () => {
    switch(status) {
      case 'received': return { label: 'RECIBIDO', icon: 'schedule', color: '#60a5fa', sub: 'Confirmando orden...' };
      case 'preparing': return { label: 'PREPARANDO', icon: 'coffee_maker', color: '#fbbf24', sub: 'En proceso artesanal.' };
      case 'ready': return { label: '¡LISTO!', icon: 'auto_awesome', color: '#36e27b', sub: 'Retira en barra.' };
      case 'delivered': return { label: 'ENTREGADO', icon: 'task_alt', color: '#36e27b', sub: '¡Que lo disfrutes!' };
    }
  };

  const statusInfo = getStatusInfo();

  const handleConfirmTip = (amount: number) => {
    setTipAmount(amount);
    setShowTipModal(false);
    setServiceFeedback('¡Gracias! Propina registrada 🙌');
    setTimeout(() => setServiceFeedback(null), 3000);
  };

  const handleGoToTracking = () => {
    if (!hasActiveOrder) {
      setServiceFeedback('No tienes un pedido activo en curso.');
      setTimeout(() => setServiceFeedback(null), 3000);
      return;
    }
    setIsHubOpen(false);
    navigate('/tracking');
  };

  return (
    <>
      {!isHubOpen && hasActiveOrder && (
        <div className="fixed bottom-[calc(7rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-4 animate-in slide-in-from-bottom-6 duration-500">
          <div 
            onClick={() => setIsHubOpen(true)}
            className="w-full flex items-center gap-4 p-4 rounded-[2.5rem] bg-surface-dark/95 backdrop-blur-xl border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.6)] active:scale-[0.98] transition-all cursor-pointer group relative overflow-hidden"
          >
            {/* Indicador de Sincronización (Polling Visual) */}
            <div className={`absolute top-0 left-0 w-full h-[2px] bg-primary/20 transition-all duration-700 ${isPolling ? 'opacity-100' : 'opacity-0'}`}>
              <div className="h-full bg-primary animate-data-stream w-1/3"></div>
            </div>

            <div className="relative shrink-0">
               <div 
                className="w-16 h-16 rounded-[1.2rem] bg-cover bg-center border border-white/10 shadow-inner"
                style={{ backgroundImage: `url('https://lh3.googleusercontent.com/aida-public/AB6AXuD0nRxUsMR75OWlbAOvDDPHs0IUrQ5klyIISikNVRu5hvjvZhGrLkyPk7TCgg8gNlDStbqgyvqO3QKagTSMx58lE-kdEqkDDe5H0SGAHnqeEQb3uk-gkoUfKIQtylgFyAhY3DxZdB5j0fNiYtm0Z8YeoaEz8kfbCzswKF1UiC1gAWq-8-yYFImE_SDhAK9-Lp6J4930Wyv_M4jMKT16EaGaRbUQn52swFIpBJUbprKXBi_NinLpl7tFM9qYjRO4San1Mvo6WK0f1O48')` }}
              ></div>
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0a110b] flex items-center justify-center text-black" style={{ backgroundColor: statusInfo.color }}>
                <span className="material-symbols-outlined text-[8px] font-black">star</span>
              </div>
            </div>
            
            <div className="flex flex-col flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-black text-white uppercase tracking-tighter italic">Pedido: {statusInfo.label}</span>
                <div className={`flex items-center gap-1.5 transition-opacity duration-300 ${isPolling ? 'opacity-100' : 'opacity-0'}`}>
                  <span className="text-[7px] font-black text-primary uppercase tracking-widest animate-pulse italic">Sincronizando...</span>
                </div>
              </div>
              <p className="text-[10px] text-primary font-bold leading-tight tracking-tight truncate opacity-80 uppercase">
                {statusInfo.sub}
              </p>
            </div>
            <div className="pr-2 flex flex-col items-end gap-1">
               <span className="text-[7px] font-black text-slate-700 uppercase tracking-widest italic">Mesa {tableNumber || '00'}</span>
               <span className="material-symbols-outlined text-slate-700 group-hover:text-primary transition-colors text-xl">stat_minus_1</span>
            </div>
          </div>
        </div>
      )}

      {isHubOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setIsHubOpen(false)}>
          <div 
            className="w-full max-w-md bg-[#0a110b] rounded-t-[3.5rem] shadow-2xl animate-in slide-in-from-bottom-10 border-t border-white/5 flex flex-col max-h-[92vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex flex-col items-center py-4">
              <button onClick={() => setIsHubOpen(false)} className="w-12 h-1 bg-white/10 rounded-full mb-4"></button>
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-8 pb-12">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-[32px] font-black text-white italic uppercase tracking-tighter leading-none mb-1">Hub de Orden</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_#36e27b] ${isPolling ? 'animate-ping' : 'animate-pulse'}`}></div>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">Estado: En Tiempo Real • Mesa {tableNumber || '??'}</p>
                  </div>
                </div>
              </div>

              {hasActiveOrder ? (
                <div className="flex gap-2 mb-10 px-2 animate-in slide-in-from-top-2 duration-500">
                  {['REC', 'PREP', 'LISTO', 'FIN'].map((s, i) => {
                    const states = ['received', 'preparing', 'ready', 'delivered'];
                    const isActive = states.indexOf(status) >= i;
                    const isCurrent = states.indexOf(status) === i;
                    return (
                      <div key={s} className="flex-1 flex flex-col gap-2">
                        <div className={`h-1.5 rounded-full transition-all duration-700 ${isActive ? 'bg-primary shadow-[0_0_12px_#36e27b]' : 'bg-white/5'}`}></div>
                        <span className={`text-[8px] font-black uppercase tracking-[0.2em] text-center ${isActive ? (isCurrent ? 'text-primary animate-pulse' : 'text-primary') : 'text-slate-700'}`}>{s}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mb-10 p-6 rounded-[2rem] bg-surface-dark border border-white/5 flex items-center justify-center animate-in slide-in-from-top-2">
                   <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] text-center italic opacity-60">Esperando tu próximo pedido...</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 mb-6">
                <button 
                  onClick={handleGoToTracking}
                  className={`flex flex-col items-center justify-center p-8 rounded-[2.5rem] transition-all gap-3 shadow-[0_15px_40px_rgba(54,226,123,0.1)] group active:scale-95 ${
                    hasActiveOrder 
                    ? 'bg-primary text-black' 
                    : 'bg-surface-dark border border-white/5 text-slate-500 grayscale opacity-50'
                  }`}
                >
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${hasActiveOrder ? 'bg-black/10' : 'bg-white/5'}`}>
                    <span className="material-symbols-outlined text-3xl font-black fill-icon">qr_code_2</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest leading-none">Ver QR Retiro</span>
                </button>

                <button 
                  onClick={() => handleServiceRequest('waiter')}
                  className="flex flex-col items-center justify-center p-8 rounded-[2.5rem] bg-surface-dark border border-white/5 active:scale-95 transition-all gap-3 group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-primary transition-all">
                    <span className="material-symbols-outlined text-3xl">person_alert</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-none">Llamar Barista</span>
                </button>

                <button 
                  onClick={() => handleServiceRequest('bill')}
                  className="flex flex-col items-center justify-center p-8 rounded-[2.5rem] bg-surface-dark border border-white/5 active:scale-95 transition-all gap-3 group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-primary transition-all">
                    <span className="material-symbols-outlined text-3xl">receipt_long</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-none">Pedir Cuenta</span>
                </button>

                <button 
                  onClick={() => setShowTipModal(true)}
                  className="flex flex-col items-center justify-center p-8 rounded-[2.5rem] bg-surface-dark border border-white/5 active:scale-95 transition-all gap-3 group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-primary transition-all">
                    <span className="material-symbols-outlined text-3xl">{tipAmount ? 'verified' : 'volunteer_activism'}</span>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-none">{tipAmount ? `$${tipAmount}` : 'Dar Propina'}</span>
                </button>
              </div>

              <button 
                onClick={() => handleServiceRequest('help')}
                className="w-full py-6 rounded-[2.2rem] bg-white/5 text-slate-500 font-black uppercase text-[10px] tracking-[0.4em] hover:text-white transition-all flex items-center justify-center gap-3 active:scale-95"
              >
                <span>Soporte de Pedido</span>
                <span className="material-symbols-outlined text-base">support_agent</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showTipModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-3xl p-6 animate-in fade-in duration-300">
          <div className="w-full max-w-[340px] bg-surface-dark rounded-[3.5rem] p-10 border border-white/10 shadow-2xl text-center flex flex-col">
            <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">¿Dejar propina?</h3>
            <p className="text-slate-500 text-xs font-medium mb-10 leading-relaxed">Tu gesto ayuda mucho a nuestro equipo.</p>
            <div className="grid grid-cols-2 gap-4 mb-8">
               {[500, 1000, 2000].map(amt => (
                 <button key={amt} onClick={() => handleConfirmTip(amt)} className="h-16 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center font-black text-primary hover:bg-primary hover:text-black transition-all">${amt}</button>
               ))}
               <input type="number" placeholder="Otro" value={customTip} onChange={(e) => setCustomTip(e.target.value)} className="w-full h-16 bg-white/5 border border-white/5 rounded-2xl px-4 text-center text-sm font-black text-white focus:border-primary focus:ring-0 placeholder:text-slate-600 transition-all" />
            </div>
            <button onClick={() => setShowTipModal(false)} className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Ahora no</button>
          </div>
        </div>
      )}

      {serviceFeedback && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[210] w-full max-w-md px-6 pointer-events-none">
          <div className="w-full py-5 bg-primary text-black rounded-2xl animate-in slide-in-from-top-6 font-black text-[11px] text-center shadow-[0_20px_40px_rgba(54,226,123,0.3)] uppercase tracking-widest italic">
            {serviceFeedback}
          </div>
        </div>
      )}
    </>
  );
};

export default ActiveOrderWidget;
