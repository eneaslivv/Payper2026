
import React from 'react';
import { QR, Bar, AppMode } from '../types';
import { X, QrCode, TrendingUp, Settings2, Power, History, Menu as MenuIcon, Download, FileText, Image as ImageIcon, Box, ChevronDown } from 'lucide-react';

interface QRDetailProps {
  qr: QR;
  bars: Bar[];
  mode: AppMode;
  onClose: () => void;
  onToggleStatus: (id: string) => void;
  onUpdateProperty: (prop: string, val: any) => void;
  onReassign?: (qrId: string, barId: string) => void;
}

const MOCK_MENUS = [
  { id: 'm1', name: 'MENÚ NOCTURNO' },
  { id: 'm2', name: 'HAPPY HOUR' },
  { id: 'm3', name: 'VIP SELECTION' },
  { id: 'm4', name: 'ONLY DRINKS' }
];

const QRDetail: React.FC<QRDetailProps> = ({ qr, bars, mode, onClose, onToggleStatus, onUpdateProperty, onReassign }) => {
  const activeBar = bars.find(b => b.id === qr.barId);
  const barName = activeBar?.name || "SIN ASIGNAR";
  const activeMenu = MOCK_MENUS.find(m => m.id === qr.menuId)?.name || "MENÚ ESTÁNDAR";
  const isEditMode = mode === AppMode.EDIT;

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <div 
      onPointerDown={handlePointerDown}
      className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-[#050505] border-l border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,1)] z-[210] flex flex-col animate-in slide-in-from-right duration-500"
    >
      <div className="p-8 border-b border-zinc-900 bg-[#080808] flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${qr.isActive ? 'bg-zinc-900 text-[#36e27b] border-[#36e27b]/20 shadow-[0_0_15px_rgba(54,226,123,0.1)]' : 'bg-zinc-950 text-zinc-700 border-zinc-900'}`}>
            <QrCode size={24} />
          </div>
          <div className="flex-1">
            {isEditMode ? (
              <div className="flex flex-col gap-1">
                <input 
                  type="text"
                  value={qr.name}
                  onChange={(e) => onUpdateProperty('name', e.target.value)}
                  className="bg-black border border-zinc-800 rounded-lg px-2 py-1 text-2xl font-black text-[#36e27b] uppercase outline-none focus:border-[#36e27b] w-full"
                />
                <select 
                  value={qr.type}
                  onChange={(e) => onUpdateProperty('type', e.target.value)}
                  className="bg-black border border-zinc-800 rounded-lg px-2 py-1 text-[8px] font-black text-zinc-400 uppercase outline-none"
                >
                  <option value="BAR">Barra</option>
                  <option value="TABLE">Mesa</option>
                  <option value="ZONE">Zona</option>
                  <option value="EVENT">Evento</option>
                </select>
              </div>
            ) : (
              <>
                <h3 className="text-2xl font-black tracking-tighter text-white italic uppercase">{qr.name}</h3>
                <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">PUNTO DE ENTRADA {qr.type}</span>
              </>
            )}
          </div>
        </div>
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-white bg-zinc-900/30 rounded-2xl transition-all border border-zinc-800">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
        <div className="space-y-6">
          <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600 italic border-b border-zinc-900 pb-5">ASIGNACIÓN DIRECTA</h4>
          <div className="space-y-3">
            {/* CARTA ACTIVA */}
            <div className="relative bg-[#080808] border border-zinc-900 p-5 rounded-[22px] flex items-center justify-between group hover:border-zinc-800 transition-all overflow-hidden">
              <div className="flex items-center gap-5">
                <MenuIcon size={18} className="text-zinc-600" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">CARTA ACTIVA</span>
              </div>
              {isEditMode ? (
                <div className="flex items-center gap-2">
                  <select 
                    value={qr.menuId || ''}
                    onChange={(e) => onUpdateProperty('menuId', e.target.value)}
                    className="appearance-none bg-transparent text-xs font-black text-white uppercase tracking-tighter text-right outline-none cursor-pointer pr-5"
                  >
                    <option value="" disabled>SELECCIONAR...</option>
                    {MOCK_MENUS.map(m => (
                      <option key={m.id} value={m.id} className="bg-[#080808] text-white">{m.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="text-zinc-600 absolute right-5 pointer-events-none" />
                </div>
              ) : (
                <span className="text-xs font-black text-white uppercase tracking-tight">{activeMenu}</span>
              )}
            </div>

            {/* BARRA DESTINO */}
            <div className="relative bg-[#080808] border border-zinc-900 p-5 rounded-[22px] flex items-center justify-between group hover:border-zinc-800 transition-all overflow-hidden">
              <div className="flex items-center gap-5">
                <Settings2 size={18} className="text-zinc-600" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500">BARRA DESTINO</span>
              </div>
              {isEditMode ? (
                <div className="flex items-center gap-2">
                  <select 
                    value={qr.barId || ''}
                    onChange={(e) => onUpdateProperty('barId', e.target.value)}
                    className="appearance-none bg-transparent text-xs font-black text-[#36e27b] uppercase tracking-tighter text-right outline-none cursor-pointer pr-5"
                  >
                    <option value="" disabled>SELECCIONAR...</option>
                    {bars.map(b => (
                      <option key={b.id} value={b.id} className="bg-[#080808] text-[#36e27b]">{b.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="text-[#36e27b]/60 absolute right-5 pointer-events-none" />
                </div>
              ) : (
                <span className="text-xs font-black text-[#36e27b] uppercase tracking-tight">{barName}</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 italic">Exportar / Imprimir</h4>
          <div className="grid grid-cols-3 gap-2">
            <DownloadButton icon={<ImageIcon size={14}/>} label="PNG" />
            <DownloadButton icon={<Box size={14}/>} label="SVG" />
            <DownloadButton icon={<FileText size={14}/>} label="PDF" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#080808] border border-zinc-900 p-6 rounded-[32px] group">
            <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest mb-3">Escaneos Totales</p>
            <div className="flex items-end gap-3">
              <span className="text-3xl font-black text-white italic tabular-nums">{qr.scanCount}</span>
              <TrendingUp size={16} className="text-[#36e27b] mb-2" />
            </div>
          </div>
          <div className="bg-[#080808] border border-zinc-900 p-6 rounded-[32px] group">
            <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest mb-3">Ingresos Gen.</p>
            <div className="flex items-end gap-3">
              <span className="text-3xl font-black text-[#36e27b] italic tabular-nums">${(qr.totalGeneratedRevenue / 1000).toFixed(1)}k</span>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
             <div className="flex items-center gap-3">
                <History size={14} className="text-zinc-600" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-white italic">Últimos Usos</h4>
             </div>
          </div>
          <div className="space-y-2">
            {[
              { user: 'Invitado_74', time: '1m', spent: '$4.200' },
              { user: 'Julian A.', time: '12m', spent: '$12.500' }
            ].map((u, i) => (
              <div key={i} className="bg-[#080808] border border-zinc-900 p-4 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 font-black text-[9px] uppercase">{u.user[0]}</div>
                  <div>
                    <p className="text-[10px] font-black text-white uppercase">{u.user}</p>
                    <p className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest">hace {u.time}</p>
                  </div>
                </div>
                <span className="text-xs font-black text-[#36e27b] italic tabular-nums">{u.spent}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-8 bg-black border-t border-zinc-900 flex flex-col gap-3">
        <button 
          onClick={() => onToggleStatus(qr.id)}
          className={`w-full py-4 flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all border shadow-xl active:scale-95 ${qr.isActive ? 'bg-zinc-900 text-rose-500 border-rose-900/20' : 'bg-[#36e27b] text-black border-[#36e27b]'}`}
        >
          <Power size={16} /> {qr.isActive ? 'Desactivar Punto QR' : 'Activar Punto QR'}
        </button>
      </div>
    </div>
  );
};

const DownloadButton: React.FC<{ icon: React.ReactNode, label: string }> = ({ icon, label }) => (
  <button className="flex flex-col items-center justify-center gap-2 p-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-zinc-500 hover:text-white hover:border-[#36e27b]/40 transition-all group">
    <div className="group-hover:text-[#36e27b] transition-colors">{icon}</div>
    <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

export default QRDetail;
