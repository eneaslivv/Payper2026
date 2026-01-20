
import React from 'react';
import { Cloud, CloudOff, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { useOffline } from '../contexts/OfflineContext';

interface OfflineIndicatorProps {
  /** If true, shows compact version for header */
  compact?: boolean;
}

const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ compact = false }) => {
  const { isOnline, isSyncing, pendingSyncCount, triggerSync } = useOffline();

  const hasProblems = pendingSyncCount > 0;

  // Compact version for header integration
  if (compact) {
    if (!isOnline) {
      return (
        <button
          onClick={triggerSync}
          className="flex items-center gap-1.5 px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 hover:bg-amber-500/20 transition-all"
          title="Sin conexión - Los cambios se guardarán localmente"
        >
          <CloudOff size={12} className="animate-pulse" />
          <span className="text-[8px] font-bold uppercase">Offline</span>
          {pendingSyncCount > 0 && (
            <span className="px-1 bg-amber-500/30 rounded text-[7px] font-black">{pendingSyncCount}</span>
          )}
        </button>
      );
    }

    if (isSyncing) {
      return (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400">
          <RefreshCw size={12} className="animate-spin" />
          <span className="text-[8px] font-bold uppercase">Sync</span>
        </div>
      );
    }

    if (hasProblems) {
      return (
        <button
          onClick={triggerSync}
          className="flex items-center gap-1.5 px-2 py-1 bg-orange-500/10 border border-orange-500/30 rounded-lg text-orange-400 hover:bg-orange-500/20 transition-all"
          title="Hay cambios pendientes de sincronizar"
        >
          <AlertTriangle size={12} />
          <span className="px-1 bg-orange-500/30 rounded text-[7px] font-black">{pendingSyncCount}</span>
        </button>
      );
    }

    // All synced - show subtle indicator
    return (
      <div className="flex items-center gap-1 px-2 py-1 text-emerald-500/50" title="Sincronizado">
        <Cloud size={12} />
        <Check size={10} strokeWidth={3} />
      </div>
    );
  }

  // Full version (fixed position) - only show when offline or has problems
  if (isOnline && !hasProblems) {
    return null; // Don't show when everything is fine
  }

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9000] flex flex-col items-center gap-2 animate-in slide-in-from-bottom-4">
      <div
        className={`
          flex items-center gap-3 px-5 py-2.5 rounded-full shadow-2xl border backdrop-blur-md transition-all
          ${!isOnline
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
            : isSyncing
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-500'
              : 'bg-orange-500/10 border-orange-500/30 text-orange-500'
          }
        `}
      >
        {!isOnline ? (
          <>
            <CloudOff size={18} className="animate-pulse" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest">MODO OFFLINE</span>
              <span className="text-[8px] font-bold opacity-80">{pendingSyncCount} cambios pendientes</span>
            </div>
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw size={18} className="animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest">SINCRONIZANDO...</span>
          </>
        ) : hasProblems ? (
          <>
            <AlertTriangle size={18} />
            <button onClick={triggerSync} className="text-[10px] font-black uppercase tracking-widest hover:underline">
              SINCRONIZAR {pendingSyncCount} PENDIENTES
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default OfflineIndicator;
