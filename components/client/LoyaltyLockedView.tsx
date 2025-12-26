
import React from 'react';
import { useNavigate } from 'react-router-dom';

interface LoyaltyLockedViewProps {
  title: string;
  icon: string;
}

const LoyaltyLockedView: React.FC<LoyaltyLockedViewProps> = ({ title, icon }) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] p-8 text-center animate-in fade-in duration-700">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-[2rem] bg-white/5 flex items-center justify-center text-slate-700">
          <span className="material-symbols-outlined text-5xl">{icon}</span>
        </div>
        <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-background-dark border-4 border-background-dark flex items-center justify-center">
          <div className="w-full h-full rounded-full bg-primary/20 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-xl font-black">lock</span>
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-black text-white mb-3 tracking-tight uppercase italic">{title}</h2>
      <p className="text-slate-500 text-sm font-medium mb-10 max-w-[260px] leading-relaxed">
        Inicia sesión para realizar pedidos desde tu mesa y acumular puntos con cada compra.
      </p>

      <button 
        onClick={() => navigate('/auth')}
        className="px-10 h-14 rounded-full bg-primary text-black font-black uppercase tracking-widest shadow-lg shadow-primary/20 active:scale-95 transition-all"
      >
        Iniciar Sesión
      </button>

      <p className="mt-8 text-[10px] font-black text-slate-700 uppercase tracking-[0.4em] italic">
        Explora el menú libremente. Regístrate para pedir.
      </p>
    </div>
  );
};

export default LoyaltyLockedView;
