import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClient } from '../../contexts/ClientContext';
import { supabase } from '../../lib/supabase';

const TrackingPage: React.FC = () => {
  const { slug, orderId } = useParams<{ slug: string; orderId: string }>();
  const navigate = useNavigate();
  const { cart, setHasActiveOrder, orderStatus, setOrderStatus, store } = useClient();

  // Theme support
  const accentColor = store?.menu_theme?.accentColor || '#36e27b';
  const backgroundColor = store?.menu_theme?.backgroundColor || '#000000';
  const textColor = store?.menu_theme?.textColor || '#FFFFFF';

  const isLight = backgroundColor.toLowerCase() === '#ffffff' || backgroundColor.toLowerCase() === '#fff';
  const surfaceColor = store?.menu_theme?.surfaceColor || (isLight ? '#f4f4f5' : '#141714');

  // UI State for Timer (Estimated)
  const [seconds, setSeconds] = useState(0);
  const [minutes, setMinutes] = useState(15);

  // Calculate Points
  const orderTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const pointsEarned = Math.floor(orderTotal * 10);

  // Timer Effect (Visual only)
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

  const [orderNumber, setOrderNumber] = useState<number | null>(null);

  // Realtime Order Tracking
  useEffect(() => {
    if (!orderId) return;

    const fetchOrder = async () => {
      const { data } = await supabase
        .from('orders')
        .select('status, order_number')
        .eq('id', orderId)
        .single();

      if (data) {
        setOrderStatus(data.status as any);
        setOrderNumber(data.order_number);
      }
    };

    fetchOrder();

    const channel = supabase
      .channel(`order_tracking_${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`
        },
        (payload) => {
          if (payload.new && payload.new.status) {
            setOrderStatus(payload.new.status as any);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, setOrderStatus]);

  const status = orderStatus;

  const handleReturn = () => {
    navigate(`/m/${slug}`);
  };

  const handleFinishAndClear = () => {
    setHasActiveOrder(false);
    navigate(`/m/${slug}`);
  };

  const getStatusDisplay = () => {
    switch (status) {
      case 'received': return 'Recibido';
      case 'preparing': return 'En Preparación';
      case 'ready': return '¡Listo para Retirar!';
      case 'delivered': return 'Entregado';
      default: return 'Procesando';
    }
  };

  return (
    <div className="flex flex-col min-h-screen font-display pb-[env(safe-area-inset-bottom)] transition-colors duration-500" style={{ backgroundColor, color: textColor }}>
      <header className="sticky top-0 z-30 flex items-center justify-between pt-[calc(1.5rem+env(safe-area-inset-top))] px-6 pb-6 backdrop-blur-xl border-b" style={{ backgroundColor: `${backgroundColor}F2`, borderColor: `${textColor}0D` }}>
        <button onClick={handleReturn} className="flex items-center justify-center w-12 h-12 rounded-full transition-colors active:scale-90 shadow-xl border" style={{ backgroundColor: `${textColor}0D`, borderColor: `${textColor}0D` }}>
          <span className="material-symbols-outlined text-xl" style={{ color: `${textColor}99` }}>arrow_back</span>
        </button>
        <h2 className="text-[11px] font-black tracking-[0.4em] uppercase italic" style={{ color: `${textColor}80` }}>Orden #{orderNumber || '...'}</h2>
        <div className="w-12"></div>
      </header>

      <main className="flex-1 flex flex-col items-center w-full p-4 overflow-y-auto no-scrollbar">
        <div className="px-6 pt-10 pb-10 text-center w-full">
          <div
            className="inline-flex items-center gap-2 px-6 py-2 rounded-full border text-[10px] font-black uppercase tracking-[0.25em] mb-8"
            style={{ backgroundColor: `${accentColor}1A`, borderColor: `${accentColor}33`, color: accentColor }}
          >
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: accentColor, boxShadow: `0 0 10px ${accentColor}` }}
            ></span>
            {getStatusDisplay()}
          </div>
          <h1 className="text-[36px] font-black tracking-tighter uppercase italic leading-[0.9] mb-4" style={{ color: textColor }}>
            {status === 'ready' ? '¡Tu café te\nespera!' : 'Tu café se está\ncreando'}
          </h1>
        </div>

        <div className="w-full px-6 mb-12 flex justify-center gap-8">
          <div className="flex flex-col items-center">
            <span className="text-5xl font-black italic tabular-nums" style={{ color: textColor }}>{String(minutes).padStart(2, '0')}</span>
            <span className="text-[9px] font-black uppercase tracking-[0.4em] mt-3" style={{ color: `${textColor}99` }}>Minutos</span>
          </div>
          <div className="text-4xl font-black animate-pulse" style={{ color: `${textColor}CC` }}>:</div>
          <div className="flex flex-col items-center">
            <span className="text-5xl font-black italic tabular-nums" style={{ color: accentColor }}>{String(seconds).padStart(2, '0')}</span>
            <span className="text-[9px] font-black uppercase tracking-[0.4em] mt-3" style={{ color: `${textColor}99` }}>Segundos</span>
          </div>
        </div>

        <div className="w-full mb-12">
          <div className="rounded-[3.5rem] p-10 shadow-2xl flex flex-col items-center gap-10 border relative overflow-hidden" style={{ backgroundColor: surfaceColor, borderColor: `${textColor}0D` }}>
            <div className="relative p-6 bg-white rounded-[3rem] shadow-[0_30px_80px_rgba(0,0,0,0.2)]">
              <div className="w-36 h-36 bg-white">
                {orderNumber && (
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${orderNumber}&color=000`}
                    alt="Código QR"
                    className="w-full h-full object-contain opacity-90"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col items-center text-center">
              <h3 className="text-2xl font-black uppercase tracking-tighter italic mb-2" style={{ color: textColor }}>Escanea para Retirar</h3>
              <p className="text-[10px] font-black uppercase tracking-widest leading-relaxed max-w-[220px]" style={{ color: `${textColor}80` }}>Presenta este código al barista para recibir tu dosis diaria.</p>
            </div>

            <div className="w-full border rounded-[2rem] p-6 flex flex-col items-center gap-2" style={{ backgroundColor: `${textColor}08`, borderColor: `${textColor}0D` }}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-xl fill-icon" style={{ color: accentColor }}>stars</span>
                <span className="text-[13px] font-black italic uppercase tracking-tight" style={{ color: textColor }}>+{pointsEarned} Granos sumados</span>
              </div>
              <div className="flex items-center gap-1.5 opacity-50">
                <span className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: `${textColor}80` }}>Motivo:</span>
                <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: `${textColor}60` }}>Compra Miembro (Plata)</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER ACTIONS REDESIGNED (ALTA PRECISIÓN) */}
      <footer className="fixed bottom-0 left-0 right-0 z-[60] backdrop-blur-3xl border-t p-6 pb-[calc(2rem+env(safe-area-inset-bottom))] max-w-md mx-auto flex gap-4 shadow-2xl"
        style={{ backgroundColor: `${backgroundColor}F2`, borderColor: `${textColor}0D` }}>
        <button
          onClick={handleReturn}
          className="flex-1 h-20 rounded-full border text-[10px] font-black uppercase tracking-[0.2em] active:scale-95 transition-all"
          style={{ backgroundColor: `${textColor}08`, borderColor: `${textColor}0D`, color: `${textColor}80` }}
        >
          MENÚ
        </button>

        <button
          onClick={handleReturn}
          className="group relative flex-[2.5] h-20 rounded-full border border-white/20 text-black flex items-center justify-between pl-8 pr-3 shadow-2xl active:scale-[0.97] transition-all overflow-hidden"
          style={{ backgroundColor: accentColor, boxShadow: `0 20px 50px ${accentColor}4D` }}
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

          <div className="flex flex-col items-start leading-none relative z-10">
            <span className="text-[10px] font-black uppercase tracking-tight" style={{ color: '#000' }}>SEGUIR</span>
            <span className="text-[10px] font-black uppercase tracking-tight opacity-40 italic" style={{ color: '#000' }}>EXPLORANDO</span>
          </div>

          <div className="flex items-center gap-4 relative z-10">
            <div className="h-10 w-[1px] bg-black/10"></div>
            <div
              className="w-14 h-14 rounded-full bg-black flex items-center justify-center shadow-xl group-hover:scale-105 transition-transform"
              style={{ color: accentColor }}
            >
              <span className="material-symbols-outlined font-black text-[28px]">arrow_forward</span>
            </div>
          </div>
        </button>
      </footer>

      <button
        onClick={handleFinishAndClear}
        className="fixed bottom-40 left-1/2 -translate-x-1/2 opacity-20 text-[8px] font-black uppercase tracking-widest pointer-events-auto"
        style={{ color: textColor }}
      >
        Limpiar Orden (Simulación)
      </button>
    </div>
  );
};

export default TrackingPage;
