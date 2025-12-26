import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Layout from './components/Layout';
import TableMap from './components/TableMap';
import TableDetail from './components/TableDetail';
import BarDetail from './components/BarDetail';
import QRDetail from './components/QRDetail';
import QRGenerator from './components/QRGenerator';
import { AppMode, Table, Bar, QR, TableStatus, Position, OrderStatus, Zone, NotificationType, VenueNotification } from './types';
import { INITIAL_ZONES } from './constants';
import { ZoomIn, ZoomOut, Zap, MousePointer2, Plus, Beer, Circle, QrCode, Check, Trash2, Edit3, X as XIcon, Users, Layers, Bell, Timer, Clock, Hand, Receipt, AlertCircle, ChevronRight } from 'lucide-react';
import { useToast } from '../../components/ToastSystem';

const App: React.FC = () => {
  const { profile } = useAuth();
  const { addToast } = useToast();

  const [mode, setMode] = useState<AppMode>(AppMode.VIEW);
  const [zones, setZones] = useState<Zone[]>(INITIAL_ZONES);
  const [activeZoneId, setActiveZoneId] = useState<string>(INITIAL_ZONES[0].id);

  const [tables, setTables] = useState<Table[]>([]);
  const [bars, setBars] = useState<Bar[]>([]);
  const [qrs, setQrs] = useState<QR[]>([]);
  const [notifications, setNotifications] = useState<VenueNotification[]>([]);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedBarId, setSelectedBarId] = useState<string | null>(null);
  const [selectedQrId, setSelectedQrId] = useState<string | null>(null);
  const [selectedQrTarget, setSelectedQrTarget] = useState<{ id: string, name: string } | null>(null);

  const [zoom, setZoom] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Estados para creación/edición de zonas
  const [isAddingZone, setIsAddingZone] = useState(false);
  const [isEditingZone, setIsEditingZone] = useState(false);
  const [zoneInputName, setZoneInputName] = useState('');

  // --- SUPABASE INTEGRATION ---

  const fetchNodes = useCallback(async () => {
    if (!profile?.store_id) return;

    try {
      const { data, error } = await supabase
        .from('venue_nodes' as any)
        .select('*')
        .eq('store_id', profile.store_id);

      if (error) throw error;

      const loadedTables: Table[] = [];
      const loadedBars: Bar[] = [];
      const loadedQrs: QR[] = [];

      data?.forEach((node: any) => {
        const position = { x: node.position_x, y: node.position_y };
        if (node.type === 'table') {
          loadedTables.push({
            id: node.id,
            name: node.label,
            zoneId: activeZoneId, // Default zone as DB doesn't have it yet
            capacity: 4,
            status: node.status || TableStatus.FREE,
            position,
            size: { w: 80, h: 80 },
            rotation: 0,
            shape: 'circle',
            totalAmount: 0,
            orders: [],
            lastUpdate: new Date()
          });
        } else if (node.type === 'bar') {
          loadedBars.push({
            id: node.id,
            name: node.label,
            zoneId: activeZoneId,
            location: '',
            type: 'MAIN',
            isActive: true,
            position,
            size: { w: 200, h: 80 },
            rotation: 0,
            stock: [],
            qrIds: [],
            metrics: { revenue: 0, avgPrepTime: 0, activeOrders: 0, totalScans: 0 }
          });
        } else if (node.type === 'qr') {
          loadedQrs.push({
            id: node.id,
            name: node.label || 'QR SPOT',
            zoneId: activeZoneId,
            type: 'ZONE',
            position,
            isActive: true,
            scanCount: 0,
            totalGeneratedRevenue: 0
          });
        }
      });

      setTables(loadedTables);
      setBars(loadedBars);
      setQrs(loadedQrs);
    } catch (err: any) {
      console.error('Error fetching nodes:', err);
      addToast('Error al cargar mapa', 'error');
    }
  }, [profile?.store_id, activeZoneId]); // Re-fetch only if store or zone changes (conceptually)

  useEffect(() => {
    fetchNodes();

    if (!profile?.store_id) return;

    // Realtime Subscription
    const channel = supabase
      .channel('venue_updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'venue_nodes', filter: `store_id=eq.${profile.store_id}` },
        (payload) => {
          fetchNodes(); // Simple refresh strategy for now
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.store_id, fetchNodes]);


  // --- ACTIONS (DB Connected) ---

  // --- ZONE ACTIONS (Local State) ---
  const handleAddZone = () => {
    if (!zoneInputName.trim()) return;
    const newZone: Zone = {
      id: `z-${Date.now()}`,
      name: zoneInputName.trim(),
      description: ''
    };
    setZones(prev => [...prev, newZone]);
    setActiveZoneId(newZone.id);
    setZoneInputName('');
    setIsAddingZone(false);
    addToast('Sala creada', 'success');
  };

  const handleUpdateZone = () => {
    if (!zoneInputName.trim() || !activeZoneId) return;
    setZones(prev => prev.map(z => z.id === activeZoneId ? { ...z, name: zoneInputName.trim() } : z));
    setZoneInputName('');
    setIsEditingZone(false);
    addToast('Sala actualizada', 'success');
  };

  const handleDeleteZone = (zoneId: string) => {
    if (!zones.find(z => z.id === zoneId)) return;
    if (confirm('¿Eliminar sala?')) {
      const newZones = zones.filter(z => z.id !== zoneId);
      setZones(newZones);
      if (newZones.length > 0) setActiveZoneId(newZones[0].id);
      else setActiveZoneId('');
      addToast('Sala eliminada', 'info');
    }
  };

  const addNode = async (type: 'table' | 'bar' | 'qr') => {
    if (!profile?.store_id) return;

    // Generic insert for table, bar, AND qr
    try {
      const { error } = await supabase
        .from('venue_nodes' as any)
        .insert({
          store_id: profile.store_id,
          label: type === 'table' ? `M-${tables.length + 1}` : type === 'bar' ? `BAR ${bars.length + 1}` : `QR-${qrs.length + 1}`,
          type: type,
          position_x: 400,
          position_y: 300,
          status: 'free'
        });

      if (error) throw error;
      addToast(`${type === 'table' ? 'Mesa' : type === 'bar' ? 'Barra' : 'Punto QR'} creada`, 'success');
    } catch (err: any) {
      console.error('Error creating node:', err);
      addToast('Error al crear elemento', 'error');
    }
    setShowAddMenu(false);
  };


  const handleUpdateTableStatus = useCallback(async (id: string, status: TableStatus) => {
    if (!profile?.store_id) return;

    // Optimistic Update
    setTables(prev => prev.map(t => t.id === id ? { ...t, status } : t));

    try {
      const { error } = await supabase
        .from('venue_nodes' as any)
        .update({ status })
        .eq('id', id)
        .eq('store_id', profile.store_id);

      if (error) throw error;

      // Toast feedback
      if (status === TableStatus.OCCUPIED) addToast('Mesa Abierta', 'success', 'Operación iniciada');
      else if (status === TableStatus.FREE) addToast('Mesa Liberada', 'default', 'Lista para clientes');

    } catch (err: any) {
      console.error('Status Update Error:', err);
      addToast('Error de Actualización', 'error', 'No se pudo cambiar el estado');
      fetchNodes(); // Revert on error
    }
  }, [profile?.store_id, addToast, fetchNodes]);

  const updateNodeProperty = useCallback(async (id: string, type: 'table' | 'bar', property: string, value: any) => {
    if (!profile?.store_id) return;

    // INTERCEPT QR MODAL TRIGGER
    if (property === 'qr_modal') {
      const target = type === 'table' ? tables.find(t => t.id === id) : bars.find(b => b.id === id);
      if (target) setSelectedQrTarget({ id: target.id, name: target.name });
      return;
    }

    // Optimistic update
    if (type === 'table') {
      setTables(prev => prev.map(t => t.id === id ? { ...t, [property]: value } : t));
    } else {
      setBars(prev => prev.map(b => b.id === id ? { ...b, [property]: value } : b));
    }

    try {
      // Just a stub for now
    } catch (e) {
      console.error(e);
      fetchNodes();
    }
  }, [profile?.store_id, tables, bars, fetchNodes]);

  const updatePosition = useCallback(async (id: string, position: Position, type: 'table' | 'bar' | 'qr') => {
    if (!profile?.store_id) return;

    // Optimistic Update
    if (type === 'table') setTables(prev => prev.map(t => t.id === id ? { ...t, position } : t));
    else if (type === 'bar') setBars(prev => prev.map(b => b.id === id ? { ...b, position } : b));
    else if (type === 'qr') setQrs(prev => prev.map(q => q.id === id ? { ...q, position } : q));

    try {
      await supabase
        .from('venue_nodes' as any)
        .update({ position_x: Math.round(position.x), position_y: Math.round(position.y) })
        .eq('id', id)
        .eq('store_id', profile.store_id);
    } catch (err) {
      console.error('Error updating position:', err);
    }
  }, [profile?.store_id]);

  const deleteNode = async (id: string, type: 'table' | 'bar' | 'qr') => {
    if (!profile?.store_id) return;
    if (!window.confirm('¿Eliminar este elemento?')) return;

    try {
      const { error } = await supabase
        .from('venue_nodes' as any)
        .delete()
        .eq('id', id)
        .eq('store_id', profile.store_id);

      if (error) throw error;

      // Optimistic update
      if (type === 'table') setTables(prev => prev.filter(t => t.id !== id));
      else if (type === 'bar') setBars(prev => prev.filter(b => b.id !== id));
      else if (type === 'qr') setQrs(prev => prev.filter(q => q.id !== id));

      addToast('Elemento eliminado', 'info');
      clearSelections();
    } catch (err) {
      console.error('Error deleting:', err);
      addToast('Error al eliminar', 'error');
    }
  };

  const updateTableStatus = useCallback(async (id: string, newStatus: TableStatus) => {
    try {
      await supabase.from('venue_nodes' as any).update({ status: newStatus }).eq('id', id);
    } catch (err) {
      console.error('Error updating status:', err);
    }
  }, []);

  // --- SELECTION HANDLERS ---
  const handleSelectTable = (id: string | null) => {
    setSelectedTableId(id); setSelectedBarId(null); setSelectedQrId(null);
  };
  const handleSelectBar = (id: string | null) => {
    setSelectedBarId(id); setSelectedTableId(null); setSelectedQrId(null);
  };
  const handleSelectQr = (id: string | null) => {
    setSelectedQrId(id); setSelectedTableId(null); setSelectedBarId(null);
  };

  const clearSelections = () => {
    setSelectedTableId(null); setSelectedBarId(null); setSelectedQrId(null); setSelectedQrTarget(null);
  };

  const selectedTable = useMemo(() => tables.find(t => t.id === selectedTableId), [tables, selectedTableId]);
  const selectedBar = useMemo(() => bars.find(b => b.id === selectedBarId), [bars, selectedBarId]);
  const selectedQr = useMemo(() => qrs.find(q => q.id === selectedQrId), [qrs, selectedQrId]);

  return (
    <div className="flex flex-col h-full bg-black text-white overflow-hidden relative font-sans selection:bg-[#36e27b] selection:text-black">

      {/* --- HEADER --- */}
      <Layout
        mode={mode}
        setMode={setMode}
        onAddNode={() => setShowAddMenu(true)}
        zones={zones}
        activeZoneId={activeZoneId}
        setActiveZoneId={setActiveZoneId}
        isAddingZone={isAddingZone}
        setIsAddingZone={setIsAddingZone}
        isEditingZone={isEditingZone}
        setIsEditingZone={setIsEditingZone}
        zoneInputName={zoneInputName}
        setZoneInputName={setZoneInputName}
        onAddZone={handleAddZone}
        onUpdateZone={handleUpdateZone}
        onDeleteZone={handleDeleteZone}
      >
        <div className="flex-1 relative overflow-hidden flex h-full">
          {/* CANVAS AREA */}
          <div className="flex-1 relative bg-[#0a0a0a] overflow-hidden cursor-crosshair group/map">

            {/* Background Grid */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
                backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left'
              }}
            ></div>

            <TableMap
              tables={tables.filter(t => t.zoneId === activeZoneId)}
              bars={bars.filter(b => b.zoneId === activeZoneId)}
              qrs={qrs.filter(q => q.zoneId === activeZoneId)}
              mode={mode}
              activeZoneId={activeZoneId}
              selectedTableId={selectedTableId}
              selectedBarId={selectedBarId}
              selectedQrId={selectedQrId}
              onSelectTable={handleSelectTable}
              onSelectBar={handleSelectBar}
              onSelectQr={handleSelectQr}
              onUpdatePosition={updatePosition}
              onDeleteNode={deleteNode}
              zoom={zoom}
              setZoom={setZoom}
              onBackgroundClick={clearSelections}
            />

            {/* MODE INDICATOR */}
            <div className="absolute bottom-6 left-6 pointer-events-none z-10 transition-all duration-500 ease-out transform translate-y-0 opacity-100">
              <div className={`px-4 py-2 rounded-full border backdrop-blur-md flex items-center gap-3 shadow-2xl
                     ${mode === AppMode.VIEW
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                }`}>
                <div className={`w-2 h-2 rounded-full animate-pulse ${mode === AppMode.VIEW ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {mode === AppMode.VIEW ? 'Modo Operativo' : 'Modo Edición'}
                </span>
              </div>
            </div>

            {/* ZOOM CONTROLS */}
            <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-10">
              <button onClick={() => setZoom(z => Math.min(z + 0.1, 2))} className="p-3 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full shadow-lg transition-all active:scale-95">
                <ZoomIn size={18} />
              </button>
              <button onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))} className="p-3 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full shadow-lg transition-all active:scale-95">
                <ZoomOut size={18} />
              </button>
              <div className="h-px w-8 bg-zinc-800 mx-auto my-1"></div>
              <button onClick={() => setZoom(1)} className="p-3 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-full shadow-lg transition-all active:scale-95 group">
                <span className="text-[10px] font-black group-hover:hidden">100%</span>
                <MousePointer2 size={18} className="hidden group-hover:block" />
              </button>
            </div>

          </div>

          {/* SIDE PANEL (DETAILS) */}
          <div className="w-[380px] border-l border-zinc-800 bg-[#0a0a0a] flex flex-col relative z-20 shadow-[-10px_0_30px_-10px_rgba(0,0,0,0.5)]">
            {selectedTable ? (
              <TableDetail
                table={selectedTable}
                onClose={clearSelections}
                onUpdateStatus={handleUpdateTableStatus}
                onUpdateProperty={(prop, val) => updateNodeProperty(selectedTable.id, 'table', prop, val)}
                mode={mode}
              />
            ) : selectedBar ? (
              <BarDetail
                bar={selectedBar}
                onClose={clearSelections}
                onUpdateProperty={(prop, val) => updateNodeProperty(selectedBar.id, 'bar', prop, val)}
                mode={mode}
              />
            ) : selectedQr ? (
              <QRDetail qr={selectedQr} onClose={clearSelections} />
            ) : (
              // EMPTY STATE (Dashboard / Summary)
              <div className="h-full flex flex-col items-center justify-center p-8 text-center space-y-6 opacity-30 select-none pointer-events-none">
                <div className="w-24 h-24 rounded-full border-2 border-dashed border-zinc-600 flex items-center justify-center">
                  <MousePointer2 className="w-8 h-8 text-zinc-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-zinc-400 uppercase tracking-widest">Selecciona un elemento</h3>
                  <p className="text-[10px] text-zinc-600 mt-2 max-w-[200px] mx-auto leading-relaxed">
                    Haz clic en una mesa o barra para ver detalles, gestionar pedidos o editar propiedades.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Layout>

      {/* MODALS */}
      {showAddMenu && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-[#111] border border-zinc-800 rounded-3xl p-8 w-full max-w-md shadow-2xl transform scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-xl font-black text-white italic uppercase tracking-wider">Agregar Elemento</h3>
              <button onClick={() => setShowAddMenu(false)} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
                <XIcon className="text-zinc-500 hover:text-white" size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => addNode('table')} className="p-6 bg-zinc-900/50 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800 rounded-2xl flex flex-col items-center gap-4 transition-all group">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Circle size={24} className="text-white" />
                </div>
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Mesa</span>
              </button>

              <button onClick={() => addNode('bar')} className="p-6 bg-zinc-900/50 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800 rounded-2xl flex flex-col items-center gap-4 transition-all group">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Beer size={24} className="text-white" />
                </div>
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Barra</span>
              </button>

              <button onClick={() => addNode('qr')} className="p-6 bg-zinc-900/50 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800 rounded-2xl flex flex-col items-center gap-4 transition-all col-span-2 group">
                <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <QrCode size={24} className="text-white" />
                </div>
                <span className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Punto QR (Standalone)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedQrTarget && (
        <QRGenerator
          targetId={selectedQrTarget.id}
          targetName={selectedQrTarget.name}
          onClose={() => setSelectedQrTarget(null)}
        />
      )}

    </div>
  );
};

export default App;
