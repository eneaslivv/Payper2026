
import React, { useState } from 'react';
import { useClient } from '../../contexts/ClientContext';

interface OnboardingOverlayProps {
  onComplete: () => void;
}

const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ onComplete }) => {
  const { store } = useClient();
  const accentColor = store?.menu_theme?.accentColor || '#36e27b';
  const [step, setStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const steps = [
    {
      id: 'order',
      title: 'ORDENA DESDE\nTU MESA',
      desc: 'Escanea el código QR y olvida las filas. Tu pedido llega directo de la barra a tus manos de forma inmediata.',
      color: accentColor, // Dynamic Emerald/Accent
    },
    {
      id: 'points',
      title: 'SISTEMA DE\nGRANOS',
      desc: 'Cada compra genera recompensas. Acumula granos y canjéalos por bebidas gratis o beneficios de membresía.',
      color: '#fbbf24', // Amber
    },
    {
      id: 'qr',
      title: 'TU ACCESO\nDIGITAL',
      desc: 'Gestiona tus pedidos, pagos y nivel del club de forma segura con tu identificador único de miembro.',
      color: '#0ea5e9', // Sky Blue
    }
  ];

  const handleNext = () => {
    if (isAnimating) return;
    if (step < steps.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setStep(step + 1);
        setIsAnimating(false);
      }, 500);
    } else {
      onComplete();
    }
  };

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-between overflow-hidden touch-none font-display max-w-md mx-auto transition-colors duration-1000">

      {/* Dynamic Background Glow */}
      <div
        className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[200%] h-[80%] rounded-full blur-[140px] transition-all duration-1000 ease-in-out opacity-20 pointer-events-none"
        style={{ backgroundColor: current.color }}
      ></div>

      {/* Dynamic Progress Bar */}
      <div className="w-full px-12 pt-16 flex gap-3 z-50">
        {steps.map((s, i) => (
          <div key={`onboarding-step-${s.id || s.title || i}`} className="flex-1 h-[2px] rounded-full bg-white/5 relative overflow-hidden">
            <div
              className={`absolute inset-0 transition-all duration-1000 cubic-bezier(0.4, 0, 0.2, 1)`}
              style={{
                width: i <= step ? '100%' : '0%',
                backgroundColor: i === step ? current.color : (i < step ? steps[i].color : 'transparent'),
                opacity: i <= step ? 1 : 0
              }}
            ></div>
          </div>
        ))}
      </div>

      {/* Main Content Area */}
      <div className={`flex-1 flex flex-col items-center justify-center p-8 text-center transition-all duration-700 ease-out transform w-full ${isAnimating ? 'opacity-0 scale-95 blur-xl' : 'opacity-100 scale-100 blur-0'
        }`}>

        {/* Illustrations Refined */}
        <div className="mb-12 relative w-full flex items-center justify-center min-h-[300px]">
          {step === 0 && (
            <div className="relative animate-in zoom-in duration-1000">
              <div className="absolute inset-0 blur-[80px] rounded-full animate-pulse-slow opacity-30" style={{ backgroundColor: current.color }}></div>
              <svg viewBox="0 0 200 200" className="w-64 h-64 relative text-white">
                <path d="M100 20 L100 120" stroke={current.color} strokeWidth="6" strokeLinecap="round" strokeDasharray="1 15" className="opacity-20" />
                <path d="M100 20 L100 70" stroke={current.color} strokeWidth="4" strokeLinecap="round" className="animate-pour-liquid" />
                <path d="M65 110 L135 110 C135 110 135 155 100 155 C65 155 65 110 65 110 Z" fill="none" stroke="white" strokeWidth="2.5" strokeOpacity="0.4" />
                <path d="M135 120 Q150 120 150 130 Q150 140 135 140" fill="none" stroke="white" strokeWidth="2.5" strokeOpacity="0.4" />
                <path d="M68 113 L132 113 Q132 152 100 152 Q68 152 68 113 Z" fill={current.color} fillOpacity="0.3" className="animate-fill-inner-cup" />
              </svg>
            </div>
          )}

          {step === 1 && (
            <div className="relative animate-in zoom-in duration-1000">
              <div className="absolute inset-0 blur-[100px] rounded-full opacity-30" style={{ backgroundColor: current.color }}></div>
              <div className="relative w-64 h-64 flex items-center justify-center">
                {[...Array(8)].map((_, i) => (
                  <div
                    key={`float-particle-${i}`}
                    className="absolute w-2 h-3 rounded-full animate-kinetic-float"
                    style={{
                      backgroundColor: current.color,
                      left: `${50 + Math.cos(i * 45 * Math.PI / 180) * 40}%`,
                      top: `${50 + Math.sin(i * 45 * Math.PI / 180) * 40}%`,
                      animationDelay: `${i * 0.3}s`,
                      opacity: 0.4
                    }}
                  ></div>
                ))}
                <div className="w-24 h-24 rounded-3xl bg-white/[0.03] backdrop-blur-3xl border border-white/10 flex items-center justify-center shadow-2xl">
                  <span className="material-symbols-outlined text-5xl fill-icon animate-pulse" style={{ color: current.color }}>stars</span>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="relative animate-in zoom-in duration-1000">
              <div className="w-64 h-80 relative flex items-center justify-center">
                <div className="w-44 h-60 bg-[#080808] rounded-2xl border border-white/5 shadow-2xl backdrop-blur-xl relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-[1px] shadow-[0_0_15px_rgba(255,255,255,1)] animate-scanning-tech" style={{ backgroundColor: current.color }}></div>
                  <div className="p-6 flex flex-col h-full justify-between opacity-40">
                    <div className="w-1/2 h-1 bg-white/10 rounded-full"></div>
                    <div className="grid grid-cols-4 gap-2">
                      {[...Array(12)].map((_, i) => (
                        <div key={`grid-item-${i}`} className={`aspect-square rounded-sm ${i % 3 === 0 || i % 7 === 0 ? 'bg-white/10' : 'bg-transparent border border-white/5'}`}></div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      <div className="w-full h-2 bg-white/5 rounded-full"></div>
                      <div className="w-2/3 h-2 bg-white/5 rounded-full"></div>
                    </div>
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 w-12 h-12 blur-xl rounded-full opacity-20" style={{ backgroundColor: current.color }}></div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-5 max-w-sm">
          <h2 className="text-[38px] font-black text-white tracking-tighter leading-[0.9] uppercase italic whitespace-pre-line">
            {current.title}
          </h2>
          <p className="text-white/30 text-[13px] font-medium leading-relaxed max-w-[280px] mx-auto tracking-tight">
            {current.desc}
          </p>
        </div>
      </div>

      {/* Dynamic Action Button Area */}
      <div className="w-full px-8 pb-16 z-[60] flex flex-col items-center">
        <div className="w-full flex flex-col gap-6">
          <button
            onClick={handleNext}
            className="group relative w-full h-20 rounded-full text-black font-black text-[13px] uppercase tracking-[0.2em] active:scale-[0.96] transition-all duration-700 flex items-center justify-center overflow-hidden shadow-2xl border border-white/10"
            style={{ backgroundColor: current.color }}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <span className="relative z-10 flex items-center gap-4">
              {step < steps.length - 1 ? 'CONTINUAR' : 'COMENZAR'}
              <span className="material-symbols-outlined font-black group-hover:translate-x-1 transition-transform text-2xl">
                {step < steps.length - 1 ? 'arrow_forward' : 'bolt'}
              </span>
            </span>
          </button>

          <button
            onClick={onComplete}
            className="text-white/10 font-black text-[9px] uppercase tracking-[0.4em] hover:text-white transition-all py-2 active:opacity-50 italic"
          >
            SALTAR INTRODUCCIÓN
          </button>
        </div>
      </div>

      <style>{`
        @keyframes pour-liquid {
          0% { transform: scaleY(0); transform-origin: top; }
          100% { transform: scaleY(1); transform-origin: top; }
        }
        .animate-pour-liquid { animation: pour-liquid 1.5s ease-in-out infinite; }
        
        @keyframes fill-inner-cup {
          0% { transform: scaleY(0); transform-origin: bottom; opacity: 0; }
          100% { transform: scaleY(1); transform-origin: bottom; opacity: 1; }
        }
        .animate-fill-inner-cup { animation: fill-inner-cup 3s ease-out forwards; }

        @keyframes kinetic-float {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(4px, -8px); }
        }
        .animate-kinetic-float { animation: kinetic-float 4s infinite ease-in-out; }

        @keyframes scanning-tech {
          0% { top: 0%; opacity: 0; }
          20% { opacity: 1; }
          80% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .animate-scanning-tech { animation: scanning-tech 3s infinite linear; }

        @keyframes pulse-slow {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.1); }
        }
        .animate-pulse-slow { animation: pulse-slow 5s infinite ease-in-out; }
      `}</style>
    </div>
  );
};

export default OnboardingOverlay;
