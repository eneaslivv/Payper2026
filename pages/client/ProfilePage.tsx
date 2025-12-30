
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../contexts/ClientContext';
import { OrderHistoryItem } from '../../components/client/types';
import LoyaltyLockedView from '../../components/client/LoyaltyLockedView';
import UserIdentityQR from '../../components/client/UserIdentityQR';

const ProfilePage: React.FC = () => {
  const { user, setUser, addToCart, products, store } = useClient();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState<Partial<typeof user>>(user || {});

  const accentColor = store?.menu_theme?.accentColor || '#4ADE80';

  const [showTopUp, setShowTopUp] = useState(false);
  const [showQR, setShowQR] = useState<{ isOpen: boolean; data: string; title: string }>({ isOpen: false, data: '', title: '' });
  const [selectedAmount, setSelectedAmount] = useState<number | null>(20);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen pb-32 bg-black font-display text-white">
        <header className="sticky top-0 z-50 bg-black/95 backdrop-blur-3xl px-6 pt-[calc(1.2rem+env(safe-area-inset-top))] pb-6 border-b border-white/5">
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
      const { data, error } = await (supabase.rpc as any)('admin_add_balance', {
        p_user_id: user.id,
        p_amount: amount,
        p_description: 'Recarga de Saldo (Cliente)'
      });

      if (error) throw error;

      setUser({ ...user, balance: user.balance + amount });
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
      const menuItem = products.find(i => i.name.toLowerCase() === name.toLowerCase());
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
    <div className="flex flex-col min-h-screen pb-40 bg-black font-display text-white overflow-x-hidden">
      {/* HEADER OPTIMIZADO PARA IPHONE */}
      <div className="flex items-center justify-between px-6 pt-[calc(1.2rem+env(safe-area-inset-top))] pb-6 sticky top-0 bg-black/95 backdrop-blur-3xl z-30 border-b border-white/5">
        <div className="w-12"></div>
        <h2 className="text-xl font-black flex-1 text-center tracking-tight uppercase italic leading-none">Tu Perfil</h2>
        <div className="flex w-12 items-center justify-end">
          <button onClick={() => setUser(null)} className="flex items-center justify-center h-12 w-12 text-slate-700 hover:text-red-500 transition-colors active:scale-90">
            <span className="material-symbols-outlined text-2xl">logout</span>
          </button>
        </div>
      </div>

      <main className="p-4 flex flex-col gap-10">
        <div className="flex flex-col items-center bg-white/[0.02] rounded-[3rem] p-12 shadow-2xl border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-[100px] -mr-20 -mt-20"></div>
          <div className="relative group cursor-pointer" onClick={() => setShowQR({ isOpen: true, data: user.id, title: 'Tu ID de Miembro' })}>
            <div
              className="rounded-[2.2rem] h-40 w-40 shadow-2xl ring-2 ring-white/10 bg-cover bg-center overflow-hidden transition-transform duration-700 group-hover:scale-105"
              style={{ backgroundImage: `url(${user.avatar})` }}
            ></div>
            <div className="absolute bottom-3 right-3 h-12 w-12 rounded-[1rem] flex items-center justify-center border-4 border-[#000] shadow-xl" style={{ backgroundColor: accentColor }}>
              <span className="material-symbols-outlined text-black text-2xl font-black fill-icon">qr_code_2</span>
            </div>
          </div>
          <div className="mt-8 text-center">
            <h1 className="text-[34px] font-black tracking-tighter uppercase italic leading-none">{user.name}</h1>
            <p className="text-white/30 text-[10px] font-black uppercase tracking-[0.4em] mt-4 italic">{user.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5">
          <div className="bg-white/[0.02] rounded-[2.5rem] p-8 border border-white/5 flex flex-col items-center justify-center gap-2 shadow-xl">
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20 mb-2">Saldo</span>
            <span className="text-[32px] font-black text-white tracking-tighter italic leading-none">${user.balance.toFixed(2)}</span>
            <button
              onClick={() => setShowTopUp(true)}
              className="mt-6 h-14 flex items-center justify-center text-black px-10 rounded-full text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl border border-white/20"
              style={{ backgroundColor: accentColor }}
            >
              Recargar
            </button>
          </div>
          <div className="bg-white/[0.02] rounded-[2.5rem] p-8 border border-white/5 flex flex-col items-center justify-center gap-2 shadow-xl">
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20 mb-2">Puntos</span>
            <span className="text-[32px] font-black text-white tracking-tighter italic leading-none">{user.points}</span>
            <button
              onClick={() => navigate('/loyalty')}
              className="mt-6 h-14 flex items-center justify-center bg-white/5 text-slate-300 px-10 rounded-full text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all border border-white/10"
            >
              Canjear
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between px-3">
            <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-white/30 italic">Información Personal</h3>
            <button onClick={() => editMode ? handleSave() : setEditMode(true)} className="text-[10px] font-black uppercase tracking-[0.3em] active:scale-90 transition-transform" style={{ color: accentColor }}>
              {editMode ? 'Guardar' : 'Editar'}
            </button>
          </div>
          <div className="bg-white/[0.02] rounded-[2.5rem] overflow-hidden shadow-2xl border border-white/5 flex flex-col divide-y divide-white/5">
            <EditableInfoItem icon="person" label="Nombre" value={formData.name || ''} editMode={editMode} onChange={(v) => setFormData({ ...formData, name: v })} accentColor={accentColor} />
            <EditableInfoItem icon="call" label="Teléfono" value={formData.phone || ''} editMode={editMode} onChange={(v) => setFormData({ ...formData, phone: v })} accentColor={accentColor} />
          </div>
        </div>

        {/* HISTORIAL DE PEDIDOS */}
        <div className="flex flex-col gap-6 mt-4">
          <div className="flex items-center justify-between px-3">
            <h3 className="text-[11px] font-black uppercase tracking-[0.5em] text-white/30 italic">Historial de Actividad</h3>
          </div>
          <div className="flex flex-col gap-4">
            {user.orderHistory.map(order => (
              <div key={order.id} className="bg-white/[0.02] rounded-[2.2rem] p-7 border border-white/5 shadow-xl flex flex-col gap-5 relative overflow-hidden group">
                <div className="flex justify-between items-start">
                  <div className="flex flex-col gap-1">
                    <span className="text-[8px] font-black text-white/20 uppercase tracking-[0.3em] italic">{order.date} • {order.id}</span>
                    <p className="text-[13px] font-black text-white/90 italic tracking-tight leading-tight max-w-[200px]">{order.items}</p>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[18px] font-black text-white italic tracking-tighter leading-none">${order.total.toFixed(2)}</span>
                    <span className="text-[7px] font-black uppercase tracking-widest mt-2" style={{ color: accentColor }}>Completado</span>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2 pt-5 border-t border-white/[0.03]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px] fill-icon" style={{ color: accentColor }}>stars</span>
                    <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">+{order.pointsEarned || 0} Granos</span>
                  </div>
                  <button
                    onClick={() => handleOrderAgain(order)}
                    className="flex items-center gap-3 h-11 px-6 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest active:scale-95 transition-all group/btn"
                    style={{ color: accentColor }}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl animate-in fade-in duration-500">
          <div className="bg-[#080808] w-full max-w-sm rounded-[3rem] p-10 shadow-[0_40px_100px_rgba(0,0,0,1)] animate-in zoom-in-95 duration-300 border border-white/5">
            <div className="flex justify-between items-center mb-10">
              <h2 className="text-[26px] font-black uppercase tracking-tighter italic text-white leading-none">Recargar</h2>
              <button onClick={() => setShowTopUp(false)} className="h-12 w-12 rounded-xl bg-white/5 flex items-center justify-center text-white/20 active:scale-90">
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="space-y-8">
              <div className="grid grid-cols-3 gap-3">
                {[10, 20, 50].map(amount => (
                  <button
                    key={amount}
                    onClick={() => selectPreset(amount)}
                    className={`h-20 rounded-2xl font-black text-[20px] italic transition-all duration-500 border ${selectedAmount === amount
                      ? 'text-black'
                      : 'bg-white/[0.02] text-white/20 border-white/5'
                      }`}
                    style={selectedAmount === amount ? { backgroundColor: accentColor, borderColor: accentColor } : {}}
                  >
                    ${amount}
                  </button>
                ))}
              </div>
              <div className="relative group">
                <label className="text-[8px] font-black uppercase tracking-[0.4em] text-white/20 ml-5 mb-2 block italic">Monto Personalizado</label>
                <div className="flex items-center h-20 px-8 rounded-2xl border bg-white/[0.01] border-white/5">
                  <span className="text-xl font-black italic mr-3 text-white/10">$</span>
                  <input
                    type="number"
                    value={customAmount}
                    onChange={(e) => handleCustomInput(e.target.value)}
                    placeholder="OTRO MONTO..."
                    className="bg-transparent border-none p-0 text-xl font-black italic text-white placeholder:text-white/5 focus:ring-0 w-full tracking-tighter"
                  />
                </div>
              </div>
              <button
                onClick={handleConfirmTopUp}
                disabled={isProcessing || (!selectedAmount && !customAmount)}
                className={`w-full h-24 rounded-full font-black uppercase text-[14px] tracking-[0.15em] active:scale-[0.97] transition-all duration-700 flex items-center justify-center gap-4 border border-white/20 ${(selectedAmount || customAmount)
                  ? 'text-black'
                  : 'bg-white/5 text-white/10 grayscale cursor-not-allowed'
                  }`}
                style={(selectedAmount || customAmount) ? { backgroundColor: accentColor, boxShadow: `0 25px 60px -10px ${accentColor}4D` } : {}}
              >
                {isProcessing ? (
                  <span className="material-symbols-outlined animate-spin text-[32px]">refresh</span>
                ) : (
                  <>
                    <div className="flex flex-col items-start leading-none text-left">
                      <span>Confirmar</span>
                      <span className="text-[10px] opacity-40 italic">Carga Segura</span>
                    </div>
                    <span className="material-symbols-outlined font-black text-[24px]">verified_user</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {showQR.isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/98 backdrop-blur-2xl animate-in fade-in duration-500" onClick={() => setShowQR({ ...showQR, isOpen: false })}>
          <div className="w-full max-w-sm flex flex-col items-center" onClick={e => e.stopPropagation()}>
            {/* User Identity QR Component */}
            <UserIdentityQR userCode={showQR.data} userName={user?.name || 'Cliente'} />

            <button
              onClick={() => setShowQR({ ...showQR, isOpen: false })}
              className="mt-8 w-20 h-20 rounded-full bg-white/5 text-white flex items-center justify-center border border-white/10 active:scale-90 transition-transform"
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

const EditableInfoItem: React.FC<{ icon: string, label: string, value: string, editMode: boolean, onChange: (v: string) => void, accentColor: string }> = ({ icon, label, value, editMode, onChange, accentColor }) => (
  <div className="flex items-center gap-8 px-10 py-8 transition-colors">
    <div className="flex h-14 w-14 items-center justify-center rounded-[1.2rem] bg-white/5 text-slate-700 shrink-0">
      <span className="material-symbols-outlined text-[28px]">{icon}</span>
    </div>
    <div className="flex flex-col flex-1 min-w-0">
      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20 mb-2">{label}</span>
      {editMode ? (
        <input
          autoFocus
          className="bg-white/5 rounded-[1rem] border border-white/10 p-3 text-lg font-black w-full text-white tracking-tight focus:ring-0 transition-all"
          style={{ focusBorderColor: accentColor }}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <span className="text-xl font-black tracking-tight truncate italic">{value}</span>
      )}
    </div>
  </div>
);

export default ProfilePage;
