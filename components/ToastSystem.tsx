
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

// --- SOUND ASSETS (Base64 for PWA Offline Compatibility) ---
const SOUNDS = {
  // Short, crisp "Ping" for new orders
  ping: 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTSVMAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//uQZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAZAAABxwADBQoNFBcYGx0gIyUoKy0wMjU4Ojw+QUVGSUxOUFJWWVtdYWNmaWtvcHJ2eX1/goaJjI+Rk5aZnZ6ho6Wnqyytr7Kztri7vsHDxsnLzdDT1tfZ3N/h5Obp7O3w8vT2+fr9//8AAAAATGF2YzU4LjU0LjEwMAAAAAAAAAAAAAAAACQAAAAAAAAAAAHH0o87jQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAAP8AAANAAAAAAAIAAAAAAAAEUlteLAAABAAAA0AAAAABAAAAAAQAAgAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//uQZAA/wAABAAAAAAABAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 
  // Softer "Pop" for status updates
  pop: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' 
};

// --- TYPES ---
export type NotificationType = 'success' | 'error' | 'info' | 'action' | 'order' | 'status';

export interface Toast {
  id: string;
  title: string;
  message?: string;
  type: NotificationType;
  timestamp: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  timestamp: number;
  read: boolean;
  link?: string;
}

