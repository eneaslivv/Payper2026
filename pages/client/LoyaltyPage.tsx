
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClient } from '../../contexts/ClientContext';
import { Voucher } from '../../components/client/types';
import LoyaltyLockedView from '../../components/client/LoyaltyLockedView';

const LoyaltyPage: React.FC = () => {
  const { user, setUser, store, isFeatureEnabled } = useClient();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'rewards' | 'vouchers' | 'benefits'>('rewards');
  const [showToast, setShowToast] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [showQR, setShowQR] = useState<{ isOpen: boolean; data: string; title: string }>({ isOpen: false, data: '', title: '' });
  const [progressWidth, setProgressWidth] = useState(0);

  useEffect(() => {
    if (store && !isFeatureEnabled('loyalty')) {
      navigate(`/m/${store.slug}`, { replace: true });
    }
  }, [store, isFeatureEnabled, navigate]);

  // Get accent color from store theme
  const accentColor = store?.menu_theme?.accentColor || '#4ADE80';
  const storeName = store?.name || 'Brew Club';

  if (!user) {
    return (
      <div className="flex flex-col min-h-screen pb-32 bg-background-dark font-display">
        <header className="sticky top-0 z-50 bg-background-dark/80 backdrop-blur-xl px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-4 border-b border-white/5">
          <h1 className="text-xl font-black tracking-tight uppercase">Brew Club</h1>
        </header>
        <LoyaltyLockedView title="Puntos y Recompensas" icon="stars" />
      </div>
    );
  }

  const tiers = [
    { level: 'Bronce', threshold: 0, text: 'Acumula 10 granos por cada $1 gastado.', color: 'from-orange-400 to-orange-600' },
    { level: 'Plata', threshold: 500, text: 'Bebida gratis en el mes de tu cumpleaños.', color: 'from-slate-300 to-slate-500' },
    { level: 'Oro', threshold: 1200, text: 'Acceso a eventos VIP y tuestes de edición limitada.', color: 'from-yellow-300 to-yellow-600' }
  ];

  const currentTierIndex = user.points < 500 ? 0 : user.points < 1200 ? 1 : 2;
  const currentTier = tiers[currentTierIndex];
  const nextTier = tiers[Math.min(currentTierIndex + 1, tiers.length - 1)];

  useEffect(() => {
    let percentage = 0;
    if (user.points < 500) {
      percentage = (user.points / 500) * 100;
    } else if (user.points < 1200) {
      percentage = ((user.points - 500) / (1200 - 500)) * 100;
    } else {
      percentage = 100;
    }
    const timer = setTimeout(() => setProgressWidth(percentage), 400);
    return () => clearTimeout(timer);
  }, [user.points]);

  const rewards = [
    { id: '1', name: 'Shot de Espresso Extra', desc: 'Añade más potencia a tu bebida', cost: 150, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBrG7Tc8jZT1GU4BBz_6vXvNYi59gLiM077nXSgBJSFH5GIEx9Tgr2Gkyl_y8q8ltSvJhYGp8MJXmPnOAxtAPofa04kUzILhHYG3VS_tYCah78aLii-VWkiwRQdbzUVJZ5NGZLo_XgosZ31UlEbMErPxdyZBB0xJKipOkVz_0smoFIgSMgHZU59ypEUfEIQrDHzOz2lDPxbCvUgjq27xcALjn-WhWMVWFONqJuUycIitFYtyeDGLRTHDZJxPG4bUOoIFnQMseiFiMXf' },
    { id: '2', name: 'Muffin de Arándanos', desc: 'Horneado fresco cada mañana', cost: 450, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDBqEQ-f5Ka7YoMbZW2fxDJAcclLiLH904s6W25LneSzU_BCOvsGFsrTqvD3k48MDyvgzYcvU-PkwZ_mWa2rDQpwmAgPjbM77G2dH0I0nc_-FX7kTxyo2IrblptZfo0HuC0gOBn50l7TUXg4uHX4VUtM85uCxw9YISDfjISHNcMPB_uUrlwyb4FaPV9TP-sALG1xvt16q8VlwaCkAaD5BCDXKCYlBds8C8cgqGiTs78mLXES1Cy3xJ7onXCfr5RF8WeoZMPQoziWxOp' },
    { id: '3', name: 'Signature Latte', desc: 'Cualquier especialidad de la barra espresso', cost: 750, image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAbveLLEhnRaaKZBq38pWEhQH1Q12wEIfMximd77xtQ39mamOu7sFJ4v3tnNXL4DWR6xgK6D6Tvfb5vs9zfw8oNAbwhP8reupT-Hkq27R4WaT6aH7Px2mTFrxKD88yGlUUPBOp0TxfmhgA6jPNWeTxGgSS6XLvs1Wcv8zst06Lsb39D855hkNkuW-DFZwidcxNwJQ4ol886abc68R9QUCKgluAIbfGFRDXA2s3qvSNuS3a-AHt6ct7cu-Ni1T1U_XXWliT5tEtLNGyk' }
  ];

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleRedeem = (cost: number, name: string) => {
    if (user.points >= cost) {
      const newVoucher: Voucher = {
        id: `vouch_${Date.now()}`,
        name: `Premio: ${name}`,
        expiry: '30 días',
        type: 'redemption'
      };
      setUser({
        ...user,
        points: user.points - cost,
        vouchers: [newVoucher, ...user.vouchers]
      });
      triggerToast(`¡Canjeado exitosamente!`);
      setShowQR({ isOpen: true, data: newVoucher.id, title: newVoucher.name });
    }
  };

  return (
    <div className="flex flex-col min-h-screen pb-32 bg-background-light dark:bg-background-dark font-display overflow-x-hidden">
      <header className="sticky top-0 z-50 px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-6 flex justify-between items-center border-b border-white/5 bg-black/80 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center ring-1"
            style={{ backgroundColor: `${accentColor}20`, color: accentColor, borderColor: `${accentColor}33` }}
          >
            <span className="material-symbols-outlined fill-icon">loyalty</span>
          </div>
          <h1 className="text-xl font-black tracking-tight uppercase italic text-white">{storeName} Club</h1>
        </div>
        <button
          onClick={() => setShowQR({ isOpen: true, data: user.id, title: 'Miembro del Club' })}
          className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center active:scale-90 transition-transform border border-white/5 shadow-xl"
          style={{ color: accentColor }}
        >
          <span className="material-symbols-outlined">qr_code</span>
        </button>
      </header>

      <main className="p-4 flex flex-col gap-8">
        <div className="relative h-72 w-full rounded-[2.5rem] bg-gradient-to-br from-[#1c3024] via-[#0e1a12] to-[#0a110b] shadow-2xl p-8 flex flex-col justify-between overflow-hidden border border-white/10 group">
          <div className="absolute top-0 right-0 w-64 h-64 blur-[100px] rounded-full group-hover:opacity-60 transition-all duration-1000 ease-in-out opacity-40" style={{ backgroundColor: `${accentColor}33` }}></div>

          <div className="relative z-10 flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.3em] font-black italic" style={{ color: `${accentColor}99` }}>Nivel de Membresía</span>
              <h2 className="text-white text-[32px] font-black tracking-tighter uppercase italic leading-none">{user.name}</h2>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 bg-white/5 backdrop-blur-xl px-4 py-2 rounded-2xl border border-white/10 shadow-lg">
                <div className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${currentTier.color} shadow-[0_0_10px_rgba(255,255,255,0.3)]`}></div>
                <span className="text-[11px] font-black text-white uppercase tracking-widest">{currentTier.level}</span>
              </div>
            </div>
          </div>

          <div className="relative z-10 w-full">
            <div className="flex justify-between items-end mb-4">
              <div className="flex flex-col">
                <span className="text-5xl font-black text-white tracking-tighter flex items-end gap-2 leading-none">
                  {user.points.toLocaleString()}
                  <span className="text-[10px] font-black tracking-[0.3em] uppercase mb-1.5 italic" style={{ color: accentColor }}>Granos</span>
                </span>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-2 flex items-center gap-2">
                  <span>Faltan {nextTier.threshold - user.points > 0 ? nextTier.threshold - user.points : 0} para {nextTier.level}</span>
                  <span className="material-symbols-outlined text-[12px] animate-bounce-x" style={{ color: accentColor }}>trending_flat</span>
                </p>
              </div>
              <button
                onClick={() => setShowQR({ isOpen: true, data: user.id, title: 'ID de Miembro' })}
                className="w-16 h-16 rounded-[1.5rem] border flex items-center justify-center group-hover:scale-110 transition-all duration-500 shadow-xl backdrop-blur-sm"
                style={{ backgroundColor: `${accentColor}1A`, borderColor: `${accentColor}33`, color: accentColor }}
              >
                <span className="material-symbols-outlined text-4xl fill-icon">qr_code</span>
              </button>
            </div>

            <div className="relative w-full h-4 bg-black/40 rounded-full overflow-hidden border border-white/5 p-[3px] shadow-inner">
              <div
                className={`h-full bg-gradient-to-r ${nextTier.color} transition-all duration-[1200ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] rounded-full relative`}
                style={{ width: `${progressWidth}%` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex p-1.5 bg-surface-light dark:bg-surface-dark rounded-[2.5rem] border border-gray-200 dark:border-white/5 shadow-xl">
          {(['rewards', 'vouchers', 'benefits'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-4 px-2 rounded-[2rem] text-[9px] font-black uppercase tracking-widest transition-all duration-500 ${activeTab === tab
                ? 'text-black shadow-lg'
                : 'text-slate-500 hover:text-slate-300'
                }`}
              style={activeTab === tab ? { backgroundColor: accentColor, boxShadow: `0 10px 20px -5px ${accentColor}4D` } : {}}
            >
              {tab === 'rewards' ? 'Canjes' : tab === 'vouchers' ? 'Mis Vales' : 'Beneficios'}
            </button>
          ))}
        </div>

        {activeTab === 'rewards' && (
          <div className="grid grid-cols-1 gap-5">
            {rewards.map(reward => {
              const canAfford = user.points >= reward.cost;
              return (
                <div key={reward.id} className="group relative flex items-center gap-5 p-5 rounded-[2.5rem] bg-surface-light dark:bg-surface-dark border border-gray-200 dark:border-white/5 shadow-lg active:scale-[0.98] transition-all duration-300">
                  <div className="w-24 h-24 rounded-3xl overflow-hidden shrink-0 border border-gray-100 dark:border-white/5 shadow-inner">
                    <img src={reward.image} alt={reward.name} className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${!canAfford ? 'grayscale opacity-60' : ''}`} />
                  </div>
                  <div className="flex-1 flex flex-col justify-center">
                    <h4 className="font-black text-lg leading-tight tracking-tight uppercase italic">{reward.name}</h4>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-1 font-medium">{reward.desc}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${canAfford ? '' : 'bg-white/5 text-slate-600'}`} style={canAfford ? { backgroundColor: `${accentColor}1A`, color: accentColor } : {}}>
                        {reward.cost} Granos
                      </div>
                    </div>
                  </div>
                  <button
                    disabled={!canAfford}
                    onClick={() => handleRedeem(reward.cost, reward.name)}
                    className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-all duration-500 ${canAfford
                      ? 'text-black'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-400 opacity-50'
                      }`}
                    style={canAfford ? { backgroundColor: accentColor, boxShadow: `0 10px 25px -5px ${accentColor}40` } : {}}
                  >
                    <span className="material-symbols-outlined font-black text-2xl">redeem</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'vouchers' && (
          <div className="flex flex-col gap-5">
            {user.vouchers.length === 0 ? (
              <div className="py-24 text-center opacity-20">
                <span className="material-symbols-outlined text-6xl mb-4">confirmation_number</span>
                <p className="text-[10px] font-black uppercase tracking-[0.3em]">Sin beneficios activos</p>
              </div>
            ) : (
              user.vouchers.map(v => (
                <div key={v.id} className="flex items-center gap-5 bg-surface-dark p-5 rounded-[2.5rem] border border-white/5 shadow-xl group transition-all" style={{ hoverBorderColor: accentColor }}>
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0" style={v.type === 'gift' ? { backgroundColor: 'rgba(249, 115, 22, 0.1)', color: '#f97316' } : { backgroundColor: `${accentColor}1A`, color: accentColor }}>
                    <span className="material-symbols-outlined text-3xl font-black">{v.type === 'gift' ? 'redeem' : 'confirmation_number'}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-base tracking-tight uppercase italic">{v.name}</p>
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mt-1.5">Expira: {v.expiry}</p>
                  </div>
                  <button
                    onClick={() => setShowQR({ isOpen: true, data: v.id, title: v.name })}
                    className="bg-white/5 h-14 w-14 rounded-2xl flex items-center justify-center text-slate-400 transition-all active:scale-90"
                    style={{ hoverColor: accentColor }}
                  >
                    <span className="material-symbols-outlined text-3xl font-black">qr_code_2</span>
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'benefits' && (
          <div className="flex flex-col gap-6">
            {tiers.map((t, i) => (
              <div key={t.level} className={`p-8 rounded-[3rem] border flex flex-col gap-4 relative overflow-hidden transition-all duration-500 ${i <= currentTierIndex ? 'bg-surface-dark' : 'bg-white/5 border-white/5 opacity-40'}`} style={i <= currentTierIndex ? { borderColor: `${accentColor}33` } : {}}>
                <div className="flex justify-between items-center">
                  <div className="flex flex-col">
                    <span className={`text-[10px] font-black uppercase tracking-[0.3em] ${i <= currentTierIndex ? '' : 'text-slate-600'}`} style={i <= currentTierIndex ? { color: accentColor } : {}}>Nivel {i + 1}</span>
                    <h4 className="text-2xl font-black uppercase italic tracking-tighter mt-1">{t.level}</h4>
                  </div>
                  {i <= currentTierIndex ? (
                    <span className="material-symbols-outlined fill-icon text-3xl" style={{ color: accentColor }}>verified</span>
                  ) : (
                    <span className="material-symbols-outlined text-slate-700 text-3xl">lock</span>
                  )}
                </div>
                <p className="text-sm font-medium text-slate-400 leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {showQR.isOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/95 backdrop-blur-2xl animate-in fade-in duration-500">
          <div className="w-full max-w-sm flex flex-col items-center">
            <div className="w-full bg-white rounded-[4rem] p-12 shadow-[0_0_80px_rgba(54,226,123,0.4)] mb-12 animate-in zoom-in-95 duration-500">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${showQR.data}&color=112117`}
                alt="Código QR"
                className="w-full aspect-square opacity-90"
              />
            </div>
            <h3 className="text-[28px] font-black text-white uppercase tracking-tighter italic text-center mb-3 leading-none">{showQR.title}</h3>
            <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.4em] mb-14 text-center leading-relaxed">Presenta este código al barista<br />para hacerlo efectivo</p>
            <button
              onClick={() => setShowQR({ ...showQR, isOpen: false })}
              className="w-20 h-20 rounded-full bg-white/5 text-white flex items-center justify-center border border-white/10 hover:bg-white/10 transition-all active:scale-90"
            >
              <span className="material-symbols-outlined text-4xl">close</span>
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-150%); }
          100% { transform: translateX(150%); }
        }
        .animate-shimmer {
          animation: shimmer 3s infinite ease-in-out;
        }
        @keyframes bounce-x {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(5px); }
        }
        .animate-bounce-x {
          animation: bounce-x 1s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default LoyaltyPage;
