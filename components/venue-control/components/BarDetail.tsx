import React, { useState, useEffect } from 'react';
import { Bar, QR, OrderStatus, StockItem, AppMode, StorageLocation } from '../types';
import { X, Beer, Package, AlertCircle, ArrowRightLeft, Plus, QrCode, TrendingUp, History, Download, Power, BarChart2, Link2, Unlink2, ArrowLeft, ChevronDown, Check } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { getAppUrl } from '../../../lib/urlUtils';
import QRCode from 'react-qr-code';
import { useToast } from '../../../components/ToastSystem';
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
  const { profile } = useAuth();
  // Mode-aware tabs
  const editTabs = ['config', 'qrs'] as const;
  const viewTabs = ['kpi', 'stock', 'orders', 'history'] as const;
  type EditTab = typeof editTabs[number];
  type ViewTab = typeof viewTabs[number];



  const [editTab, setEditTab] = useState<EditTab>('config');
  const [viewTab, setViewTab] = useState<ViewTab>('kpi');

  const [view, setView] = useState<'details' | 'qr'>('details');
  const [qrHash, setQrHash] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const { addToast } = useToast();

  const isEditMode = mode === AppMode.EDIT;

  const zoneQrs = allQrs.filter(q => q.zoneId === bar.zoneId);

  // Real Stock State
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);

  // Locations Management
  const [locations, setLocations] = useState<StorageLocation[]>([]);

  useEffect(() => {
    if (isEditMode) {
      supabase.from('storage_locations').select('*').then(({ data }) => {
        if (data) setLocations(data as StorageLocation[]);
      });
    }
  }, [isEditMode]);

  useEffect(() => {
    if (viewTab === 'stock' && bar.locationId && !isEditMode) {
      fetchStock();
    }
  }, [viewTab, bar.locationId, isEditMode]);

  const fetchStock = async () => {
    if (!bar.locationId) return;
    setLoadingStock(true);
    try {
      // Fetch levels linked to location
      // Assuming relationship to inventory_items or ingredients exists.
      // If strict foreign keys are set up, we can include item details.
      // If not, we might need a join or two steps.
      // Trying simple join first:
      const { data, error } = await supabase
        .from('item_stock_levels' as any)
        .select('*, item:inventory_items(name, unit, category, min_stock_alert)')
        .eq('storage_location_id', bar.locationId);

      if (error) throw error;

      if (data) {
        const mapped: StockItem[] = data.map((row: any) => ({
          id: row.id,
          name: row.item?.name || 'Unknown Item',
          category: row.item?.category || 'General',
          quantity: row.current_stock,
          unit: row.item?.unit || 'u',
          minAlert: row.item?.min_stock_alert || 0
        }));
        setStockItems(mapped);
      }
    } catch (e) {
      console.error('Stock Fetch Error:', e);
      // Fallback or empty
    } finally {
      setLoadingStock(false);
    }
  };

  const handleGenerateQR = async () => {
    if (!profile?.store_id) {
      addToast('Error de Seguridad', 'error', 'No se identificó el Store ID');
      return;
    }

    setLoadingQr(true);
    setView('qr');

    try {
      // Generate hash
      const newHash = btoa(`${profile.store_id}-${bar.id}-${Date.now()}`).replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);

      // Upsert: insert or update if exists
      const { data, error: upsertError } = await supabase
        .from('qr_links' as any)
        .upsert({
          store_id: profile.store_id,
          target_node_id: bar.id,
          code_hash: newHash,
          target_type: 'bar',
          is_active: true
        }, {
          onConflict: 'store_id,target_node_id',
          ignoreDuplicates: false
        })
        .select('code_hash')
        .single();

      if (upsertError) {
        // If upsert fails, try to fetch existing
        const { data: existing } = await supabase
          .from('qr_links' as any)
          .select('code_hash')
          .eq('store_id', profile.store_id)
          .eq('target_node_id', bar.id)
          .maybeSingle();

        if (existing) {
          setQrHash((existing as any).code_hash);
        } else {
          throw upsertError;
        }
      } else {
        setQrHash((data as any).code_hash);
      }
    } catch (e: any) {
      console.error('QR Error:', e);
      addToast('Error QR', 'error', e.message);
      setView('details');
    } finally {
      setLoadingQr(false);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      className="fixed inset-y-0 right-0 w-full md:w-[400px] bg-[#050505] border-l border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,1)] z-[210] flex flex-col animate-in slide-in-from-right duration-500"
    >
      {view === 'qr' ? (
        <div className="flex-1 flex flex-col h-full bg-[#050505] animate-in zoom-in-95 duration-300">
          <div className="p-6 border-b border-zinc-900 bg-[#080808] flex items-center justify-between">
            <button onClick={() => setView('details')} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-all">
              <ArrowLeft size={18} />
              <span className="text-[10px] font-black uppercase tracking-widest">Volver</span>
            </button>
            <h3 className="text-sm font-black text-white uppercase tracking-widest italic flex items-center gap-2">
              <QrCode size={16} className="text-[#36e27b]" />
              QR {bar.name}
            </h3>
            <div className="w-8"></div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-8">
            {loadingQr ? (
              <div className="flex flex-col items-center gap-4 animate-pulse">
                <div className="w-12 h-12 border-4 border-[#36e27b] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#36e27b]">Generando Enlace...</p>
              </div>
            ) : (
              <>
                <div className="bg-white p-6 rounded-3xl border-4 border-[#36e27b] shadow-[0_0_50px_rgba(54,226,123,0.3)]">
                  {qrHash && (
                    <QRCode
                      value={`${getAppUrl()}/#/qr/${qrHash}`}
                      size={200}
                      viewBox={`0 0 256 256`}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em]">Enlace Permanente</p>
                  <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-[10px] font-mono text-zinc-400 break-all max-w-[280px]">
                    {getAppUrl()}/#/qr/{qrHash}
                  </div>
                </div>

                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${getAppUrl()}/#/qr/${qrHash}`);
                    addToast('Enlace Copiado', 'success');
                  }}
                  className="px-6 py-3 bg-[#36e27b] text-black font-black text-[10px] uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-lg shadow-[#36e27b]/20"
                >
                  Copiar URL
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
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
                    <div className="flex gap-2">
                      {/* ... Keep selects ... */}
                      <select
                        value={bar.type}
                        onChange={(e) => onUpdateProperty('type', e.target.value)}
                        className="flex-1 bg-black border border-zinc-800 rounded-lg px-2 py-1 text-[8px] font-black text-zinc-400 uppercase outline-none"
                      >
                        <option value="MAIN">Principal</option>
                        <option value="SECONDARY">Secundaria</option>
                        <option value="SERVICE">Servicio</option>
                      </select>

                      <select
                        value={bar.locationId || ''}
                        onChange={(e) => onUpdateProperty('locationId', e.target.value)}
                        className="flex-1 bg-black border border-zinc-800 rounded-lg px-2 py-1 text-[8px] font-black text-[#36e27b] uppercase outline-none"
                      >
                        <option value="">Sin Ubicación</option>
                        {locations.map(loc => (
                          <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleGenerateQR}
                      className="mt-2 w-full py-2 bg-zinc-900 border border-zinc-800 hover:border-[#36e27b]/50 text-zinc-400 hover:text-[#36e27b] rounded-xl flex items-center justify-center gap-2 transition-all group"
                    >
                      <QrCode size={14} />
                      <span className="text-[8px] font-black uppercase tracking-widest">Generar QR Barra</span>
                    </button>
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

          {/* MODE-AWARE TABS */}
          <div className="px-8 bg-[#080808] border-b border-zinc-900 flex">
            {isEditMode ? (
              <>
                <TabButton active={editTab === 'config'} onClick={() => setEditTab('config')} icon={<Beer size={14} />} label="Config" />
                <TabButton active={editTab === 'qrs'} onClick={() => setEditTab('qrs')} icon={<QrCode size={14} />} label="QRs" />
              </>
            ) : (
              <>
                <TabButton active={viewTab === 'kpi'} onClick={() => setViewTab('kpi')} icon={<BarChart2 size={14} />} label="Metricas" />
                <TabButton active={viewTab === 'stock'} onClick={() => setViewTab('stock')} icon={<Package size={14} />} label="Stock" />
                <TabButton active={viewTab === 'orders'} onClick={() => setViewTab('orders')} icon={<TrendingUp size={14} />} label="Pedidos" />
                <TabButton active={viewTab === 'history'} onClick={() => setViewTab('history')} icon={<History size={14} />} label="Cierres" />
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">

            {/* ========== EDIT MODE CONTENT ========== */}
            {isEditMode && editTab === 'config' && (
              <div className="space-y-8 animate-in fade-in duration-300">

                {/* CONFIGURATION CARD */}
                <div className="space-y-6">
                  <div className="space-y-1">
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Configuración General</h4>
                    <p className="text-[10px] text-zinc-600">Define la identidad y el comportamiento de esta unidad.</p>
                  </div>

                  <div className="space-y-5">
                    {/* NAME INPUT */}
                    <div className="group">
                      <label className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-2 group-focus-within:text-[#36e27b] transition-colors">Nombre de la Barra</label>
                      <input
                        type="text"
                        value={bar.name}
                        onChange={(e) => onUpdateProperty('name', e.target.value)}
                        className="w-full bg-[#111] border border-zinc-900 rounded-xl px-4 py-3.5 text-sm font-bold text-white placeholder-zinc-700 outline-none focus:border-[#36e27b] focus:bg-[#151515] transition-all"
                        placeholder="Ej. Barra Principal"
                      />
                    </div>

                    {/* TYPE SELECT */}
                    <div className="group">
                      <label className="block text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-2 group-focus-within:text-[#36e27b] transition-colors">Tipo de Unidad</label>
                      <div className="relative">
                        <select
                          value={bar.type}
                          onChange={(e) => onUpdateProperty('type', e.target.value)}
                          className="w-full bg-[#111] border border-zinc-900 rounded-xl px-4 py-3.5 pr-10 text-sm font-bold text-white appearance-none outline-none focus:border-[#36e27b] focus:bg-[#151515] transition-all"
                        >
                          <option value="MAIN">Barra Principal</option>
                          <option value="SECONDARY">Barra Secundaria</option>
                          <option value="SERVICE">Punto de Servicio</option>
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-600 group-focus-within:text-[#36e27b] transition-colors">
                          <ChevronDown size={14} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-zinc-900 w-full" />

                {/* INVENTORY CONNECTION */}
                <div className="space-y-6">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Package size={14} className="text-[#36e27b]" />
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Conexión de Inventario</h4>
                    </div>
                    <p className="text-[10px] text-zinc-600 max-w-xs">
                      Vincula esta barra a un depósito físico. Los productos vendidos se descontarán automáticamente de esta ubicación.
                    </p>
                  </div>

                  <div className="group">
                    <div className="relative">
                      <select
                        value={bar.locationId || ''}
                        onChange={(e) => onUpdateProperty('locationId', e.target.value)}
                        className={`w-full border rounded-xl px-4 py-3.5 pr-10 text-sm font-bold appearance-none outline-none focus:bg-[#151515] transition-all ${bar.locationId
                          ? 'bg-[#36e27b]/5 border-[#36e27b]/30 text-[#36e27b] focus:border-[#36e27b]'
                          : 'bg-[#111] border-zinc-900 text-zinc-500 focus:border-zinc-700'
                          }`}
                      >
                        <option value="">Sin Ubicación Vinculada (Solo POS)</option>
                        {locations.map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name} — {loc.type === 'warehouse' ? 'Depósito' : 'Area de Prep.'}
                          </option>
                        ))}
                      </select>
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-600">
                        {bar.locationId ? <Check size={14} className="text-[#36e27b]" /> : <ChevronDown size={14} />}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="h-px bg-zinc-900 w-full" />


                {/* STATUS CARD */}
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 bg-[#111] rounded-2xl border border-zinc-900">
                    <div>
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Estado de Operación</h4>
                      <p className="text-[9px] text-zinc-600 mt-1">Habilitar/Deshabilitar pedidos</p>
                    </div>

                    <button
                      onClick={() => onUpdateProperty('isActive', !bar.isActive)}
                      className={`relative w-12 h-6 rounded-full transition-colors duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-[#36e27b] ${bar.isActive ? 'bg-[#36e27b]' : 'bg-zinc-800'}`}
                    >
                      <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-300 ease-out ${bar.isActive ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isEditMode && editTab === 'qrs' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 italic border-b border-zinc-900 pb-4">
                  Gestión de Asignación QR
                </h4>
                <div className="space-y-3">
                  {zoneQrs.map(qr => {
                    const isAssigned = bar.qrIds.includes(qr.id);
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
                                {isAssigned ? 'Asignado a este' : 'Disponible'}
                              </p>
                            </div>
                          </div>
                          <button onClick={() => onToggleQrAssignment(qr.id)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isAssigned ? 'bg-[#36e27b] text-black' : 'bg-zinc-900 text-zinc-600 hover:text-white'}`}>
                            {isAssigned ? <Unlink2 size={16} /> : <Link2 size={16} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {zoneQrs.length === 0 && (
                    <div className="text-center py-12 text-zinc-600">
                      <QrCode size={32} className="mx-auto mb-3 opacity-30" />
                      <p className="text-[9px] font-black uppercase tracking-widest">No hay QRs en esta zona</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========== VIEW MODE CONTENT ========== */}
            {!isEditMode && viewTab === 'kpi' && (
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

            {!isEditMode && viewTab === 'stock' && (
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
                  {!bar.locationId ? (
                    <div className="text-center py-8 text-zinc-500 text-xs">Sin ubicación de inventario vinculada</div>
                  ) : loadingStock ? (
                    <div className="text-center py-8 text-zinc-500 text-xs animate-pulse">Cargando stock...</div>
                  ) : stockItems.length === 0 ? (
                    <div className="text-center py-8 text-zinc-500 text-xs">No hay items en stock</div>
                  ) : (
                    stockItems.map((item) => (
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
                    ))
                  )}
                </div>
              </div>
            )}

            {/* LIVE ORDERS TAB (VIEW MODE ONLY) */}
            {!isEditMode && viewTab === 'orders' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
                  <div className="flex items-center gap-3">
                    <TrendingUp size={14} className="text-[#36e27b]" />
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-white italic">Pedidos Activos</h4>
                  </div>
                  <span className="text-[10px] font-black text-[#36e27b] bg-[#36e27b]/10 px-3 py-1 rounded-full">
                    {bar.metrics.activeOrders} en cola
                  </span>
                </div>

                {bar.metrics.activeOrders === 0 ? (
                  <div className="text-center py-16 opacity-30">
                    <TrendingUp size={48} className="mx-auto mb-4 text-zinc-800" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">Sin pedidos activos</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Mock active orders - in production, fetch from DB */}
                    {[1, 2, 3].slice(0, bar.metrics.activeOrders).map((orderNum, i) => (
                      <div key={`mock-order-${bar.id}-${orderNum}-${i}`} className="bg-[#080808] border border-zinc-900 p-4 rounded-2xl flex items-center justify-between group hover:border-[#36e27b]/20 transition-all">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                            <Package size={16} />
                          </div>
                          <div>
                            <p className="text-white text-xs font-bold">Pedido #{1000 + i}</p>
                            <p className="text-[8px] text-zinc-600 font-bold uppercase">En preparación</p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-amber-400">3 items</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!isEditMode && viewTab === 'history' && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* Same QR logic as before but referencing zoneQrs */}
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
                            <button onClick={() => onToggleQrAssignment(qr.id)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isAssigned ? 'bg-[#36e27b] text-black' : 'bg-zinc-900 text-zinc-600 hover:text-white'}`}>
                              {isAssigned ? <Unlink2 size={16} /> : <Link2 size={16} />}
                            </button>
                          ) : (
                            <div className="flex gap-1">
                              <button onClick={() => onToggleQr(qr.id)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${qr.isActive ? 'bg-zinc-900 text-rose-500 hover:bg-rose-500/10' : 'bg-[#36e27b] text-black'}`}>
                                <Power size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* MODE-AWARE FOOTER */}
          <div className="p-8 bg-black border-t border-zinc-900 flex gap-4">
            {isEditMode ? (
              <button
                onClick={onClose}
                className="flex-1 py-4 bg-[#36e27b] text-black text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-xl hover:shadow-[#36e27b]/20 active:scale-95"
              >
                Guardar Cambios
              </button>
            ) : (
              <>
                <button
                  onClick={() => onClosureOpen(bar.id)}
                  className="flex-1 py-4 bg-[#36e27b] text-black text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all shadow-xl hover:shadow-[#36e27b]/20 active:scale-95"
                >
                  Cerrar Turno (Z)
                </button>
                <button className="px-6 py-4 bg-zinc-900 text-zinc-500 text-[10px] font-black uppercase tracking-widest rounded-3xl transition-all border border-zinc-800 hover:text-white">
                  Ajuste Manual
                </button>
              </>
            )}
          </div>
        </>
      )}
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
