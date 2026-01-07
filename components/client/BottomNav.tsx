
import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useClient } from '../../contexts/ClientContext';

interface BottomNavProps {
  activePath: string;
  accentColor: string;
}

const BottomNav: React.FC<BottomNavProps> = ({ activePath, accentColor }) => {
  const navigate = useNavigate();
  const { slug } = useParams();
  const { setShowAuthModal, user, isFeatureEnabled, store } = useClient();
  const theme = store?.menu_theme || {};
  const bgColor = theme.backgroundColor || '#ffffff';
  const textColor = theme.textColor || '#FFFFFF';

  const navItems = [
    { label: 'Menú', icon: 'restaurant_menu', path: `/m/${slug}` },
    ...(isFeatureEnabled('loyalty') ? [{ label: 'Club', icon: 'stars', path: `/m/${slug}/loyalty` }] : []),
    { label: 'Perfil', icon: 'person', path: `/m/${slug}/profile` },
  ];

  return (
    <>
      {/* Safe area background fill - extends to the very bottom of the screen */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40 max-w-md mx-auto"
        style={{
          height: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
          backgroundColor: bgColor
        }}
      />
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md border-t pb-[env(safe-area-inset-bottom)] pt-2 px-8 max-w-md mx-auto transition-colors duration-500"
        style={{
          backgroundColor: `${bgColor}F2`, // 95% opacity
          borderColor: `${textColor}10`
        }}
      >
        <div className="flex justify-between items-center h-16">
          {navItems.map((item) => {
            const isActive = activePath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => {
                  if (item.label !== 'Menú' && !user) {
                    setShowAuthModal(true);
                  } else {
                    navigate(item.path);
                  }
                }}
                className="relative flex flex-col items-center justify-center gap-1 group transition-all duration-300"
                style={{ color: isActive ? accentColor : `${textColor}66`, transform: isActive ? 'scale(1.1)' : 'scale(1)' }}
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
    </>
  );
};

export default BottomNav;
