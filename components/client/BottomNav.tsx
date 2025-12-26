
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';

interface BottomNavProps {
  activePath: string;
  accentColor: string;
}

const BottomNav: React.FC<BottomNavProps> = ({ activePath, accentColor }) => {
  const navigate = useNavigate();
  const { slug } = useParams();

  const navItems = [
    { label: 'Menú', icon: 'restaurant_menu', path: `/m/${slug}` },
    { label: 'Club', icon: 'stars', path: `/m/${slug}/loyalty` },
    { label: 'Perfil', icon: 'person', path: `/m/${slug}/profile` },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-2xl border-t border-white/5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 px-8 max-w-md mx-auto shadow-[0_-20px_40px_rgba(0,0,0,0.4)]">
      <div className="flex justify-between items-center h-16">
        {navItems.map((item) => {
          const isActive = activePath === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center justify-center gap-1 group transition-all duration-300"
              style={{ color: isActive ? accentColor : '#64748b', transform: isActive ? 'scale(1.1)' : 'scale(1)' }}
            >
              <div
                className="absolute inset-0 -mx-4 -my-1 rounded-2xl transition-all duration-500"
                style={{ backgroundColor: isActive ? `${accentColor}10` : 'transparent', opacity: isActive ? 1 : 0 }}
              />

              <span className={`material-symbols-outlined transition-all duration-300 ${isActive ? 'fill-icon' : 'scale-90'}`}>
                {item.icon}
              </span>

              <span className={`text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                {item.label}
              </span>

              {isActive && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full animate-in fade-in slide-in-from-top-1"
                  style={{ backgroundColor: accentColor, boxShadow: `0 0 12px ${accentColor}` }}
                />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
