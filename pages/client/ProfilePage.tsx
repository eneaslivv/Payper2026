
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../contexts/ClientContext';
import { OrderHistoryItem } from '../../components/client/types';
import LoyaltyLockedView from '../../components/client/LoyaltyLockedView';
import UserIdentityQR from '../../components/client/UserIdentityQR';

const ProfilePage: React.FC = () => {
  const { user, setUser, addToCart, products, store, isFeatureEnabled } = useClient();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<typeof user>>(user || {});

  // Determine theme colors
  const accentColor = store?.menu_theme?.accentColor || '#4ADE80';
  const backgroundColor = store?.menu_theme?.backgroundColor || '#000000';
  const textColor = store?.menu_theme?.textColor || '#FFFFFF';

  // Simple check for light mode (assuming white background implies light mode)
  const isLight = backgroundColor.toLowerCase() === '#ffffff' || backgroundColor.toLowerCase() === '#fff';
  const surfaceColor = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)';
  const borderColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
  const headerBg = isLight ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.8)';

  const [showTopUp, setShowTopUp] = useState(false);
  const [showQR, setShowQR] = useState<{ isOpen: boolean; data: string; title: string }>({ isOpen: false, data: '', title: '' });
  const [selectedAmount, setSelectedAmount] = useState<number | null>(20);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen pb-32 font-display" style={{ backgroundColor, color: textColor }}>
        <header className="sticky top-0 z-50 backdrop-blur-3xl px-6 pt-[calc(1.2rem+env(safe-area-inset-top))] pb-6 border-b" style={{ backgroundColor: headerBg, borderColor }}>
          <h1 className="text-xl font-black tracking-tight uppercase italic text-center">Tu Perfil</h1>
        </header>
        <LoyaltyLockedView title="Tu Perfil Personal" icon="person" />
      </div>
    );
  }

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleSave = async () => {
    if (!user) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          name: formData.name,
          phone: formData.phone
        })
        .eq('id', user.id);

      if (error) throw error;

      setUser({ ...user, ...formData });
      setEditMode(false);
      triggerToast('Perfil actualizado');
    } catch (err: any) {
      console.error("Error updating profile:", err);
      triggerToast('Error: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmTopUp = async () => {
    const amount = customAmount ? parseFloat(customAmount) : (selectedAmount || 0);
    if (!amount || amount <= 0 || !user) return;

    setIsProcessing(true);
    try {
      const { data, error } = await (supabase.rpc as any)('admin_add_balance_v2', {
        p_user_id: user.id,
        p_amount: amount,
        p_payment_method: 'card', // placeholder for future real payment integration
        p_description: 'Recarga de Saldo (Cliente)'
      });

      if (error) throw error;

      // Use the new_balance returned by the RPC instead of calculating manually
      const newBalance = data?.new_balance ?? (user.balance + amount);
      setUser({ ...user, balance: newBalance });
      setIsProcessing(false);
      setShowTopUp(false);
      setSelectedAmount(20);
      setCustomAmount('');
      triggerToast(`$${amount.toFixed(2)} cargados con éxito`);
    } catch (err: any) {
      console.error("Error topping up:", err);
      triggerToast('Error en la recarga');
      setIsProcessing(false);
    }
  };

  const handleOrderAgain = (order: OrderHistoryItem) => {
    if (!addToCart) return;

    const itemNames = order.items.split(',').map(name => name.trim());
    let addedCount = 0;

    itemNames.forEach(name => {
      const menuItem = products?.find(i => i.name.toLowerCase() === name.toLowerCase());
      if (menuItem) {
        addToCart(menuItem, 1, [], 'Chico', '');
        addedCount++;
      }
    });

    if (addedCount > 0) {
      triggerToast(`${addedCount} artículos añadidos al carrito`);
    } else {
      triggerToast('No se pudieron encontrar los artículos');
    }
  };

  const selectPreset = (amt: number) => {
    setSelectedAmount(amt);
    setCustomAmount('');
  };

  const handleCustomInput = (val: string) => {
    setCustomAmount(val);
    setSelectedAmount(null);
  };

  return (
    <div className="flex flex-col min-h-screen pb-40 font-display overflow-x-hidden transition-colors duration-500" style={{ backgroundColor, color: textColor }}>
      {/* HEADER OPTIMIZADO PARA IPHONE */}
      <div
        className="flex items-center justify-between px-6 pt-[calc(1.2rem+env(safe-area-inset-top))] pb-6 sticky top-0 z-30 backdrop-blur-3xl border-b transition-colors duration-500"
        style={{ backgroundColor: headerBg, borderColor }}
      >
        <div className="w-12"></div>
        <h2 className="text-xl font-black flex-1 text-center tracking-tight uppercase italic leading-none">Tu Perfil</h2>
        <div className="flex w-12 items-center justify-end">
          <button onClick={() => setUser(null)} className="flex items-center justify-center h-12 w-12 hover:text-red-500 transition-colors active:scale-90" style={{ color: textColor }}>
            <span className="material-symbols-outlined text-2xl">logout</span>
          </button>
        </div>
      </div>

      <main className="p-4 flex flex-col gap-10">
        <div
          className="flex flex-col items-center rounded-[3rem] p-12 shadow-2xl border relative overflow-hidden"
          style={{ backgroundColor: surfaceColor, borderColor }}
        >
          <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-[100px] -mr-20 -mt-20" style={{ backgroundColor: `${accentColor}10` }}></div>
          <div className="relative group cursor-pointer" onClick={() => setShowQR({ isOpen: true, data: user.id, title: 'Tu ID de Miembro' })}>
            <div
              className="rounded-[2.2rem] h-40 w-40 shadow-2xl ring-2 bg-cover bg-center overflow-hidden transition-transform duration-700 group-hover:scale-105"
              style={{ backgroundImage: `url(${user.avatar})`, ringColor: borderColor }}
            ></div>
            <div className="absolute bottom-3 right-3 h-12 w-12 rounded-[1rem] flex items-center justify-center border-4 shadow-xl" style={{ backgroundColor: accentColor, borderColor: isLight ? '#fff' : '#000' }}>
              <span className="material-symbols-outlined text-black text-2xl font-black fill-icon">qr_code_2</span>
            </div>
          </div>
          <div className="mt-8 text-center">
            <h1 className="text-[34px] font-black tracking-tighter uppercase italic leading-none">{user.name}</h1>
            <p className="text-[10px] font-black uppercase tracking-[0.4em] mt-4 italic opacity-40">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {isFeatureEnabled('wallet') && (
            <div className="rounded-[2.5rem] p-8 border flex flex-col items-center justify-center gap-2 shadow-xl" style={{ backgroundColor: surfaceColor, borderColor }}>
              <span className="text-[9px] font-black uppercase tracking-[0.4em] opacity-30 mb-2">Saldo</span>
              <span className="text-[32px] font-black tracking-tighter italic leading-none">${user.balance.toFixed(2)}</span>
              <button
                onClick={() => setShowTopUp(true)}
                className="mt-6 h-14 flex items-center justify-center text-black px-10 rounded-full text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl border border-white/20"
                style={{ backgroundColor: accentColor }}
              >
                Recargar
              </button>
            </div>
          )}

          {isFeatureEnabled('loyalty') && (
            <div className="rounded-[2.5rem] p-8 border flex flex-col items-center justify-center gap-2 shadow-xl" style={{ backgroundColor: surfaceColor, borderColor }}>
              <span className="text-[9px] font-black uppercase tracking-[0.4em] opacity-30 mb-2">Puntos</span>
              <span className="text-[32px] font-black tracking-tighter italic leading-none">{user.points}</span>
              <button
                onClick={() => navigate(`/m/${slug}/loyalty`)}
                className="mt-6 h-14 flex items-center justify-center px-10 rounded-full text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all border"
                style={{ backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', borderColor }}
              >
                Canjear
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between px-3">
            <h3 className="text-[11px] font-black uppercase tracking-[0.5em] opacity-30 italic">Información Personal</h3>
            <button onClick={() => editMode ? handleSave() : setEditMode(true)} className="text-[10px] font-black uppercase tracking-[0.3em] active:scale-90 transition-transform" style={{ color: accentColor }}>
              {editMode ? 'Guardar' : 'Editar'}
            </button>
          </div>
          <div className="rounded-[2.5rem] overflow-hidden shadow-2xl border flex flex-col" style={{ backgroundColor: surfaceColor, borderColor }}>
            <EditableInfoItem
              icon="person"
              label="Nombre"
              value={formData.name || ''}
              editMode={editMode}
              onChange={(v) => setFormData({ ...formData, name: v })}
              accentColor={accentColor}
              textColor={textColor}
            />
            {/* Divider manual since divide-y might assume color */}
            <div style={{ height: 1, backgroundColor: borderColor }}></div>
            <EditableInfoItem
              icon="call"
              label="Teléfono"
              value={formData.phone || ''}
              editMode={editMode}
              onChange={(v) => setFormData({ ...formData, phone: v })}
              accentColor={accentColor}
              textColor={textColor}
            />
          </div>
        </div>

        {/* HISTORIAL DE PEDIDOS */}
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex items-center justify-between px-3">
            <h3 className="text-[11px] font-black uppercase tracking-[0.5em] opacity-30 italic">Historial de Actividad</h3>
          </div>
          <div className="flex flex-col gap-4">
            {user.orderHistory.map(order => (
              <div key={order.id} className="rounded-[2.2rem] p-7 border shadow-xl flex flex-col gap-5 relative overflow-hidden group" style={{ backgroundColor: surfaceColor, borderColor }}>
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1">
                    <span className="text-[8px] font-black opacity-30 uppercase tracking-[0.3em] italic">{order.date} • {order.id}</span>
                    <p className="text-[13px] font-black italic tracking-tight leading-tight max-w-[200px] opacity-90">{order.items}</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[18px] font-black italic tracking-tighter leading-none">${order.total.toFixed(2)}</span>
                    <span className="text-[7px] font-black uppercase tracking-widest mt-2" style={{ color: accentColor }}>Completado</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 pt-5 border-t" style={{ borderColor: borderColor }}>
                  <div className="flex items-center gap-2">
                    {isFeatureEnabled('loyalty') && (
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[14px] fill-icon" style={{ color: accentColor }}>stars</span>
                        <span className="text-[8px] font-black opacity-30 uppercase tracking-widest">+{order.pointsEarned || 0} Granos</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleOrderAgain(order)}
                    className="flex items-center gap-3 h-11 px-6 rounded-full border text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all group/btn"
                    style={{ color: accentColor, backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', borderColor }}
                  >
                    <span>Repetir</span>
                    <span className="material-symbols-outlined text-[16px] group-hover/btn:translate-x-0.5 transition-transform">refresh</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* MODAL DE RECARGA */}
      {showTopUp && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 backdrop-blur-2xl animate-in fade-in duration-500" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}>
          <div
            className="w-full max-w-sm rounded-[3rem] p-8 shadow-[0_40px_100px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-300 border"
            style={{ backgroundColor: surfaceColor, borderColor, color: textColor }}
          >
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-[22px] font-black uppercase tracking-tighter italic leading-none">Cargar Saldo</h2>
              <button onClick={() => setShowTopUp(false)} className="h-10 w-10 rounded-xl flex items-center justify-center active:scale-90" style={{ backgroundColor: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)', color: textColor }}>
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-6">
              {/* Montos rápidos */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-[0.3em] ml-3 mb-3 block opacity-40">Montos Rápidos</label>
                <div className="grid grid-cols-4 gap-2">
                  {[500, 1000, 2000, 5000].map(amount => (
                    <button
                      key={amount}
                      onClick={() => selectPreset(amount)}
                      className={`h-14 rounded-xl font-black text-[13px] italic transition-all duration-300 border`}
                      style={selectedAmount === amount
                        ? { backgroundColor: accentColor, borderColor: accentColor, color: '#000' }
                        : { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: borderColor, color: textColor }}
                    >
                      ${amount >= 1000 ? `${amount / 1000}k` : amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monto personalizado */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-[0.3em] ml-3 mb-2 block opacity-40">Otro Monto</label>
                <div className="flex items-center h-14 px-5 rounded-xl border" style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor }}>
                  <span className="text-lg font-black italic mr-2 opacity-30">$</span>
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => handleCustomInput(e.target.value)}
                    placeholder="0"
                    className="bg-transparent border-none p-0 text-xl font-black italic placeholder:opacity-20 focus:ring-0 w-full tracking-tighter outline-none"
                    style={{ color: textColor }}
                  />
                </div>
              </div>

              {/* Monto seleccionado */}
              {(selectedAmount || customAmount) && (
                <div className="text-center py-4 border-t border-b" style={{ borderColor }}>
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Total a cargar</span>
                  <p className="text-[36px] font-black italic tracking-tighter break-all text-center leading-none" style={{ color: accentColor }}>
                    ${customAmount ? parseFloat(customAmount).toLocaleString() : selectedAmount?.toLocaleString()}
                  </p>
                </div>
              )}

              {/* Botones de pago */}
              <div className="space-y-3">
                {/* MercadoPago */}
                <button
                  onClick={async () => {
                    const amount = customAmount ? parseFloat(customAmount) : (selectedAmount || 0);
                    if (!amount || amount <= 0) {
                      triggerToast('Seleccioná un monto');
                      return;
                    }
                    setIsProcessing(true);
                    try {
                      // Create MP preference for client balance top-up
                      const { data, error } = await supabase.functions.invoke('create-mp-preference', {
                        body: {
                          amount: amount,
                          description: `Recarga de saldo - ${store?.name || 'Tienda'}`,
                          client_id: user?.id,
                          store_id: store?.id,
                          type: 'balance_topup'
                        }
                      });
                      if (error) throw error;
                      if (data?.init_point) {
                        window.location.href = data.init_point;
                      } else {
                        throw new Error('No se pudo crear el pago');
                      }
                    } catch (err: any) {
                      console.error('MP Error:', err);
                      triggerToast('Error al procesar pago: ' + err.message);
                    } finally {
                      setIsProcessing(false);
                    }
                  }}
                  disabled={isProcessing || (!selectedAmount && !customAmount)}
                  className="w-full h-16 rounded-2xl font-black uppercase text-[11px] tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#009ee3', color: '#fff' }}
                >
                  {isProcessing ? (
                    <span className="material-symbols-outlined animate-spin">refresh</span>
                  ) : (
                    <>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
                      </svg>
                      Pagar con MercadoPago
                    </>
                  )}
                </button>

                {/* Efectivo */}
                <button
                  onClick={() => {
                    const amount = customAmount ? parseFloat(customAmount) : (selectedAmount || 0);
                    if (!amount || amount <= 0) {
                      triggerToast('Seleccioná un monto');
                      return;
                    }
                    setShowTopUp(false);
                    triggerToast(`Acercate a la caja para cargar $${amount.toLocaleString()}`);
                  }}
                  disabled={!selectedAmount && !customAmount}
                  className="w-full h-14 rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-[0.98] transition-all flex items-center justify-center gap-3 border disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: 'transparent', borderColor, color: textColor }}
                >
                  <span className="material-symbols-outlined text-lg">payments</span>
                  Pagar en Efectivo
                </button>
              </div>

              <p className="text-center text-[9px] opacity-30 mt-2">
                Para pagos en efectivo, acercate a la caja más cercana
              </p>
            </div>
          </div>
        </div>
      )}

      {showQR.isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 backdrop-blur-2xl animate-in fade-in duration-500" style={{ backgroundColor: 'rgba(0,0,0,0.9)' }} onClick={() => setShowQR({ ...showQR, isOpen: false })}>
          <div className="w-full max-w-sm flex flex-col items-center" onClick={e => e.stopPropagation()}>
            {/* User Identity QR Component */}
            <UserIdentityQR userCode={showQR.data} userName={user?.name || 'Cliente'} />

            <button
              onClick={() => setShowQR({ ...showQR, isOpen: false })}
              className="mt-8 w-20 h-20 rounded-full flex items-center justify-center border active:scale-90 transition-transform"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }}
            >
              <span className="material-symbols-outlined text-4xl">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <div className={`fixed bottom-32 left-1/2 -translate-x-1/2 z-[200] transition-all duration-700 transform ${showToast ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0 pointer-events-none'}`}>
        <div className="text-black px-12 py-5 rounded-full flex items-center gap-5 border border-white/30 shadow-2xl" style={{ backgroundColor: accentColor }}>
          <span className="material-symbols-outlined font-black text-2xl">check_circle</span>
          <p className="text-[12px] font-black tracking-[0.1em] uppercase">{toastMsg}</p>
        </div>
      </div>
    </div>
  );
};

const EditableInfoItem: React.FC<{ icon: string, label: string, value: string, editMode: boolean, onChange: (v: string) => void, accentColor: string, textColor: string }> = ({ icon, label, value, editMode, onChange, accentColor, textColor }) => (
  <div className="flex items-center gap-8 px-10 py-8 transition-colors">
    <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] shrink-0" style={{ backgroundColor: `${textColor}0D`, color: `${textColor}80` }}>
      <span className="material-symbols-outlined text-[28px]">{icon}</span>
    </div>
    <div className="flex flex-col flex-1 min-w-0">
      <span className="text-[10px] font-black uppercase tracking-[0.4em] mb-2" style={{ color: `${textColor}40` }}>{label}</span>
      {editMode ? (
        <input
          autoFocus
          className="rounded-[1rem] border p-3 text-lg font-black w-full tracking-tight focus:ring-0 transition-all"
          style={{ backgroundColor: `${textColor}0D`, borderColor: `${textColor}1A`, color: textColor }}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <span className="text-xl font-black tracking-tight truncate italic" style={{ color: textColor }}>{value}</span>
      )}
    </div>
  </div>
);

export default ProfilePage;
