
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useClient } from '../../contexts/ClientContext';
import { INITIAL_USER } from '../../components/client/constants';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

const AuthPage: React.FC = () => {
  const { setUser } = useClient();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMsg('');

    setTimeout(() => {
      if (mode === 'login') {
        setUser({ ...INITIAL_USER, onboardingCompleted: true });
        navigate(`/m/${slug}`);
      } else if (mode === 'register') {
        setUser({ ...INITIAL_USER, onboardingCompleted: false });
        navigate(`/m/${slug}`);
      } else if (mode === 'forgot') {
        setMode('reset');
        setSuccessMsg('¡Enlace enviado! Revisa tu correo.');
      } else if (mode === 'reset') {
        setMode('login');
        setSuccessMsg('Contraseña actualizada con éxito.');
      }
      setIsLoading(false);
    }, 1200);
  };

  const getTitle = () => {
    switch (mode) {
      case 'login': return 'Bienvenido\nde nuevo';
      case 'register': return 'Únete al\nClub';
      case 'forgot': return 'Recuperar\nAcceso';
      case 'reset': return 'Nuevo\nAcceso';
      default: return '';
    }
  };

  return (
    <div className="relative flex flex-col min-h-screen bg-black animate-in fade-in duration-1000 overflow-x-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">

      {/* --- REFINED TECHNICAL HERO --- */}
      <div className="relative w-full h-[35vh] flex flex-col items-center justify-center overflow-hidden shrink-0 mt-4">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(54,226,123,0.04)_0%,transparent_70%)] z-10"></div>

        {/* --- BREW DRIPPER SCHEMATIC --- */}
        <div className="relative z-20 scale-90">
          <svg width="220" height="220" viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-[0_0_15px_rgba(54,226,123,0.1)]">
            {/* Isometric Base Plate */}
            <path d="M110 180L180 145L110 110L40 145L110 180Z" stroke="white" strokeWidth="0.5" strokeOpacity="0.1" />

            {/* Dripper Stand (V60 Style) */}
            <g className="animate-float-pro">
              {/* Top Ring of Dripper */}
              <ellipse cx="110" cy="70" rx="35" ry="15" stroke="white" strokeWidth="1" strokeOpacity="0.6" />
              {/* Conical Body */}
              <path d="M75 70L100 120H120L145 70" stroke="white" strokeWidth="1" strokeOpacity="0.4" />
              {/* Server (Bottom Glass) */}
              <path d="M90 125V145C90 155 130 155 130 145V125" stroke="white" strokeWidth="0.5" strokeOpacity="0.2" />
              <path d="M90 125C90 125 100 130 110 130C120 130 130 125 130 125" stroke="white" strokeWidth="0.5" strokeOpacity="0.2" />

              {/* Liquid Level Indicator */}
              <path d="M95 138C95 138 102 142 110 142C118 142 125 138 125 138" stroke="#36e27b" strokeWidth="1.5" strokeOpacity="0.6" className="animate-pulse" />
            </g>

            {/* Pouring Animation Lines */}
            <g className="opacity-40">
              <line x1="110" y1="40" x2="110" y2="65" stroke="#36e27b" strokeWidth="0.5" strokeDasharray="3 3" className="animate-data-stream-vertical" />
            </g>

            {/* Floating Technical Tag */}
            <g className="animate-card-sync">
              <rect x="145" y="85" width="45" height="18" rx="4" fill="black" fillOpacity="0.6" stroke="#36e27b" strokeWidth="0.5" />
              <text x="151" y="97" fill="#36e27b" fontSize="5" fontWeight="900" letterSpacing="0.1em" fontFamily="monospace">BREW-CONF</text>
            </g>

            <defs>
              <radialGradient id="baseGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(110 145) rotate(90) scale(20 40)">
                <stop stopColor="#36e27b" stopOpacity="0.3" />
                <stop offset="1" stopColor="#36e27b" stopOpacity="0" />
              </radialGradient>
            </defs>
          </svg>
        </div>

        {/* Refined Status Indicators */}
        <div className="absolute bottom-4 flex gap-8 opacity-30">
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[6px] font-black uppercase tracking-[0.4em] text-white/50">LINK_SECURE</span>
            <div className="w-1 h-1 rounded-full bg-primary animate-ping"></div>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[6px] font-black uppercase tracking-[0.4em] text-white/50">SYSTEM_FLOW</span>
            <div className="w-3 h-0.5 bg-primary/20 rounded-full overflow-hidden">
              <div className="h-full bg-primary w-full animate-data-stream"></div>
            </div>
          </div>
        </div>
      </div>

      {/* --- FORM SECTION --- */}
      <div className="flex-1 flex flex-col px-8 pb-10 relative z-20">
        <div className="mb-8 text-center">
          <h1 className="text-white tracking-tighter text-[34px] font-black leading-[0.9] uppercase italic mb-3 whitespace-pre-line">
            {getTitle()}
          </h1>
          <p className="text-white/30 text-[9px] font-black uppercase tracking-[0.5em] italic">
            Acceso Seguro de Miembros
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full max-w-[320px] mx-auto">
          {(mode !== 'reset') && (
            <div className="flex flex-col gap-2.5">
              <label className="text-white/20 text-[8px] font-black uppercase tracking-[0.5em] ml-6">Identificador</label>
              <input
                className="w-full rounded-[1.6rem] border border-white/5 bg-white/[0.03] h-16 px-8 text-[14px] font-bold transition-all focus:border-primary/30 focus:bg-white/[0.06] text-white placeholder:text-white/10 shadow-inner"
                placeholder="usuario@morningbrew.co"
                type="email"
                required
              />
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div className="flex flex-col gap-2.5">
              <label className="text-white/20 text-[8px] font-black uppercase tracking-[0.5em] ml-6">Token Secreto</label>
              <input
                className="w-full rounded-[1.6rem] border border-white/5 bg-white/[0.03] h-16 px-8 text-[14px] font-bold transition-all focus:border-primary/30 focus:bg-white/[0.06] text-white placeholder:text-white/10 shadow-inner"
                placeholder="••••••••"
                type="password"
                required
              />
            </div>
          )}

          {/* REFINED POWER BUTTON (h-20) */}
          <button
            type="submit"
            disabled={isLoading}
            className="group relative flex w-full items-center justify-between rounded-full h-20 bg-primary text-black pl-10 pr-4 shadow-[0_20px_50px_rgba(54,226,123,0.25)] active:scale-[0.97] transition-all duration-500 disabled:opacity-50 overflow-hidden mt-4 border border-white/20"
          >
            <div className="flex flex-col items-start leading-none text-left relative z-10">
              <span className="text-[13px] font-black uppercase tracking-tight">Autorizar</span>
              <span className="text-[13px] font-black uppercase tracking-tight opacity-40 italic">Acceso</span>
            </div>

            <div className="flex items-center gap-5 relative z-10">
              <div className="w-[1px] h-10 bg-black/10"></div>
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-black text-primary transition-all group-hover:scale-105 shadow-xl">
                {isLoading ? (
                  <span className="material-symbols-outlined animate-spin text-xl">refresh</span>
                ) : (
                  <span className="material-symbols-outlined font-black text-[28px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                )}
              </div>
            </div>

            <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          </button>
        </form>

        <div className="mt-auto pt-8 flex flex-col items-center gap-2">
          <button
            onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
            className="text-[9px] font-black text-white/20 hover:text-primary uppercase tracking-[0.5em] transition-all active:scale-95 py-3 px-6 italic"
          >
            {mode === 'register' ? '¿Ya eres miembro?' : 'Solicitar Membresía'}
          </button>
          <div className="w-12 h-[1px] bg-white/5"></div>
          <span className="text-[7px] font-black text-white/10 tracking-[1em] uppercase">Morning Brew v2.4</span>
        </div>
      </div>

      <style>{`
        @keyframes float-pro {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        .animate-float-pro { animation: float-pro 5s ease-in-out infinite; }

        @keyframes card-sync {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-3px, -8px); }
        }
        .animate-card-sync { animation: card-sync 7s cubic-bezier(0.4, 0, 0.2, 1) infinite; }

        @keyframes data-stream-vertical {
          0% { stroke-dashoffset: 20; }
          100% { stroke-dashoffset: 0; }
        }
        .animate-data-stream-vertical { 
          stroke-dasharray: 4 4;
          animation: data-stream-vertical 1s linear infinite; 
        }

        @keyframes data-stream {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .animate-data-stream { animation: data-stream 2s linear infinite; }
      `}</style>
    </div>
  );
};

export default AuthPage;
