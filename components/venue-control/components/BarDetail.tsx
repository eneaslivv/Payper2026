
import React, { useState } from 'react';
import { Bar, QR, OrderStatus, StockItem, AppMode } from '../types';
import { X, Beer, Package, AlertCircle, ArrowRightLeft, Plus, QrCode, TrendingUp, History, Download, Power, BarChart2, Link2, Unlink2 } from 'lucide-react';

interface BarDetailProps {
  bar: Bar;
  allQrs: QR[];
  mode: AppMode;
  onClose: () => void;
  onUpdateProperty: (prop: string, val: any) => void;
  onToggleQrAssignment: (qrId: string) => void;
  onUpdateStock: (barId: string, stockId: string, amount: number) => void;
  onTransferOpen: (barId: string) => void;
  onToggleQr: (qrId: string) => void;
  onClosureOpen: (barId: string) => void;
}

const BarDetail: React.FC<BarDetailProps> = ({ 
  bar, allQrs, mode, onClose, onUpdateProperty, onToggleQrAssignment, onTransferOpen, onToggleQr, onClosureOpen 
}) => {
  const [activeTab, setActiveTab] = useState<'kpi' | 'stock' | 'qrs' | 'history'>('kpi');
  const isEditMode = mode === AppMode.EDIT;
  
  const zoneQrs = allQrs.filter(q => q.zoneId === bar.zoneId);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <div 
      onPointerDown={handlePointerDown}
      className="fixed inset-y-0 right-0 w-full md:w-[480px] bg-[#050505] border-l border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,1)] z-[210] flex flex-col animate-in slide-in-from-right duration-500"
    >
      <div className="p-8 border-b border-zinc-900 bg-[#080808] flex items-center justify-between">
        <div className="flex items-center gap-4 flex-1">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 flex items-center justify-center text-[#36e27b] shadow-[0_0_20px_rgba(54,226,123,0.1)]">
            <Beer size={24} />
          </div>
          <div className="flex-1">
            {isEditMode ? (
              <div className="flex flex-col gap-1">
                <input 
                  type="text"
                  value={bar.name}
                  onChange={(e) => onUpdateProperty('name', e.target.value)}
                  className="bg-black border border-zinc-800 rounded-lg px-2 py-1 text-2xl font-black text-[#36e27b] uppercase outline-none focus:border-[#36e27b] w-full"
                />
                <select 
                  value={bar.type}
                  onChange={(e) => onUpdateProperty('type', e.target.value)}
                  className="bg-black border border-zinc-800 rounded-lg px-2 py-1 text-[8px] font-black text-zinc-400 uppercase outline-none"
                >
                  <option value="MAIN">Principal</option>
                  <option value="SECONDARY">Secundaria</option>
                  <option value="SERVICE">Servicio</option>
                </select>
              </div>
            ) : (
              <>
                <h3 className="text-2xl font-black tracking-tighter text-white italic uppercase">{bar.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-black text-zinc-600 uppercase tracking-widest">UNIDAD {bar.type}</span>
                  <div className="w-1 h-1 rounded-full bg-[#36e27b]"></div>
                  <span className="text-[8px] font-black text-[#36e27b] uppercase tracking-widest">Despacho en Vivo</span>
                </div>
              </>
            )}
          </div>
        </div>
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-white bg-zinc-900/30 rounded-2xl transition-all border border-zinc-800">
          <X size={18} />
        </button>
      </div>

      <div className="px-8 bg-[#080808] border-b border-zinc-900 flex">
        <TabButton active={activeTab === 'kpi'} onClick={() => setActiveTab('kpi')} icon={<BarChart2 size={14}/>} label="Metricas" />
        <TabButton active={activeTab === 'stock'} onClick={() => setActiveTab('stock')} icon={<Package size={14}/>} label="Stock" />
        <TabButton active={activeTab === 'qrs'} onClick={() => setActiveTab('qrs')} icon={<QrCode size={14}/>} label="QRs" />
        <TabButton active={activeTab === 'history'} onClick={() => setActiveTab('history')} icon={<History size={14}/>} label="Cierres" />
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
        {activeTab === 'kpi' && (
          <div className="space-y-8 animate-in fade-in duration-300">
            <div className="grid grid-cols-2 gap-4">
              <KPICard label="Ingresos Totales" value={`$${(bar.metrics.revenue / 1000).toFixed(1)}k`} sub="Venta Bruta" color="text-[#36e27b]" />
              <KPICard label="Ticket Promedio" value={`$${(bar.metrics.revenue / (bar.metrics.activeOrders + 100)).toFixed(0)}`} sub="Sugerido" />
              <KPICard label="Escaneos" value={bar.metrics.totalScans.toString()} sub="Interacciones" />
              <KPICard label="Velocidad" value={`${bar.metrics.avgPrepTime}m`} sub="Prep. Media" />
            </div>
            <div className="bg-[#080808] border border-zinc-900 p-6 rounded-[32px] space-y-4">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Estado de Operación</h4>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-2 bg-zinc-950 rounded-full overflow-hidden">
                  <div className="w-[85%] h-full bg-[#36e27b]"></div>
                </div>
                <span className="text-xs font-black text-white">85% Capacidad</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'stock' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
               <div className="flex items-center gap-3">
                  <Package size={14} className="text-[#36e27b]" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-white italic">Inventario Local</h4>
               </div>
               <button onClick={() => onTransferOpen(bar.id)} className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-[#36e27b] text-[8px] font-black uppercase tracking-widest rounded-xl border border-zinc-800 hover:bg-[#36e27b]/10 transition-all">
                 <ArrowRightLeft size={12} /> Transferir Stock
               </button>
            </div>
            <div className="space-y-2">
              {bar.stock.map((item) => (
                <div key={item.id} className="bg-[#080808] border border-zinc-900 p-4 rounded-3xl flex items-center justify-between group hover:border-zinc-800 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center ${item.quantity <= item.minAlert ? 'text-rose-500 shadow-[0_0_15px_rgba(244,63,94,0.1)]' : 'text-zinc-600'}`}>
                      {item.quantity <= item.minAlert ? <AlertCircle size={16} /> : <Package size={16} />}
                    </div>
                    <div>
                      <p className="text-white text-xs font-bold uppercase tracking-tight">{item.name}</p>
                      <p className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest">{item.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black text-white leading-none">{item.quantity}<span className="text-[10px] text-zinc-600 ml-1 font-normal italic">{item.unit}</span></p>
                    {item.quantity <= item.minAlert && <p className="text-[7px] text-rose-500 font-black uppercase mt-1 animate-pulse">Crítico</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'qrs' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 italic border-b border-zinc-900 pb-4">
              {isEditMode ? 'Gestión de Asignación QR' : 'QRs Vinculados'}
            </h4>
            <div className="space-y-3">
              {zoneQrs.map(qr => {
                const isAssigned = bar.qrIds.includes(qr.id);
                if (!isEditMode && !isAssigned) return null;
                
                return (
                  <div key={qr.id} className={`bg-[#080808] border p-5 rounded-[32px] group hover:border-zinc-700 transition-all ${isAssigned ? 'border-[#36e27b]/20 shadow-[0_0_20px_rgba(54,226,123,0.05)]' : 'border-zinc-900 opacity-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${qr.isActive ? 'text-[#36e27b] border-[#36e27b]/20 bg-black' : 'text-zinc-700 border-zinc-800'}`}>
                          <QrCode size={18} />
                        </div>
                        <div>
                          <p className="text-xs font-black text-white uppercase">{qr.name}</p>
                          <p className="text-[7px] text-zinc-600 font-black uppercase tracking-widest">
                            {qr.barId && qr.barId !== bar.id ? `Asignado a otro: ${qr.barId}` : isAssigned ? 'Asignado a este' : 'Disponible'}
                          </p>
                        </div>
                      </div>
                      {isEditMode ? (
                        <button 
                          onClick={() => onToggleQrAssignment(qr.id)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isAssigned ? 'bg-[#36e27b] text-black' : 'bg-zinc-900 text-zinc-600 hover:text-white'}`}
                        >
                          {isAssigned ? <Unlink2 size={16} /> : <Link2 size={16} />}
                        </button>
                      ) : (
                        <div className="flex gap-1">
                          <button onClick={() => onToggleQr(qr.id)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${qr.isActive ? 'bg-zinc-900 text-rose-500 hover:bg-rose-500/10' : 'bg-[#36e27b] text-black'}`}>
                            <Power size={14} />
                          </button>
                          <button className="w-8 h-8 rounded-lg bg-zinc-900 text-zinc-500 flex items-center justify-center hover:text-white">
                            <Download size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    {isAssigned && !isEditMode && (
                       <div className="grid grid-cols-3 gap-2 border-t border-zinc-900/50 pt-4 mt-4">
                         <MetricSmall label="Escaneos" value={qr.scanCount.toString()} />
                         <MetricSmall label="Venta" value={`$${(qr.totalGeneratedRevenue/1000).toFixed(1)}k`} />
                         <MetricSmall label="Ticket" value={`$${(qr.totalGeneratedRevenue/(qr.scanCount || 1)).toFixed(0)}`} />
                       </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in duration-300 text-center py-20 opacity-30">
            <History size={48} className="mx-auto mb-4 text-zinc-800" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em]">No hay cierres previos registrados</p>
          </div>
        )}
      </div>

      <div className="p-8 bg-black border-t border-zinc-900 flex gap-4">
        <button 
          onClick={() => onClosureOpen(bar.id)}
          className="flex-1 py-4 bg-[#36e27b] text-black text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-xl hover:shadow-[#36e27b]/20 active:scale-95"
        >
          Cerrar Turno (Z)
        </button>
        <button className="px-6 py-4 bg-zinc-900 text-zinc-500 text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all border border-zinc-800 hover:text-white">
          Ajuste Manual
        </button>
      </div>
    </div>
  );
};

const TabButton: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={`flex-1 py-4 flex flex-col items-center gap-1 border-b-2 transition-all ${active ? 'border-[#36e27b] text-[#36e27b] bg-[#36e27b]/5' : 'border-transparent text-zinc-600 hover:text-zinc-400'}`}
  >
    {icon}
    <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

const KPICard: React.FC<{ label: string, value: string, sub: string, color?: string }> = ({ label, value, sub, color }) => (
  <div className="bg-[#080808] border border-zinc-900 p-6 rounded-[32px] flex flex-col">
    <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest mb-3">{label}</p>
    <p className={`text-2xl font-black italic leading-none mb-1 ${color || 'text-white'}`}>{value}</p>
    <p className="text-[8px] font-black text-zinc-700 uppercase tracking-widest">{sub}</p>
  </div>
);

const MetricSmall: React.FC<{ label: string, value: string }> = ({ label, value }) => (
  <div className="flex flex-col">
    <span className="text-[7px] text-zinc-600 font-black uppercase tracking-widest">{label}</span>
    <span className="text-[10px] font-black text-zinc-300 italic">{value}</span>
  </div>
);

export default BarDetail;
