
import React, { useState } from 'react';

export type DatePreset = 'hoy' | 'ayer' | '7d' | '30d' | 'custom';

interface DateRangeSelectorProps {
  onRangeChange: (start: Date, end: Date) => void;
  className?: string;
}

const DateRangeSelector: React.FC<DateRangeSelectorProps> = ({ onRangeChange, className }) => {
  const [activePreset, setActivePreset] = useState<DatePreset>('hoy');
  const [showCustom, setShowCustom] = useState(false);
  
  const setRange = (preset: DatePreset) => {
    setActivePreset(preset);
    const now = new Date();
    let start = new Date();
    let end = new Date();

    switch (preset) {
      case 'hoy':
        start.setHours(0,0,0,0);
        break;
      case 'ayer':
        start.setDate(now.getDate() - 1);
        start.setHours(0,0,0,0);
        end.setDate(now.getDate() - 1);
        end.setHours(23,59,59,999);
        break;
      case '7d':
        start.setDate(now.getDate() - 7);
        break;
      case '30d':
        start.setDate(now.getDate() - 30);
        break;
      default:
        setShowCustom(true);
        return;
    }
    setShowCustom(false);
    onRangeChange(start, end);
  };

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex bg-white dark:bg-surface-dark p-1 rounded-xl border border-black/[0.04] dark:border-white/[0.04] shadow-soft w-fit overflow-x-auto no-scrollbar">
        {(['hoy', 'ayer', '7d', '30d', 'custom'] as DatePreset[]).map((p) => (
          <button
            key={p}
            onClick={() => setRange(p)}
            className={`px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
              activePreset === p 
                ? 'bg-primary dark:bg-neon/10 text-white dark:text-neon border border-primary dark:border-neon/20' 
                : 'text-text-secondary hover:text-neon'
            }`}
          >
            {p === '7d' ? '7 Días' : p === '30d' ? '30 Días' : p}
          </button>
        ))}
      </div>
      
      <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-text-secondary/60 ml-1">
        <span className="flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">calendar_today</span>
          Mostrando: <span className="text-text-main dark:text-white/80 italic">Período Seleccionado</span>
        </span>
        <span className="px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[8px] font-black">TZ: {tz}</span>
      </div>

      {showCustom && (
        <div className="flex gap-3 animate-in slide-in-from-top-2 duration-300">
           <input type="date" className="bg-white dark:bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-bold uppercase text-white" />
           <input type="date" className="bg-white dark:bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-[10px] font-bold uppercase text-white" />
        </div>
      )}
    </div>
  );
};

export default DateRangeSelector;
