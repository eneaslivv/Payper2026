import React from 'react';

interface TabProps {
  active: boolean;
  onClick: () => void;
  children?: React.ReactNode;
  icon?: string;
  variant?: 'default' | 'pill' | 'segment' | 'nav';
  fullWidth?: boolean;
  badge?: number | string;
  className?: string;
}

interface TabGroupProps {
  children: React.ReactNode;
  className?: string;
}

const styles = {
  default: {
    base: 'px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-2',
    active: 'bg-neon text-black shadow-lg shadow-neon/10',
    inactive: 'text-text-secondary dark:text-white/40 hover:text-neon hover:bg-gray-100 dark:hover:bg-white/5',
  },
  pill: {
    base: 'px-3 py-1.5 rounded-full text-[8px] font-bold uppercase tracking-widest transition-all whitespace-nowrap flex items-center gap-1.5',
    active: 'bg-neon text-black',
    inactive: 'bg-black/[0.02] dark:bg-white/[0.02] text-text-secondary/60 dark:text-white/30 border border-border-color/30 dark:border-white/5 hover:bg-gray-100 dark:hover:bg-white/[0.06]',
  },
  segment: {
    base: 'rounded-full transition-all flex items-center justify-center',
    active: 'bg-neon text-black',
    inactive: 'text-text-secondary/60 dark:text-white/30 hover:text-text-main dark:hover:text-white',
  },
  nav: {
    base: 'flex items-center gap-3 px-6 py-3.5 rounded-full text-[10px] font-black tracking-widest transition-all whitespace-nowrap',
    active: 'bg-neon/10 text-neon border border-neon/20 shadow-neon-soft',
    inactive: 'text-text-secondary dark:text-white/30 hover:text-text-main dark:hover:text-white/60',
  },
};

export const Tab: React.FC<TabProps> = ({
  active, onClick, children, icon, variant = 'default', fullWidth = false, badge, className = ''
}) => {
  const s = styles[variant];

  const sizeClass = variant === 'segment' && !children
    ? 'size-8'
    : variant === 'segment'
      ? 'px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest gap-1.5'
      : '';

  return (
    <button
      onClick={onClick}
      className={`${s.base} ${sizeClass} ${active ? s.active : s.inactive} ${fullWidth ? 'flex-1' : ''} ${className}`}
    >
      {icon && <span className="material-symbols-outlined text-sm">{icon}</span>}
      {children}
      {badge !== undefined && badge !== 0 && (
        <span className={`px-1.5 py-0.5 rounded-full text-[7px] font-black min-w-[16px] text-center ${active ? 'bg-black/20 text-black' : 'bg-neon/20 text-neon'}`}>
          {badge}
        </span>
      )}
    </button>
  );
};

export const TabGroup: React.FC<TabGroupProps> = ({ children, className = '' }) => (
  <div className={`flex items-center gap-1 bg-white dark:bg-surface-dark p-1 rounded-full border border-border-color/30 dark:border-white/[0.04] shadow-soft ${className}`}>
    {children}
  </div>
);
