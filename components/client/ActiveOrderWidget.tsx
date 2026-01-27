import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { OrderStatus } from './types';
import { useClient } from '../../contexts/ClientContext';
import { supabase } from '../../lib/supabase';

interface ActiveOrderWidgetProps {
  hasActiveOrder: boolean;
  status: OrderStatus;
  isHubOpen: boolean;
  setIsHubOpen: (val: boolean) => void;
  tableNumber: string | null;
  activeOrderId: string | null;
  activeOrders?: any[];
  accentColor: string;
}

const ActiveOrderWidget: React.FC<ActiveOrderWidgetProps> = ({ hasActiveOrder, status, isHubOpen, setIsHubOpen, tableNumber, accentColor, activeOrderId, activeOrders = [] }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug } = useParams();
  const { setActiveOrderId, setOrderStatus, store } = useClient();

  // Check if we are on the wallet page to adjust position
  const isWalletPage = location.pathname.includes('/wallet');
  const [isPolling, setIsPolling] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [serviceFeedback, setServiceFeedback] = useState<string | null>(null);
  const [tipAmount, setTipAmount] = useState<number | null>(null);
  const [customTip, setCustomTip] = useState('');

  // Sincronización visual
  useEffect(() => {
    if (!hasActiveOrder) return;
    const pollInterval = setInterval(() => {
      setIsPolling(true);
      setTimeout(() => setIsPolling(false), 800);
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [hasActiveOrder]);

  const handleOrderSwitch = (orderId: string, orderStatus: string) => {
    setActiveOrderId(orderId);
    setOrderStatus(orderStatus as OrderStatus);
    if (window.navigator.vibrate) window.navigator.vibrate(10);
  };

  // Persist service requests to DB for real-time Command notifications
  const handleServiceRequest = async (type: 'waiter' | 'bill' | 'help') => {
    const messages = {
      waiter: 'Avisamos al barista, ya se acerca 🙌',
      bill: 'Estamos preparando tu cuenta 🧾',
      help: 'En breve te asistimos ☕'
    };

    const notificationTypes: Record<string, string> = {
      waiter: 'CALL_WAITER',
      bill: 'REQUEST_CHECK',
      help: 'HELP'
    };

    // Show immediate feedback
    setServiceFeedback(messages[type]);
    if (window.navigator.vibrate) window.navigator.vibrate(50);

    // Persist to DB - only if we have store context
    if (!store?.id) {
      console.warn('No store ID available for notification');
      setTimeout(() => setServiceFeedback(null), 4000);
      return;
    }

    try {
      const currentOrder = activeOrders.find(o => o.id === activeOrderId);
      console.log('[Notification] Persisting:', {
        store_id: store.id,
        node_id: currentOrder?.node_id,
        order_id: activeOrderId,
        type: notificationTypes[type],
        tableNumber
      });

      const { error } = await supabase.from('venue_notifications' as any).insert({
        store_id: store.id,
        node_id: currentOrder?.node_id || null,
        order_id: activeOrderId,
        type: notificationTypes[type],
        message: tableNumber
          ? `Mesa ${tableNumber}: ${type === 'waiter' ? 'Llamando barista' : type === 'bill' ? 'Pidiendo cuenta' : 'Necesita ayuda'}`
          : `Cliente ${type === 'waiter' ? 'llama barista' : type === 'bill' ? 'pide cuenta' : 'necesita ayuda'}`
      });

      if (error) {
        console.error('[Notification] Insert error:', error);
      } else {
        console.log('[Notification] Persisted successfully');
      }
    } catch (e) {
      console.error('[Notification] Failed to persist:', e);
    }

    setTimeout(() => setServiceFeedback(null), 4000);
  };

  const currentOrder = activeOrders.find(o => o.id === activeOrderId) || activeOrders[0];

  const getStatusInfo = (customStatus?: string) => {
    const s = customStatus || status;
    switch (s) {
      case 'pending': return { label: 'PENDIENTE', icon: 'hourglass_empty', color: '#9ca3af', sub: 'Procesando pago...' };
      case 'received': return { label: 'RECIBIDO', icon: 'schedule', color: '#60a5fa', sub: 'Confirmando orden...' };
      case 'preparing': return { label: 'PREPARANDO', icon: 'coffee_maker', color: '#fbbf24', sub: 'En proceso artesanal.' };
      case 'ready': return { label: '¡LISTO!', icon: 'auto_awesome', color: accentColor, sub: 'Retira en barra.' };
      case 'delivered': case 'Entregado': case 'served': return { label: 'ENTREGADO', icon: 'task_alt', color: accentColor, sub: '¡Que lo disfrutes!' };
      default: return { label: 'ESTADO', icon: 'info', color: accentColor, sub: 'Actualizando...' };
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
    if (!hasActiveOrder || !activeOrderId) {
      setServiceFeedback('No tienes un pedido activo en curso.');
      setTimeout(() => setServiceFeedback(null), 3000);
      return;
    }
    setIsHubOpen(false);
    navigate(`/m/${slug}/order/${activeOrderId}`);
  };

  return (
    <>
      {/* FLOATING ACCESS BUTTON - Always visible when Hub is closed */}
      {!isHubOpen && (
        <div className={`fixed ${isWalletPage ? 'bottom-[calc(11rem+env(safe-area-inset-bottom))]' : 'bottom-[calc(7rem+env(safe-area-inset-bottom))]'} left-1/2 -translate-x-1/2 z-[60] w-full max-w-md px-4 animate-in slide-in-from-bottom-6 duration-500 transition-all`}>
          <div
            onClick={() => setIsHubOpen(true)}
            className="w-full flex items-center gap-4 p-4 rounded-[2.5rem] bg-surface-dark/95 backdrop-blur-xl border border-white/5 shadow-[0_20px_50px_rgba(0,0,0,0.6)] active:scale-[0.98] transition-all cursor-pointer group relative overflow-hidden"
          >
            {hasActiveOrder && (
              <div className={`absolute top-0 left-0 w-full h-[2px] transition-all duration-700 ${isPolling ? 'opacity-100' : 'opacity-0'}`} style={{ backgroundColor: `${accentColor}33` }}>
                <div className="h-full animate-data-stream w-1/3" style={{ backgroundColor: accentColor }}></div>
              </div>
            )}

            {hasActiveOrder ? (
              <>
                <div className="relative shrink-0">
                  <div
                    className="w-16 h-16 rounded-[1.2rem] bg-cover bg-center border border-white/10 shadow-inner"
                    style={{ backgroundImage: `url('https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&q=80&w=200')` }}
                  ></div>
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full border-2 border-[#0a110b] flex items-center justify-center text-black shadow-lg" style={{ backgroundColor: statusInfo.color }}>
                    <span className="material-symbols-outlined text-[10px] font-black">star</span>
                  </div>
                </div>

                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[13px] font-black text-white uppercase tracking-tighter italic">Pedido: {statusInfo.label}</span>
                    {activeOrders.length > 1 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-white/40 text-[7px] font-black uppercase tracking-widest">{activeOrders.length} ACTIVOS</span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold leading-tight tracking-tight truncate opacity-80 uppercase" style={{ color: accentColor }}>
                    {statusInfo.sub}
                  </p>
                </div>
                <div className="pr-2 flex flex-col items-end gap-1">
                  <span className="text-[7px] font-black text-slate-700 uppercase tracking-widest italic">Mesa {tableNumber || '00'}</span>
                  <span className="material-symbols-outlined transition-colors text-xl" style={{ color: accentColor }}>drag_handle</span>
                </div>
              </>
            ) : (
              <>
                <div className={`w-14 h-14 rounded-[1.2rem] flex items-center justify-center shrink-0 border border-white/10 ${tableNumber ? 'bg-white/10' : 'bg-white/5'}`}>
                  <span className="material-symbols-outlined text-2xl" style={{ color: accentColor }}>{tableNumber ? 'room_service' : 'restaurant'}</span>
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-[13px] font-black text-white uppercase tracking-tighter italic">
                    {tableNumber ? `Mesa ${tableNumber}` : 'Comenzar Pedido'}
                  </span>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-tight">
                    {tableNumber ? 'Llamar barista · Pedir cuenta' : 'Escanea QR o pide en barra'}
                  </p>
                </div>
                <span className="material-symbols-outlined text-slate-600 text-xl pr-2">{tableNumber ? 'expand_less' : 'chevron_right'}</span>
              </>
            )}
          </div>
        </div>
      )}

      {isHubOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setIsHubOpen(false)}>
          <div
            className="w-full max-w-md bg-[#0a110b] rounded-t-[2.5rem] shadow-2xl animate-in slide-in-from-bottom-10 border-t border-white/5 flex flex-col overflow-hidden"
            style={{ maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 20px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Handle - More prominent for mobile */}
            <div className="w-full flex flex-col items-center pt-3 pb-2 shrink-0">
              <button
                onClick={() => setIsHubOpen(false)}
                className="w-14 h-1.5 bg-white/20 rounded-full active:bg-white/40 transition-colors"
                aria-label="Cerrar"
              />
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-6 pb-8" style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-[28px] sm:text-[32px] font-black text-white italic uppercase tracking-tighter leading-none mb-1">Hub de Orden</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className={`w-1.5 h-1.5 rounded-full ${isPolling ? 'animate-ping' : 'animate-pulse'}`}
                      style={{ backgroundColor: accentColor, boxShadow: `0 0 8px ${accentColor}` }}
                    ></div>
                    <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em]">Estado: En Tiempo Real • Mesa {tableNumber || '??'}</p>
                  </div>
                </div>
                {/* Explicit Close Button for accessibility */}
                <button
                  onClick={() => setIsHubOpen(false)}
                  className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-all shrink-0"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              {/* Multi-Order Switcher 🚈 */}
              {activeOrders.length > 1 && (
                <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar py-2 -mx-2 px-2">
                  {activeOrders.map((o) => {
                    const isSelected = o.id === activeOrderId;
                    const orderNum = o.order_number || o.id.slice(0, 4);
                    const sInfo = getStatusInfo(o.status);
                    return (
                      <button
                        key={o.id}
                        onClick={() => handleOrderSwitch(o.id, o.status)}
                        className={`shrink-0 h-10 px-4 rounded-xl border transition-all flex items-center gap-2 ${isSelected ? 'shadow-lg' : 'bg-white/5 border-white/5'}`}
                        style={isSelected ? { backgroundColor: `${accentColor}20`, borderColor: accentColor, color: accentColor } : { color: '#64748b' }}
                      >
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isSelected ? accentColor : '#334155' }} />
                        <span className="text-[10px] font-black uppercase tracking-widest italic">#{orderNum}</span>
                        <span className="text-[8px] font-bold opacity-60">|</span>
                        <span className="text-[9px] font-black uppercase tracking-tight">{sInfo.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {hasActiveOrder ? (
                <div className="flex gap-2 mb-8 animate-in slide-in-from-top-2 duration-500">
                  {['REC', 'PREP', 'LISTO', 'FIN'].map((s, i) => {
                    const states = ['received', 'preparing', 'ready', 'delivered'];
                    // Logic to handle both internal keys and DB strings
                    const currentStatus = (activeOrders.find(o => o.id === activeOrderId)?.status || status).toLowerCase();
                    const normalizedStatus =
                      (currentStatus === 'received' || currentStatus === 'pending' || currentStatus === 'pendiente') ? 'received' :
                        (currentStatus === 'preparing' || currentStatus === 'en preparación' || currentStatus === 'preparando') ? 'preparing' :
                          (currentStatus === 'ready' || currentStatus === 'listo') ? 'ready' :
                            (currentStatus === 'served' || currentStatus === 'delivered' || currentStatus === 'entregado') ? 'delivered' : 'received';

                    const isActive = states.indexOf(normalizedStatus) >= i;
                    const isCurrent = states.indexOf(normalizedStatus) === i;
                    return (
                      <div key={s} className="flex-1 flex flex-col gap-2">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-700 ${isActive ? 'shadow-2xl' : 'bg-white/5'}`}
                          style={isActive ? { backgroundColor: accentColor, boxShadow: `0 0 12px ${accentColor}` } : {}}
                        ></div>
                        <span
                          className={`text-[8px] font-black uppercase tracking-[0.2em] text-center ${isActive ? (isCurrent ? 'animate-pulse' : '') : 'text-slate-700'}`}
                          style={isActive ? { color: accentColor } : {}}
                        >
                          {s}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mb-8 p-5 rounded-[2rem] bg-surface-dark border border-white/5 flex flex-col items-center justify-center animate-in slide-in-from-top-2 text-center gap-2">
                  <span className="material-symbols-outlined text-3xl opacity-40 text-slate-500">
                    {tableNumber ? 'storefront' : 'qr_code_scanner'}
                  </span>
                  <div>
                    <p className="text-[11px] font-black text-white uppercase tracking-widest italic">
                      {tableNumber ? 'Mesa Asignada' : 'Sin Pedido Activo'}
                    </p>
                    <p className="text-[10px] font-medium text-slate-600 uppercase tracking-wide opacity-80 mt-1">
                      {tableNumber ? 'Usa los botones abajo para llamar al servicio.' : 'Escanea un QR o acércate a la barra.'}
                    </p>
                  </div>
                </div>
              )}

              <div className={`grid ${tableNumber ? 'grid-cols-2' : 'grid-cols-1'} gap-3 mb-5`}>
                <button
                  onClick={handleGoToTracking}
                  className={`flex flex-col items-center justify-center p-6 rounded-[2rem] transition-all gap-2 shadow-xl group active:scale-95 ${hasActiveOrder
                    ? 'text-black'
                    : 'bg-surface-dark border border-white/5 text-slate-500 grayscale opacity-50'
                    }`}
                  style={hasActiveOrder ? { backgroundColor: accentColor, boxShadow: `0 10px 30px ${accentColor}40` } : {}}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${hasActiveOrder ? 'bg-black/10' : 'bg-white/5'}`}>
                    <span className="material-symbols-outlined text-2xl font-black fill-icon">qr_code_2</span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest leading-none">Ver QR Retiro</span>
                </button>

                {/* Only show waiter/bill buttons if user has a table assigned */}
                {tableNumber && (
                  <>
                    <button
                      onClick={() => handleServiceRequest('waiter')}
                      className="flex flex-col items-center justify-center p-6 rounded-[2rem] bg-surface-dark border border-white/5 active:scale-95 transition-all gap-2 group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 transition-all group-hover:bg-white/10" style={{ color: accentColor }}>
                        <span className="material-symbols-outlined text-2xl">person_alert</span>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 leading-none">Llamar Barista</span>
                    </button>

                    <button
                      onClick={() => handleServiceRequest('bill')}
                      className="flex flex-col items-center justify-center p-6 rounded-[2rem] bg-surface-dark border border-white/5 active:scale-95 transition-all gap-2 group"
                    >
                      <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 transition-all group-hover:bg-white/10" style={{ color: accentColor }}>
                        <span className="material-symbols-outlined text-2xl">receipt_long</span>
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 leading-none">Pedir Cuenta</span>
                    </button>
                  </>
                )}

                {/* Tip button - Always visible */}
                <button
                  onClick={() => setShowTipModal(true)}
                  className="flex flex-col items-center justify-center p-6 rounded-[2rem] bg-surface-dark border border-white/5 active:scale-95 transition-all gap-2 group"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 transition-all group-hover:bg-white/10" style={{ color: accentColor }}>
                    <span className="material-symbols-outlined text-2xl">{tipAmount ? 'verified' : 'volunteer_activism'}</span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 leading-none">{tipAmount ? `$${tipAmount}` : 'Dar Propina'}</span>
                </button>
              </div>

              {/* Soporte button - only show if has table */}
              {tableNumber && (
                <button
                  onClick={() => handleServiceRequest('help')}
                  className="w-full py-5 rounded-[2rem] bg-white/5 text-slate-500 font-black uppercase text-[9px] tracking-[0.3em] hover:text-white transition-all flex items-center justify-center gap-2 active:scale-95"
                >
                  <span>Soporte de Pedido</span>
                  <span className="material-symbols-outlined text-sm">support_agent</span>
                </button>
              )}
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
                <button
                  key={amt}
                  onClick={() => handleConfirmTip(amt)}
                  className="h-16 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center font-black transition-all hover:text-black"
                  style={{ color: accentColor, '--hover-bg': accentColor } as any}
                >
                  ${amt}
                </button>
              ))}
              <input
                type="number"
                placeholder="Otro"
                value={customTip}
                onChange={(e) => setCustomTip(e.target.value)}
                className="w-full h-16 bg-white/5 border border-white/5 rounded-2xl px-4 text-center text-sm font-black text-white focus:ring-0 placeholder:text-slate-600 transition-all outline-none"
                style={{ caretColor: accentColor, '--focus-border': accentColor } as any}
              />
            </div>
            <button onClick={() => setShowTipModal(false)} className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Ahora no</button>
          </div>
        </div>
      )}

      {serviceFeedback && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[210] w-full max-w-md px-6 pointer-events-none">
          <div
            className="w-full py-5 text-black rounded-2xl animate-in slide-in-from-top-6 font-black text-[11px] text-center uppercase tracking-widest italic shadow-2xl"
            style={{ backgroundColor: accentColor, boxShadow: `0 20px 40px ${accentColor}4D` }}
          >
            {serviceFeedback}
          </div>
        </div>
      )}
    </>
  );
};

export default ActiveOrderWidget;
