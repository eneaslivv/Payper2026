
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useClient } from '../../contexts/ClientContext';
import { INITIAL_USER } from '../../components/client/constants';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

const AuthPage: React.FC = () => {
  const { setUser, store } = useClient();
  const accentColor = store?.menu_theme?.accentColor || '#36e27b';
  const backgroundColor = store?.menu_theme?.backgroundColor || '#000000';
  const textColor = store?.menu_theme?.textColor || '#FFFFFF';

  const { slug } = useParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        // The ClientContext listener will handle the actual data fetching
        navigate(`/m/${slug}`);
      } else if (mode === 'register') {
        if (!store?.id) throw new Error('Tienda no identificada');

        const name = email.split('@')[0]; // Derive name from email for now

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              role: 'client', // Critical for RLS policies
              store_id: store.id // Critical for Multitenancy
            }
          }
        });

        if (authError) {
          console.error("Auth signup error:", authError);
          throw new Error(authError.message || 'Error al crear cuenta');
        }

        if (authData.user) {
          setSuccessMsg('¡Cuenta creada! Revisa tu correo si es necesario.');
          navigate(`/m/${slug}`);
        }
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + window.location.pathname + '#/reset-password',
        });
        if (error) throw error;
        setMode('forgot'); // Stay in forgot but show success
        setSuccessMsg('¡Enlace enviado! Revisa tu correo.');
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      setErrorMsg(err.message || 'Error en la autenticación');
    } finally {
      setIsLoading(false);
    }
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
    <div className="relative flex flex-col min-h-screen animate-in fade-in duration-1000 overflow-x-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-colors duration-500" style={{ backgroundColor, color: textColor }}>

      {/* --- REFINED TECHNICAL HERO --- */}
      <div className="relative w-full h-[35vh] flex flex-col items-center justify-center overflow-hidden shrink-0 mt-4">
        <div className="absolute inset-0 z-10" style={{ background: `radial-gradient(circle at center, ${accentColor}0A 0%, transparent 70%)` }}></div>

        {/* --- BREW DRIPPER SCHEMATIC --- */}
        <div className="relative z-20 scale-90">
          <svg width="220" height="220" viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-xl" style={{ filter: `drop-shadow(0 0 15px ${accentColor}1A)` }}>
            {/* Isometric Base Plate */}
            <path d="M110 180L180 145L110 110L40 145L110 180Z" stroke={textColor} strokeWidth="0.5" strokeOpacity="0.1" />

            {/* Dripper Stand (V60 Style) */}
            <g className="animate-float-pro">
              {/* Top Ring of Dripper */}
              <ellipse cx="110" cy="70" rx="35" ry="15" stroke={textColor} strokeWidth="1" strokeOpacity="0.6" />
              {/* Conical Body */}
              <path d="M75 70L100 120H120L145 70" stroke={textColor} strokeWidth="1" strokeOpacity="0.4" />
              {/* Server (Bottom Glass) */}
              <path d="M90 125V145C90 155 130 155 130 145V125" stroke={textColor} strokeWidth="0.5" strokeOpacity="0.2" />
              <path d="M90 125C90 125 100 130 110 130C120 130 130 125 130 125" stroke={textColor} strokeWidth="0.5" strokeOpacity="0.2" />

              {/* Liquid Level Indicator */}
              <path d="M95 138C95 138 102 142 110 142C118 142 125 138 125 138" stroke={accentColor} strokeWidth="1.5" strokeOpacity="0.6" className="animate-pulse" />
            </g>

            {/* Pouring Animation Lines */}
            <g className="opacity-40">
              <line x1="110" y1="40" x2="110" y2="65" stroke={accentColor} strokeWidth="0.5" strokeDasharray="3 3" className="animate-data-stream-vertical" />
            </g>

            {/* Floating Technical Tag */}
            <g className="animate-card-sync">
              <rect x="145" y="85" width="45" height="18" rx="4" fill={textColor} fillOpacity="0.1" stroke={accentColor} strokeWidth="0.5" />
              <text x="151" y="97" fill={accentColor} fontSize="5" fontWeight="900" letterSpacing="0.1em" fontFamily="monospace">CONF-ACCESO</text>
            </g>

            <defs>
              <radialGradient id="baseGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(110 145) rotate(90) scale(20 40)">
                <stop stopColor={accentColor} stopOpacity="0.3" />
                <stop offset="1" stopColor={accentColor} stopOpacity="0" />
              </radialGradient>
            </defs>
          </svg>
        </div>

        {/* Refined Status Indicators */}
        <div className="absolute bottom-4 flex gap-8 opacity-30">
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[6px] font-black uppercase tracking-[0.4em]" style={{ color: `${textColor}80` }}>ENLACE_SEGURO</span>
            <div className="w-1 h-1 rounded-full animate-ping" style={{ backgroundColor: accentColor }}></div>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <span className="text-[6px] font-black uppercase tracking-[0.4em]" style={{ color: `${textColor}80` }}>FLUJO_SISTEMA</span>
            <div className="w-3 h-0.5 rounded-full overflow-hidden" style={{ backgroundColor: `${accentColor}33` }}>
              <div className="h-full w-full animate-data-stream" style={{ backgroundColor: accentColor }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* --- FORM SECTION --- */}
      <div className="flex-1 flex flex-col px-8 pb-10 relative z-20">
        <div className="mb-8 text-center">
          <h1 className="tracking-tighter text-[34px] font-black leading-[0.9] uppercase italic mb-3 whitespace-pre-line" style={{ color: textColor }}>
            {getTitle()}
          </h1>
          <p className="text-[9px] font-black uppercase tracking-[0.5em] italic" style={{ color: `${textColor}4D` }}>
            Acceso Seguro de Miembros
          </p>
          {errorMsg && (
            <p className="mt-4 text-red-500 text-[10px] font-bold uppercase tracking-widest bg-red-500/10 p-3 rounded-xl border border-red-500/20">
              {errorMsg}
            </p>
          )}
          {successMsg && (
            <p
              className="mt-4 text-[10px] font-bold uppercase tracking-widest p-3 rounded-xl border"
              style={{ color: accentColor, backgroundColor: `${accentColor}1A`, borderColor: `${accentColor}33` }}
            >
              {successMsg}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full max-w-[320px] mx-auto">
          {(mode !== 'reset') && (
            <div className="flex flex-col gap-2.5">
              <label className="text-[8px] font-black uppercase tracking-[0.5em] ml-6" style={{ color: `${textColor}33` }}>Identificador</label>
              <input
                className="w-full rounded-[1.6rem] border h-16 px-8 text-[14px] font-bold transition-all outline-none shadow-inner"
                style={{
                  backgroundColor: `${textColor}05`,
                  borderColor: `${textColor}0D`,
                  color: textColor,
                  '--focus-border': accentColor
                } as any}
                placeholder="usuario@morningbrew.co"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'reset') && (
            <div className="flex flex-col gap-2.5">
              <label className="text-[8px] font-black uppercase tracking-[0.5em] ml-6" style={{ color: `${textColor}33` }}>Token Secreto</label>
              <div className="relative">
                <input
                  className="w-full rounded-[1.6rem] border h-16 pl-8 pr-12 text-[14px] font-bold transition-all outline-none shadow-inner"
                  style={{
                    backgroundColor: `${textColor}05`,
                    borderColor: `${textColor}0D`,
                    color: textColor,
                    '--focus-border': accentColor
                  } as any}
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-5 top-1/2 -translate-y-1/2 transition-colors outline-none flex items-center justify-center"
                  style={{ color: `${textColor}66` }}
                >
                  <span className="material-symbols-outlined text-xl">
                    {showPassword ? 'visibility' : 'visibility_off'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* REFINED POWER BUTTON (h-20) */}
          <button
            type="submit"
            disabled={isLoading}
            className="group relative flex w-full items-center justify-between rounded-full h-20 pl-10 pr-4 shadow-2xl active:scale-[0.97] transition-all duration-500 disabled:opacity-50 overflow-hidden mt-4 border border-white/20"
            style={{ backgroundColor: accentColor, boxShadow: `0 20px 50px ${accentColor}40`, color: '#000000' }}
          >
            <div className="flex flex-col items-start leading-none text-left relative z-10">
              <span className="text-[13px] font-black uppercase tracking-tight">Autorizar</span>
              <span className="text-[13px] font-black uppercase tracking-tight opacity-40 italic">Acceso</span>
            </div>

            <div className="flex items-center gap-5 relative z-10">
              <div className="w-[1px] h-10 bg-black/10"></div>
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center bg-black transition-all group-hover:scale-105 shadow-xl"
                style={{ color: accentColor }}
              >
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
            className="text-[9px] font-black uppercase tracking-[0.5em] transition-all active:scale-95 py-3 px-6 italic"
            style={{ color: `${textColor}33`, '--hover-color': accentColor } as any}
          >
            {mode === 'register' ? '¿Ya eres miembro?' : 'Solicitar Membresía'}
          </button>
          <div className="w-12 h-[1px]" style={{ backgroundColor: `${textColor}0D` }}></div>
          <span className="text-[7px] font-black tracking-[1em] uppercase" style={{ color: `${textColor}1A` }}>PAYPER v2.4</span>
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
