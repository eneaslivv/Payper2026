
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

interface BottomNavProps {
  activePath: string;
}

const BottomNav: React.FC<BottomNavProps> = ({ activePath }) => {
  const navigate = useNavigate();
  const { slug } = useParams();

  const navItems = [
    { label: 'Menú', icon: 'restaurant_menu', path: `/m/${slug}` },
    { label: 'Club', icon: 'stars', path: `/m/${slug}/loyalty` },
    { label: 'Perfil', icon: 'person', path: `/m/${slug}/profile` },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0a110b]/90 backdrop-blur-2xl border-t border-white/5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 px-8 max-w-md mx-auto shadow-[0_-20px_40px_rgba(0,0,0,0.4)]">
      <div className="flex justify-between items-center h-16">
        {navItems.map((item) => {
          const isActive = activePath === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`relative flex flex-col items-center justify-center gap-1 group transition-all duration-300 ${isActive ? 'text-primary scale-110' : 'text-slate-500 hover:text-slate-300'
                }`}
            >
              <div className={`absolute inset-0 -mx-4 -my-1 rounded-2xl transition-all duration-500 ${isActive ? 'bg-primary/5 opacity-100' : 'bg-transparent opacity-0'
                }`}></div>

              <span className={`material-symbols-outlined transition-all duration-300 ${isActive ? 'fill-icon' : 'scale-90'}`}>
                {item.icon}
              </span>

              <span className={`text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-60'
                }`}>
                {item.label}
              </span>

              {isActive && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-primary rounded-full shadow-[0_0_12px_#36e27b] animate-in fade-in slide-in-from-top-1"></div>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
