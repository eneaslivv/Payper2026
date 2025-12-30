
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClient } from '../../contexts/ClientContext';

interface GuestGateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const GuestGateModal: React.FC<GuestGateModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { store } = useClient();
  const accentColor = store?.menu_theme?.accentColor || '#36e27b';
  const [view, setView] = useState<'gate' | 'how-it-works'>('gate');
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => setView('gate'), 300);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateProfile = () => {
    onClose();
    navigate('/auth');
  };

  const toggleView = (targetView: 'gate' | 'how-it-works') => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => {
      setView(targetView);
      setIsAnimating(false);
    }, 300);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-2xl animate-in fade-in duration-700 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[380px] bg-[#050806] rounded-[4rem] p-10 shadow-[0_40px_100px_rgba(0,0,0,0.9)] border border-white/[0.03] flex flex-col items-center relative overflow-hidden transition-all duration-500"
        onClick={(e) => e.stopPropagation()}
        style={{ minHeight: '540px' }}
      >
        {/* Soft Background Aura */}
        <div className={`absolute -top-24 left-1/2 -translate-x-1/2 w-[140%] h-64 blur-[110px] opacity-20 transition-all duration-1000 pointer-events-none ${view === 'gate' ? '' : 'bg-blue-500'}`} style={view === 'gate' ? { backgroundColor: accentColor } : {}}></div>

        <div className={`flex flex-col items-center w-full h-full transition-all duration-500 ${isAnimating ? 'opacity-0 scale-95 blur-md' : 'opacity-100 scale-100 blur-0'}`}>

          {/* VIEW: GATE (Main Prompt) */}
          {view === 'gate' && (
            <div className="flex flex-col items-center w-full text-center">
              {/* Premium Squircle Icon Container */}
              <div className="relative mb-12 group">
                <div className="absolute inset-0 blur-[35px] rounded-full animate-pulse" style={{ backgroundColor: `${accentColor}33` }}></div>
                <div className="w-24 h-24 rounded-[2.2rem] bg-gradient-to-br from-[#122218] to-[#0a140e] flex items-center justify-center relative z-10 border border-white/10 shadow-inner group-hover:scale-110 transition-transform duration-700">
                  <span className="material-symbols-outlined text-[42px] fill-icon" style={{ color: accentColor }}>person</span>
                  <div className="absolute inset-2 border border-white/[0.03] rounded-[1.8rem]"></div>
                </div>
              </div>

              <h2 className="text-[30px] font-black text-white mb-5 tracking-tighter leading-[0.9] uppercase italic">
                Crea tu perfil <br /> para pedir
              </h2>
              <p className="text-slate-500 text-[13px] font-medium leading-relaxed px-2 mb-12 opacity-80">
                Pide desde la mesa, paga sin esperas y acumula granos para cafés gratis.
              </p>
            </div>
          )}

          {/* VIEW: HOW IT WORKS (Explainer) */}
          {view === 'how-it-works' && (
            <div className="flex flex-col items-center w-full">
              <header className="flex items-center justify-between w-full mb-10">
                <button
                  onClick={() => toggleView('gate')}
                  className="w-12 h-12 rounded-2xl bg-white/5 text-slate-500 flex items-center justify-center active:scale-90 transition-all hover:text-white border border-white/[0.02]"
                >
                  <span className="material-symbols-outlined text-xl">arrow_back</span>
                </button>
                <span className="text-[9px] font-black uppercase tracking-[0.4em] italic" style={{ color: accentColor }}>Beneficios Club</span>
                <div className="w-12"></div>
              </header>

              <div className="flex flex-col gap-6 mb-12 w-full">
                <StepItem
                  delay="0s"
                  icon="qr_code_scanner"
                  title="Escaneá tu mesa"
                  desc="Accedé al menú digital interactivo al instante."
                />
                <StepItem
                  delay="0.1s"
                  icon="loyalty"
                  title="Sumá Granos"
                  desc="Cada compra te acerca a tu próximo café gratis."
                />
                <StepItem
                  delay="0.2s"
                  icon="auto_awesome"
                  title="Experiencia VIP"
                  desc="Pagá desde la app y recibí notificaciones en tiempo real."
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons Area */}
        <div className="mt-auto w-full flex flex-col gap-4">
          <button
            onClick={handleCreateProfile}
            className="group relative w-full h-[74px] rounded-full text-black font-black text-[13px] uppercase tracking-[0.15em] active:scale-[0.96] transition-all flex items-center justify-center gap-3 overflow-hidden shadow-2xl"
            style={{ backgroundColor: accentColor, boxShadow: `0 20px 40px ${accentColor}33` }}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="relative z-10">Crear Perfil (1 min)</span>
            <span className="material-symbols-outlined font-black group-hover:translate-x-1.5 transition-transform relative z-10">bolt</span>
          </button>

          {view === 'gate' && (
            <button
              onClick={() => toggleView('how-it-works')}
              className="w-full h-[74px] rounded-full bg-white/[0.03] text-slate-500 font-black text-[11px] uppercase tracking-[0.2em] active:scale-[0.96] transition-all border border-white/5 hover:text-white"
              style={{ '--hover-color': accentColor } as any}
            >
              Ver cómo funciona
            </button>
          )}

          {view === 'how-it-works' && (
            <button
              onClick={onClose}
              className="w-full h-12 text-slate-700 font-black text-[9px] uppercase tracking-[0.5em] transition-colors italic"
              style={{ '--hover-color': accentColor } as any}
            >
              Explorar menú primero
            </button>
          )}
        </div>

        {/* Modern Trust Indicator */}
        <div className="mt-10 flex items-center justify-center gap-3 opacity-30">
          <span className="material-symbols-outlined text-[18px] font-bold text-slate-400">verified_user</span>
          <span className="text-[8px] font-black uppercase tracking-[0.5em] text-slate-500">Seguro • Rápido • Simple</span>
        </div>
      </div>
    </div>
  );
};

const StepItem: React.FC<{ icon: string, title: string, desc: string, delay: string }> = ({ icon, title, desc, delay }) => {
  const { store } = useClient();
  const accentColor = store?.menu_theme?.accentColor || '#36e27b';

  return (
    <div
      className="flex items-center gap-6 p-1 animate-in fade-in slide-in-from-bottom-3 duration-700 fill-mode-both"
      style={{ animationDelay: delay }}
    >
      <div className="w-14 h-14 rounded-[1.4rem] bg-white/[0.03] flex items-center justify-center shrink-0 border border-white/[0.03] shadow-lg" style={{ color: accentColor }}>
        <span className="material-symbols-outlined text-2xl fill-icon">{icon}</span>
      </div>
      <div className="flex flex-col text-left">
        <h4 className="text-white text-[14px] font-black uppercase tracking-tight mb-1 italic">{title}</h4>
        <p className="text-slate-500 text-[11px] font-medium leading-snug opacity-80">{desc}</p>
      </div>
    </div>
  );
};

export default GuestGateModal;