interface ToastContextType {
  addToast: (title: string, type?: NotificationType, message?: string, link?: string) => void;
  notifications: NotificationItem[];
  unreadCount: number;
  markAllAsRead: () => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
  toggleSound: () => void;
  soundEnabled: boolean;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Play sound helper
  const playSound = (type: NotificationType) => {
    if (!soundEnabled) return;
    
    // Create audio context on user interaction if needed, but for simple sounds HTML5 Audio is fine
    // We use a simple strategy: Create a new Audio object for overlapping sounds
    try {
        const src = type === 'order' || type === 'success' ? SOUNDS.ping : SOUNDS.pop;
        // In a real app with valid Base64, this would play. 
        // Using a mock beep logic for the prototype if src is empty
        const audio = new Audio(src);
        audio.volume = 0.5;
        const playPromise = audio.play();
        
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                // Auto-play was prevented
                console.log("Audio play prevented:", error);
            });
        }
    } catch (e) {
        console.error("Sound error", e);
    }
  };

  const addToast = useCallback((title: string, type: NotificationType = 'info', message: string = '', link?: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    const timestamp = Date.now();

    // 1. Add to active Toasts (Visual Popups)
    setToasts((prev) => [...prev, { id, title, message, type, timestamp }]);

    // 2. Add to Notification History (Persisted List)
    // Only 'order', 'status', 'action' and 'error' go to history. 'info' might be too spammy.
    if (['order', 'status', 'action', 'error', 'success'].includes(type)) {
        setNotifications((prev) => [{
            id, 
            title, 
            message, 
            type, 
            timestamp, 
            read: false,
            link 
        }, ...prev].slice(0, 50)); // Keep last 50
    }

    // 3. Play Sound
    playSound(type);

    // 4. Auto Dismiss Toast
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, type === 'order' ? 6000 : 4000); // Longer for orders
  }, [soundEnabled]);

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  const toggleSound = () => {
    setSoundEnabled(prev => !prev);
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <ToastContext.Provider value={{ 
        addToast, 
        notifications, 
        unreadCount, 
        markAllAsRead, 
        markAsRead, 
        clearAll,
        toggleSound,
        soundEnabled
    }}>
      {children}
      
      {/* TOAST CONTAINER - POS STYLE */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 items-end pointer-events-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 50, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, x: 20, transition: { duration: 0.2 } }}
              className={`
                pointer-events-auto cursor-pointer
                min-w-[320px] max-w-[400px] p-4 rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] 
                backdrop-blur-xl border border-white/10 flex items-start gap-4 relative overflow-hidden
                ${toast.type === 'order' ? 'bg-[#1a1c1a] border-neon/50' : 'bg-[#141714]'}
              `}
              onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
            >
              {/* Progress Bar for Order */}
              {toast.type === 'order' && (
                  <motion.div 
                    initial={{ width: "100%" }} 
                    animate={{ width: "0%" }} 
                    transition={{ duration: 6, ease: "linear" }}
                    className="absolute bottom-0 left-0 h-1 bg-neon shadow-[0_0_10px_#4ADE80]"
                  />
              )}

              <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg ${
                toast.type === 'success' || toast.type === 'order' ? 'bg-neon/10 text-neon' : 
                toast.type === 'error' ? 'bg-red-500/10 text-red-500' : 
                toast.type === 'status' ? 'bg-blue-500/10 text-blue-500' :
                'bg-white/5 text-white'
              }`}>
                <span className="material-symbols-outlined text-xl">
                  {toast.type === 'success' ? 'check_circle' : 
                   toast.type === 'order' ? 'receipt_long' :
                   toast.type === 'error' ? 'error' : 
                   toast.type === 'status' ? 'update' : 'info'}
                </span>
              </div>
              <div className="flex-1">
                <h4 className={`text-sm font-black uppercase tracking-tight leading-none mb-1 ${toast.type === 'order' ? 'text-neon' : 'text-white'}`}>
                    {toast.title}
                </h4>
                {toast.message && <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest leading-relaxed">{toast.message}</p>}
              </div>
              <button className="text-white/20 hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

// --- NOTIFICATION CENTER COMPONENT ---
export const NotificationPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { notifications, markAllAsRead, clearAll, markAsRead, toggleSound, soundEnabled } = useToast();
    const navigate = useNavigate();

    const handleItemClick = (n: NotificationItem) => {
        markAsRead(n.id);
        if (n.link) {
            navigate(n.link);
            onClose();
        }
    };

    return (
        <div className="absolute top-16 right-0 w-[380px] max-w-[90vw] bg-[#141714] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 z-[100] flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-[#1a1c1a]">
                <div className="flex items-center gap-2">
                    <h3 className="text-xs font-black uppercase text-white tracking-widest">Notificaciones</h3>
                    <span className="bg-white/10 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">{notifications.length}</span>
                </div>
                <div className="flex gap-2">
                    <button onClick={toggleSound} className={`size-7 flex items-center justify-center rounded-lg border transition-all ${soundEnabled ? 'bg-neon/10 text-neon border-neon/20' : 'bg-white/5 text-white/40 border-white/5'}`}>
                        <span className="material-symbols-outlined text-sm">{soundEnabled ? 'volume_up' : 'volume_off'}</span>
                    </button>
                    <button onClick={markAllAsRead} className="size-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-white/60 transition-all" title="Marcar leídas">
                        <span className="material-symbols-outlined text-sm">done_all</span>
                    </button>
                    <button onClick={clearAll} className="size-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-red-500/10 hover:text-red-500 text-white/60 transition-all" title="Borrar todo">
                        <span className="material-symbols-outlined text-sm">delete</span>
                    </button>
                </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {notifications.length === 0 ? (
                    <div className="py-12 text-center opacity-30">
                        <span className="material-symbols-outlined text-3xl mb-2">notifications_off</span>
                        <p className="text-[9px] font-black uppercase tracking-widest">Sin Novedades</p>
                    </div>
                ) : (
                    notifications.map(n => (
                        <div 
                            key={n.id} 
                            onClick={() => handleItemClick(n)}
                            className={`p-3 rounded-xl flex gap-3 cursor-pointer transition-all border ${n.read ? 'bg-transparent border-transparent opacity-60 hover:opacity-100 hover:bg-white/5' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'}`}
                        >
                            <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
                                n.type === 'order' ? 'bg-neon/10 text-neon' :
                                n.type === 'error' ? 'bg-red-500/10 text-red-500' :
                                'bg-white/5 text-white'
                            }`}>
                                <span className="material-symbols-outlined text-base">
                                    {n.type === 'order' ? 'receipt' : n.type === 'status' ? 'sync_alt' : 'info'}
                                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <h4 className={`text-[10px] font-black uppercase truncate ${n.type === 'order' ? 'text-neon' : 'text-white'}`}>{n.title}</h4>
                                    <span className="text-[8px] font-bold text-white/30 whitespace-nowrap ml-2">
                                        {new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </span>
                                </div>
                                <p className="text-[9px] font-medium text-white/60 leading-tight mt-0.5 line-clamp-2">{n.message}</p>
                            </div>
                            {!n.read && <div className="size-1.5 rounded-full bg-neon mt-1.5 shrink-0 shadow-neon-soft"></div>}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};
