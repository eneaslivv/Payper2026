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
      <header className="h-[72px] min-h-[72px] flex items-center justify-between px-8 bg-black z-50 border-b border-zinc-900">

        {/* LEFT: LOGO & ZONES */}
        <div className="flex items-center gap-8">
          {/* LOGO */}
          <div className="flex flex-col select-none">
            <h1 className="text-2xl font-black italic tracking-tighter text-white leading-none">COMANDO</h1>
            <span className="text-[10px] font-bold text-zinc-600 tracking-[0.3em] uppercase">Orchestrator V1.2.5</span>
          </div>

          {/* SEPARATOR */}
          <div className="h-8 w-px bg-zinc-800"></div>

          {/* ZONES PILL CONTAINER */}
          <div className="flex items-center bg-zinc-900/30 border border-zinc-800 rounded-full p-1 gap-1">
            {zones.map(zone => (
              <div key={zone.id} className="relative">
                {/* EDIT MODE INPUT */}
                {isEditingZone && activeZoneId === zone.id ? (
                  <div className="flex items-center px-2">
                    <input
                      autoFocus
                      className="bg-transparent text-xs font-bold text-white outline-none w-24 uppercase"
                      value={zoneInputName}
                      onChange={(e) => setZoneInputName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && onUpdateZone()}
                    />
                    <button onClick={onUpdateZone} className="text-[#36e27b] hover:text-white ml-2"><Check size={14} /></button>
                    <button onClick={() => setIsEditingZone(false)} className="text-red-500 hover:text-red-400 ml-1"><X size={14} /></button>
                  </div>
                ) : (
                  // TAB BUTTON
                  <button
                    onClick={() => setActiveZoneId(zone.id)}
                    className={`px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase transition-all flex items-center gap-2
                             ${activeZoneId === zone.id
                        ? 'bg-[#36e27b] text-black shadow-[0_0_15px_-5px_#36e27b]'
                        : 'text-zinc-500 hover:text-white'}`}
                  >
                    {zone.name}

                    {/* edit/delete icons on hover only if EDIT mode */}
                    {mode === AppMode.EDIT && activeZoneId === zone.id && (
                      <div className="flex items-center gap-1 ml-1 opacity-50 hover:opacity-100">
                        <Edit3 size={10} onClick={(e) => { e.stopPropagation(); setZoneInputName(zone.name); setIsEditingZone(true); }} className="cursor-pointer hover:text-black/70" />
                        <Trash2 size={10} onClick={(e) => { e.stopPropagation(); onDeleteZone(zone.id); }} className="cursor-pointer hover:text-red-600" />
                      </div>
                    )}
                  </button>
                )}
              </div>
            ))}

            {/* ADD BUTTON */}
            {mode === AppMode.EDIT && (
              isAddingZone ? (
                <div className="flex items-center px-2 border-l border-zinc-700 ml-1">
                  <input
                    autoFocus
                    className="bg-transparent text-xs font-bold text-white outline-none w-24 uppercase"
                    value={zoneInputName}
                    onChange={(e) => setZoneInputName(e.target.value)}
                    placeholder="NUEVA..."
                    onKeyDown={(e) => e.key === 'Enter' && onAddZone()}
                  />
                  <button onClick={onAddZone} className="text-[#36e27b] hover:text-white ml-1"><Check size={14} /></button>
                  <button onClick={() => setIsAddingZone(false)} className="text-red-500 ml-1"><X size={14} /></button>
                </div>
              ) : (
                <button
                  onClick={() => { setZoneInputName(''); setIsAddingZone(true); }}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-600 hover:text-[#36e27b] hover:bg-zinc-800 transition-all font-bold"
                >
                  <Plus size={14} />
                </button>
              )
            )}
          </div>
        </div>

        {/* RIGHT: CONTROLS */}
        <div className="flex items-center gap-4">

          {/* OPERAR / GESTION SWITCH */}
          <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-2xl p-1">
            <button
              onClick={() => setMode(AppMode.VIEW)}
              className={`px-5 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase flex items-center gap-2 transition-all
                     ${mode === AppMode.VIEW
                  ? 'bg-[#1a1a1a] text-[#36e27b] border border-zinc-800 shadow-lg'
                  : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <Zap size={12} className={mode === AppMode.VIEW ? "text-[#36e27b]" : ""} />
              <span>Operar</span>
            </button>
            <div className="w-px h-4 bg-zinc-800 mx-1"></div>
            <button
              onClick={() => setMode(AppMode.EDIT)}
              className={`px-5 py-2 rounded-xl text-[10px] font-black tracking-widest uppercase flex items-center gap-2 transition-all
                     ${mode === AppMode.EDIT
                  ? 'bg-[#1a1a1a] text-white border border-zinc-800 shadow-lg'
                  : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              <Settings size={12} />
              <span>Gestion</span>
            </button>
          </div>

          {/* SEARCH / UTILS */}
          <div className="flex items-center gap-2">
            <button className="w-10 h-10 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-[#36e27b] transition-colors">
              <Search size={16} />
            </button>
            {mode === AppMode.EDIT && (
              <button onClick={onAddNode} className="w-10 h-10 rounded-2xl bg-[#36e27b] text-black border border-[#36e27b] flex items-center justify-center hover:bg-[#2ecc71] transition-colors shadow-[0_0_15px_-5px_#36e27b]">
                <Plus size={20} strokeWidth={3} />
              </button>
            )}
          </div>

        </div>

      </header>

      {/* --- CONTENT AREA --- */}
      <main className="flex-1 flex flex-col w-full relative overflow-hidden bg-black rounded-tl-3xl border-t border-l border-zinc-900 shadow-[inset_10px_10px_20px_-10px_rgba(0,0,0,1)] z-0">
        {children}
      </main>

    </div>
  );
};

export default Layout;
