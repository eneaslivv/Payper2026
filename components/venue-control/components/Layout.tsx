import React from 'react';
import {
  Zap,
  Settings,
  Plus,
  Edit3,
  Trash2,
  Check,
  X,
  Search,
  ClipboardList,
  Bell,
} from 'lucide-react';
import { AppMode, Zone } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  onAddNode: () => void;
  zones: Zone[];
  activeZoneId: string;
  setActiveZoneId: (id: string) => void;
  isAddingZone: boolean;
  setIsAddingZone: (val: boolean) => void;
  isEditingZone: boolean;
  setIsEditingZone: (val: boolean) => void;
  zoneInputName: string;
  setZoneInputName: (val: string) => void;
  onAddZone: () => void;
  onUpdateZone: () => void;
  onDeleteZone: (id: string) => void;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  mode,
  setMode,
  onAddNode,
  zones,
  activeZoneId,
  setActiveZoneId,
  isAddingZone,
  setIsAddingZone,
  isEditingZone,
  setIsEditingZone,
  zoneInputName,
  setZoneInputName,
  onAddZone,
  onUpdateZone,
  onDeleteZone
}) => {

  return (
    <div className="flex flex-col h-full w-full bg-black text-white font-sans overflow-hidden selection:bg-[#36e27b] selection:text-black">

      {/* --- COMANDO HEADER --- */}
      <header className="h-[80px] min-h-[80px] flex items-center justify-between px-10 bg-black z-50">

        {/* LEFT: LOGO & ZONES */}
        <div className="flex items-center gap-10">
          {/* LOGO */}
          <div className="flex flex-col select-none group cursor-pointer">
            <h1 className="text-3xl font-black italic tracking-tighter text-white leading-none group-hover:text-[#36e27b] transition-colors">COMMAND</h1>
            <span className="text-[9px] font-bold text-zinc-600 tracking-[0.4em] uppercase group-hover:text-zinc-500 transition-colors">Orchestrator V1.5</span>
          </div>

          {/* ZONES PILL CONTAINER */}
          <div className="flex items-center bg-[#0a0a0a] border border-white/5 rounded-full p-1 gap-1 h-[42px] select-none">
            {zones.map(zone => (
              <div key={zone.id} className="relative h-full flex items-center">
                {/* EDIT MODE INPUT */}
                {isEditingZone && activeZoneId === zone.id ? (
                  <div className="flex items-center px-3 bg-zinc-900 rounded-full h-8">
                    <input
                      autoFocus
                      className="bg-transparent text-[10px] font-black text-white outline-none w-24 uppercase tracking-widest"
                      value={zoneInputName}
                      onChange={(e) => setZoneInputName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onUpdateZone()}
                    />
                    <button onClick={onUpdateZone} className="text-[#36e27b] hover:text-white ml-2"><Check size={12} /></button>
                  </div>
                ) : (
                  // TAB BUTTON
                  <button
                    onClick={() => setActiveZoneId(zone.id)}
                    className={`h-[34px] px-6 rounded-full text-[10px] font-black tracking-[0.2em] uppercase transition-all flex items-center justify-center whitespace-nowrap
                             ${activeZoneId === zone.id
                        ? 'bg-[#36e27b] text-black shadow-[0_0_15px_-3px_rgba(54,226,123,0.5)]'
                        : 'text-zinc-500 hover:text-white/80'}`}
                  >
                    {zone.name}
                  </button>
                )}
              </div>
            ))}

            {/* ADD BUTTON */}
            {mode === AppMode.EDIT && (
              <button
                onClick={() => { setZoneInputName(''); setIsAddingZone(true); }}
                className="w-[34px] h-[34px] rounded-full flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-zinc-500 hover:text-white border border-white/5 transition-all ml-1 shadow-lg"
              >
                <Plus size={14} strokeWidth={3} />
              </button>
            )}
          </div>
        </div>

        {/* RIGHT: CONTROLS */}
        <div className="flex items-center gap-6">

          {/* MODE SWITCHER (PILL) */}
          <div className="flex items-center bg-[#111] border border-zinc-900 rounded-full p-1.5 h-[46px]">
            {/* OPERATIVO */}
            <button
              onClick={() => setMode(AppMode.VIEW)}
              className={`h-[34px] px-6 rounded-full text-[10px] font-black tracking-widest uppercase flex items-center gap-2 transition-all
                     ${mode === AppMode.VIEW
                  ? 'bg-zinc-800 text-[#36e27b] border border-zinc-700 shadow-lg'
                  : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <Zap size={12} className={mode === AppMode.VIEW ? "text-[#36e27b]" : "opacity-0 w-0"} />
              <span>Operativo</span>
            </button>

            <div className="w-px h-3 bg-zinc-800 mx-1"></div>

            {/* DESPACHO */}
            <button
              onClick={() => setMode(AppMode.DISPATCH)}
              className={`h-[34px] px-6 rounded-full text-[10px] font-black tracking-widest uppercase flex items-center gap-2 transition-all
                     ${mode === AppMode.DISPATCH
                  ? 'bg-zinc-800 text-amber-400 border border-zinc-700 shadow-lg'
                  : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <ClipboardList size={12} className={mode === AppMode.DISPATCH ? "text-amber-400" : "opacity-0 w-0"} />
              <span>Despacho</span>
            </button>

            <div className="w-px h-3 bg-zinc-800 mx-1"></div>

            {/* GESTIÓN */}
            <button
              onClick={() => setMode(AppMode.EDIT)}
              className={`h-[34px] px-6 rounded-full text-[10px] font-black tracking-widest uppercase flex items-center gap-2 transition-all
                     ${mode === AppMode.EDIT
                  ? 'bg-zinc-800 text-white border border-zinc-700 shadow-lg'
                  : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <Settings size={12} className={mode === AppMode.EDIT ? "text-white" : "opacity-0 w-0"} />
              <span>Gestión</span>
            </button>
          </div>

          {/* UTILS */}
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-[#111] border border-zinc-900 rounded-full h-[46px] px-2">
              <button className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-white transition-colors">
                <Search size={16} />
              </button>
              <div className="w-px h-3 bg-zinc-800"></div>
              <button className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-500 hover:text-white transition-colors">
                <Bell size={16} />
              </button>
            </div>

            {mode === AppMode.EDIT && (
              <button
                onClick={onAddNode}
                className="h-[46px] px-6 rounded-full bg-[#36e27b] text-black font-black text-[10px] tracking-widest uppercase hover:bg-[#2ecc71] transition-all shadow-[0_0_20px_-5px_#36e27b] flex items-center gap-2"
              >
                <Plus size={14} strokeWidth={4} />
                <span>Nuevo</span>
              </button>
            )}
          </div>

        </div>

      </header>

      {/* --- CONTENT AREA (ROUNDED CARD) --- */}
      <main className="flex-1 flex flex-col w-full relative overflow-hidden bg-[#050505] rounded-[40px] border border-zinc-900/50 shadow-[0_-10px_40px_-15px_rgba(0,0,0,1)] mx-6 mb-6 z-0">
        {/* INNER BORDER GLOW OPTIONAL */}
        <div className="absolute inset-0 rounded-[40px] border border-white/5 pointer-events-none z-50"></div>
        {children}
      </main>

    </div>
  );
};

export default Layout;
