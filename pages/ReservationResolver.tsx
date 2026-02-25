import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { setQRContext } from '../lib/qrContext';

const ReservationResolver: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<'loading' | 'welcome' | 'error' | 'not_found'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  // Welcome screen state
  const [reservationData, setReservationData] = useState<any>(null);
  const [storeData, setStoreData] = useState<any>(null);
  const [tableLabelData, setTableLabelData] = useState('');
  const [guestName, setGuestName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isEntering, setIsEntering] = useState(false);

  useEffect(() => {
    if (!token) {
      setState('not_found');
      return;
    }
    resolveReservation(token);
  }, [token]);

  const saveContext = (reservation: any, store: any, table_label: string, t: string, welcomed: boolean) => {
    localStorage.setItem('reservation_context', JSON.stringify({
      reservation_id: reservation.id,
      invite_token: t,
      store_id: reservation.store_id,
      node_id: reservation.node_id,
      table_label,
      initial_credit: reservation.initial_credit,
      remaining_credit: reservation.remaining_credit,
      menu_id: reservation.menu_id,
      customer_name: reservation.customer_name,
      pax: reservation.pax,
      claimed_at: Date.now(),
      expires_at: Date.now() + (8 * 60 * 60 * 1000),
      welcomed
    }));
  };

  const setupQRContext = (store: any, reservation: any, table_label: string, t: string) => {
    setQRContext({
      store_id: store.id,
      store_slug: store.slug,
      qr_hash: `reserve-${t}`,
      qr_id: reservation.id,
      node_id: reservation.node_id,
      node_label: table_label,
      node_type: 'table',
      channel: 'table',
    });
  };

  const resolveReservation = async (t: string) => {
    try {
      const { data, error } = await (supabase.rpc as any)('resolve_reservation_invite', {
        p_token: t
      });

      if (error) throw error;
      if (!data?.success) {
        setState('not_found');
        return;
      }

      const { reservation, store, table_label } = data;

      // Always set up QR context
      setupQRContext(store, reservation, table_label, t);

      // Check if already welcomed for this reservation
      const existing = localStorage.getItem('reservation_context');
      if (existing) {
        try {
          const ctx = JSON.parse(existing);
          if (ctx.reservation_id === reservation.id && ctx.welcomed) {
            // Already welcomed — update data with fresh values and redirect
            saveContext(reservation, store, table_label, t, true);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await (supabase.rpc as any)('claim_reservation', { p_token: t });
            }
            navigate(`/m/${store.slug}`, { replace: true });
            return;
          }
        } catch (e) { /* ignore parse errors */ }
      }

      // Save context (not yet welcomed)
      saveContext(reservation, store, table_label, t, false);

      // Check auth status
      const { data: { user } } = await supabase.auth.getUser();
      setIsLoggedIn(!!user);

      // Show welcome screen
      setReservationData(reservation);
      setStoreData(store);
      setTableLabelData(table_label);
      setGuestName(reservation.customer_name || '');
      setState('welcome');
    } catch (e: any) {
      console.error('Reservation resolve error:', e);
      setErrorMessage(e.message || 'Error al procesar la invitación');
      setState('error');
    }
  };

  const handleEnter = async () => {
    setIsEntering(true);
    try {
      // Update context with guest name and mark as welcomed
      const raw = localStorage.getItem('reservation_context');
      if (raw) {
        const ctx = JSON.parse(raw);
        if (guestName) ctx.customer_name = guestName;
        ctx.welcomed = true;
        localStorage.setItem('reservation_context', JSON.stringify(ctx));
      }

      // Claim reservation if logged in
      if (isLoggedIn && token) {
        await (supabase.rpc as any)('claim_reservation', { p_token: token });
        navigate(`/m/${storeData.slug}`, { replace: true });
      } else {
        // Not logged in: redirect to auth so they can order from their table
        navigate(`/m/${storeData.slug}/auth`, { replace: true });
      }
    } catch (e) {
      console.error('Error entering reservation:', e);
      navigate(`/m/${storeData?.slug}`, { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-sm w-full">

        {/* LOADING */}
        {state === 'loading' && (
          <>
            <div className="w-16 h-16 rounded-full border-4 border-indigo-500/30 border-t-indigo-500 animate-spin mx-auto" />
            <div>
              <p className="text-white font-black text-sm uppercase tracking-widest">Cargando Reserva</p>
              <p className="text-zinc-600 text-xs mt-1">Preparando tu mesa...</p>
            </div>
          </>
        )}

        {/* WELCOME */}
        {state === 'welcome' && reservationData && (
          <div className="space-y-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Store branding */}
            <div className="text-center space-y-2">
              {storeData?.logo_url && (
                <img src={storeData.logo_url} alt="" className="w-14 h-14 rounded-2xl mx-auto shadow-2xl object-cover" />
              )}
              <p className="text-white/30 text-[9px] uppercase tracking-[0.4em] font-bold">{storeData?.name}</p>
            </div>

            {/* Reservation card */}
            <div className="bg-indigo-500/[0.07] border border-indigo-500/20 rounded-[2rem] p-8 space-y-6">
              <div className="text-center space-y-1">
                <p className="text-indigo-300/50 text-[9px] uppercase tracking-[0.3em] font-bold">Tu Mesa</p>
                <p className="text-4xl font-black text-indigo-300 tracking-tight">{tableLabelData}</p>
              </div>

              <div className={`grid gap-3 ${reservationData.initial_credit > 0 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div className="bg-white/[0.03] rounded-2xl p-4 text-center border border-white/[0.04]">
                  <p className="text-[9px] uppercase tracking-widest text-white/30 font-bold">Personas</p>
                  <p className="text-2xl font-black text-white mt-1">{reservationData.pax}</p>
                </div>
                {reservationData.initial_credit > 0 && (
                  <div className="bg-indigo-500/[0.06] rounded-2xl p-4 text-center border border-indigo-500/10">
                    <p className="text-[9px] uppercase tracking-widest text-indigo-300/50 font-bold">Crédito</p>
                    <p className="text-2xl font-black text-indigo-300 mt-1">${Number(reservationData.remaining_credit).toFixed(2)}</p>
                  </div>
                )}
              </div>

              {reservationData.customer_name && (
                <div className="text-center pt-4 border-t border-white/[0.04]">
                  <p className="text-white/25 text-[9px] uppercase tracking-widest font-bold">Reserva a nombre de</p>
                  <p className="text-white font-black text-sm mt-1">{reservationData.customer_name}</p>
                </div>
              )}
            </div>

            {/* Guest name input (only if not logged in) */}
            {!isLoggedIn && (
              <div className="space-y-2 text-left">
                <label className="text-[9px] uppercase tracking-[0.3em] text-white/30 font-bold pl-2">Tu Nombre</label>
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="¿Cómo te llamas?"
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-6 py-4 text-white font-bold text-sm placeholder:text-white/15 focus:border-indigo-500/40 focus:outline-none transition-colors"
                />
              </div>
            )}

            {/* Logged in indicator */}
            {isLoggedIn && (
              <div className="flex items-center justify-center gap-2 py-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <p className="text-green-400/60 text-[10px] uppercase tracking-widest font-bold">Sesión Activa</p>
              </div>
            )}

            {/* Enter button */}
            <button
              onClick={handleEnter}
              disabled={isEntering}
              className="w-full h-16 bg-indigo-500 hover:bg-indigo-400 text-white font-black text-xs uppercase tracking-[0.3em] rounded-full active:scale-[0.97] transition-all shadow-[0_20px_60px_rgba(99,102,241,0.3)] disabled:opacity-50"
            >
              {isEntering ? 'Entrando...' : isLoggedIn ? 'Entrar al Menú' : 'Iniciar Sesión y Entrar'}
            </button>

            {!isLoggedIn && (
              <p className="text-white/20 text-[10px]">
                Necesitás una cuenta para ordenar desde tu mesa
              </p>
            )}
          </div>
        )}

        {/* NOT FOUND */}
        {state === 'not_found' && (
          <>
            <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mx-auto border border-zinc-800">
              <span className="material-symbols-outlined text-zinc-600 text-2xl">event_busy</span>
            </div>
            <div>
              <p className="text-white font-black text-sm uppercase tracking-widest">Reserva No Encontrada</p>
              <p className="text-zinc-600 text-xs mt-1">El link puede haber expirado o la reserva fue cancelada.</p>
            </div>
          </>
        )}

        {/* ERROR */}
        {state === 'error' && (
          <>
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto border border-red-500/20">
              <span className="material-symbols-outlined text-red-500 text-2xl">error</span>
            </div>
            <div>
              <p className="text-white font-black text-sm uppercase tracking-widest">Error</p>
              <p className="text-zinc-600 text-xs mt-1">{errorMessage}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ReservationResolver;
