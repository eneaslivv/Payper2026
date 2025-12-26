
import React from 'react';
import { useOffline } from '../contexts/OfflineContext';

const OfflineIndicator: React.FC = () => {
  const { isOnline, isSyncing, pendingSyncCount, triggerSync } = useOffline();

  if (isOnline && pendingSyncCount === 0 && !isSyncing) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9000] flex flex-col items-center gap-2 animate-in slide-in-from-bottom-4">
      <div 
        className={`
          flex items-center gap-3 px-5 py-2.5 rounded-full shadow-2xl border backdrop-blur-md transition-all
          ${!isOnline 
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' 
            : isSyncing 
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-500'
              : 'bg-neon/10 border-neon/30 text-neon'
          }
        `}
      >
        {!isOnline ? (
          <>
            <span className="material-symbols-outlined text-lg animate-pulse">wifi_off</span>
            <div className="flex flex-col">
               <span className="text-[10px] font-black uppercase tracking-widest">MODO OFFLINE</span>
               <span className="text-[8px] font-bold opacity-80">{pendingSyncCount} cambios pendientes</span>
            </div>
          </>
        ) : isSyncing ? (
          <>
            <div className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            <span className="text-[10px] font-black uppercase tracking-widest">SINCRONIZANDO NUBE...</span>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-lg">cloud_upload</span>
            <button onClick={triggerSync} className="text-[10px] font-black uppercase tracking-widest hover:underline">
               SINCRONIZAR {pendingSyncCount} PENDIENTES
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default OfflineIndicator;
