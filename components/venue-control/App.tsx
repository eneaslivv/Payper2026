import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import Layout from './components/Layout';
import TableMap from './components/TableMap';
import TableDetail from './components/TableDetail';
import BarDetail from './components/BarDetail';
import QRDetail from './components/QRDetail';
import QRGenerator from './components/QRGenerator';
import LiveActivityPanel from './components/LiveActivityPanel';
import { AppMode, Table, Bar, QR, TableStatus, Position, OrderStatus, Zone, NotificationType, VenueNotification } from './types';
import { INITIAL_ZONES } from './constants';
import { ZoomIn, ZoomOut, Zap, MousePointer2, Plus, Beer, Circle, QrCode, Check, Trash2, Edit3, X as XIcon, Users, Layers, Bell, Timer, Clock, Hand, Receipt, AlertCircle, ChevronRight, ClipboardList } from 'lucide-react';
import { useToast } from '../../components/ToastSystem';
import { TransferStockModal } from '../../components/TransferStockModal';

const App: React.FC = () => {
  const { profile } = useAuth();
  const { addToast } = useToast();

  const [mode, setMode] = useState<AppMode>(AppMode.VIEW);
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<string>('');
  const [storeSlug, setStoreSlug] = useState<string>('');

  const [tables, setTables] = useState<Table[]>([]);
  const [bars, setBars] = useState<Bar[]>([]);
  const [qrs, setQrs] = useState<QR[]>([]);
  const [notifications, setNotifications] = useState<VenueNotification[]>([]);

  // Selection States
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedBarId, setSelectedBarId] = useState<string | null>(null);
  const [selectedQrId, setSelectedQrId] = useState<string | null>(null);
  const [selectedQrTarget, setSelectedQrTarget] = useState<{ id: string, name: string } | null>(null);

  const [zoom, setZoom] = useState(1);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Zone Management States
  const [isAddingZone, setIsAddingZone] = useState(false);
  const [isEditingZone, setIsEditingZone] = useState(false);
  const [zoneInputName, setZoneInputName] = useState('');

  // Transfer Modal State
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferSourceLocationId, setTransferSourceLocationId] = useState<string | undefined>(undefined);

  // --- DATA FETCHING ---

  const fetchZones = useCallback(async () => {
    if (!profile?.store_id) return;
    try {
      const { data, error } = await supabase
        .from('venue_zones' as any)
        .select('*')
        .eq('store_id', profile.store_id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data) {
        setZones(data as unknown as Zone[]);
        // Set active zone if not set or invalid
        if (!activeZoneId || !(data as any[]).find(z => z.id === activeZoneId)) {
          if (data.length > 0) setActiveZoneId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching zones:', err);
      // Optional: addToast('Error loading zones', 'error');
    }
  }, [profile?.store_id, activeZoneId]);

  const fetchNodes = useCallback(async () => {
    if (!profile?.store_id) return;

    try {
      // Fetch from the VIEW active_venue_states
      const { data, error } = await supabase
        .from('active_venue_states' as any)
        .select('*')
        .eq('store_id', profile.store_id);

      if (error) throw error;

      // FETCH STORAGE LOCATIONS (For linking bars)
      const { data: locations } = await supabase
        .from('storage_locations')
        .select('id, bar_id')
        .eq('store_id', profile.store_id)
        .not('bar_id', 'is', null);

      const barLocationMap = new Map();
      locations?.forEach((l: any) => {
        if (l.bar_id) barLocationMap.set(l.bar_id, l.id);
      });

      const loadedTables: Table[] = [];
      const loadedBars: Bar[] = [];
      const loadedQrs: QR[] = [];

      data?.forEach((node: any) => {
        const position = { x: node.position_x, y: node.position_y };
        const metadata = node.metadata || {};
        const size = { w: metadata.w || 80, h: metadata.h || 80 };
        const rotation = node.rotation || metadata.rotation || 0;
        const shape = metadata.shape || 'circle';

        if (node.type === 'table') {
          // Check for QR Mask
          if (metadata.subtype === 'qr') {
            loadedQrs.push({
              id: node.node_id,
              name: node.label || 'QR SPOT',
              zoneId: node.zone_id || '',
              type: 'ZONE',
              position,
              isActive: true,
              scanCount: 0,
              totalGeneratedRevenue: 0
            });
            return; // Skip adding to tables
          }

          loadedTables.push({
            id: node.node_id,
            name: node.label,
            zoneId: node.zone_id || '',
            capacity: 4,
            status: node.derived_status as TableStatus,
            locationId: node.location_id,
            position,
            size,
            rotation,
            shape,
            totalAmount: node.current_total || 0,
            orders: [],
            activeOrderId: node.active_order_id,
            openedAt: node.order_start_time ? new Date(node.order_start_time) : undefined,
            lastUpdate: new Date(node.updated_at || new Date())
          });
        } else if (node.type === 'bar') {
          const barSize = { w: metadata.w || 200, h: metadata.h || 80 };
          loadedBars.push({
            id: node.node_id,
            name: node.label,
            zoneId: node.zone_id || '',
            location: '',
            locationId: node.location_id || barLocationMap.get(node.node_id),
            type: 'MAIN',
            isActive: true,
            position,
            size: barSize,
            rotation,
            stock: [],
            qrIds: [],
            metrics: { revenue: 0, avgPrepTime: 0, activeOrders: 0, totalScans: 0 }
          });
        } else if (node.type === 'qr') {
          loadedQrs.push({
            id: node.node_id,
            name: node.label || 'QR SPOT',
            zoneId: node.zone_id || '',
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
  }, [profile?.store_id]);

  // Fetch Notifications
  const fetchNotifications = useCallback(async () => {
    if (!profile?.store_id) return;
    try {
      const { data } = await supabase
        .from('venue_notifications' as any)
        .select('*')
        .eq('store_id', profile.store_id)
        .eq('is_read', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        // Map notifications to tables
        setNotifications(data.map((n: any) => ({
          id: n.id,
          type: n.type as any,
          tableId: n.node_id,
          timestamp: new Date(n.created_at),
          message: n.message,
          isRead: n.is_read
        })));
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, [profile?.store_id]);

  // Initial Load
  useEffect(() => {
    if (profile?.store_id) {
      fetchZones();
      fetchNodes();
      fetchNotifications();
      // Fetch store slug for QR URLs
      supabase.from('stores').select('slug').eq('id', profile.store_id).single().then(({ data }) => {
        if (data?.slug) setStoreSlug(data.slug);
      });
    }
  }, [profile?.store_id, fetchZones, fetchNodes]);

  // Realtime Subscriptions
  useEffect(() => {
    if (!profile?.store_id) return;

    const channel = supabase.channel('venue_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_nodes', filter: `store_id=eq.${profile.store_id}` }, () => fetchNodes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${profile.store_id}` }, () => fetchNodes())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_zones', filter: `store_id=eq.${profile.store_id}` }, () => fetchZones())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_notifications', filter: `store_id=eq.${profile.store_id}` }, () => fetchNotifications())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.store_id, fetchNodes, fetchZones, fetchNotifications]);


  // --- ZONE ACTIONS (DB) ---
  const handleAddZone = async () => {
    if (!zoneInputName.trim() || !profile?.store_id) return;
    try {
      const { error } = await supabase.from('venue_zones' as any).insert({
        store_id: profile.store_id,
        name: zoneInputName.trim()
      });
      if (error) throw error;
      addToast('Sala creada', 'success');
      setZoneInputName('');
      setIsAddingZone(false);
      fetchZones(); // Force refresh
    } catch (e) {
      console.error(e);
      addToast('Error al crear sala', 'error');
    }
  };

  const handleUpdateZone = async () => {
    if (!zoneInputName.trim() || !activeZoneId) return;
    try {
      const { error } = await supabase.from('venue_zones' as any).update({ name: zoneInputName.trim() }).eq('id', activeZoneId);
      if (error) throw error;
      addToast('Sala actualizada', 'success');
      setZoneInputName('');
      setIsEditingZone(false);
      fetchZones(); // Force refresh
    } catch (e) {
      console.error(e);
      addToast('Error al actualizar', 'error');
    }
  };

  const handleDeleteZone = async (zoneId: string) => {
    if (!window.confirm('¿Eliminar sala?')) return;
    try {
      const { error } = await supabase.from('venue_zones' as any).delete().eq('id', zoneId);
      if (error) throw error;
      addToast('Sala eliminada', 'info');
      fetchZones(); // Force refresh
    } catch (e) {
      console.error(e);
      addToast('Error al eliminar sala', 'error');
    }
  };

  // --- NODE ACTIONS ---
  const addNode = async (type: 'table' | 'bar' | 'qr') => {
    if (!profile?.store_id || !activeZoneId) {
      if (!activeZoneId) addToast('Selecciona una sala primero', 'error');
      return;
    }

    try {
      // MASK STRATEGY: Treat 'qr' as 'table' in DB to avoid enum errors, but distinguish via metadata
      const dbType = type === 'qr' ? 'table' : type;

      const defaultMetadata = type === 'table'
        ? { shape: 'square', w: 80, h: 80 }
        : type === 'bar'
          ? { w: 120, h: 60 }
          : { w: 50, h: 50, subtype: 'qr', shape: 'qr' }; // QR Metadata

      const payload = {
        store_id: profile.store_id,
        label: type === 'table' ? `M-${tables.length + 1}` : type === 'bar' ? `BAR ${bars.length + 1}` : `QR-${qrs.length + 1}`,
        type: dbType,
        position_x: 400,
        position_y: 300,
        status: 'free',
        zone_id: activeZoneId,
        metadata: defaultMetadata
      };

      const { error } = await supabase
        .from('venue_nodes' as any)
        .insert(payload);

      if (error) {
        console.error('Supabase Insert Error:', error);
        throw error;
      }

      addToast(`${type === 'table' ? 'Mesa' : type === 'bar' ? 'Barra' : 'Punto QR'} creada`, 'success');
      setShowAddMenu(false);
      fetchNodes(); // Force refresh just in case
    } catch (err: any) {
      console.error('Error creating node:', err);
      // Detailed toast if possible
      addToast(`Error: ${err.message || 'No se pudo crear'}`, 'error');
    }
  };

  const updatePosition = useCallback(async (id: string, position: Position, type: 'table' | 'bar' | 'qr') => {
    if (!profile?.store_id) return;
    // Optimistic
    if (type === 'table') setTables(prev => prev.map(t => t.id === id ? { ...t, position } : t));
    else if (type === 'bar') setBars(prev => prev.map(b => b.id === id ? { ...b, position } : b));
    else if (type === 'qr') setQrs(prev => prev.map(q => q.id === id ? { ...q, position } : q));

    try {
      await supabase
        .from('venue_nodes' as any)
        .update({ position_x: Math.round(position.x), position_y: Math.round(position.y) })
        .eq('id', id);
    } catch (err) {
      console.error('Position update error:', err);
    }
  }, [profile?.store_id]);

  const updateNodeProperty = useCallback(async (id: string, type: 'table' | 'bar' | 'qr', property: string, value: any) => {
    if (!profile?.store_id) return;
    if (property === 'qr_modal') {
      const target = type === 'table' ? tables.find(t => t.id === id) : bars.find(b => b.id === id);
      if (target) setSelectedQrTarget({ id: target.id, name: target.name });
      return;
    }
    // Optimistic update
    if (type === 'table') setTables(prev => prev.map(t => t.id === id ? { ...t, [property]: value } : t));
    else if (type === 'bar') setBars(prev => prev.map(b => b.id === id ? { ...b, [property]: value } : b));
    else if (type === 'qr') setQrs(prev => prev.map(q => q.id === id ? { ...q, [property]: value } : q));

    // Persist to database based on property type
    try {
      if (property === 'name') {
        await supabase.from('venue_nodes' as any).update({ label: value }).eq('id', id);
      } else if (property === 'rotation') {
        await supabase.from('venue_nodes' as any).update({ rotation: value }).eq('id', id);
      } else if (property === 'size') {
        // Size is stored in metadata JSONB
        const node = type === 'table' ? tables.find(t => t.id === id) : bars.find(b => b.id === id);
        const currentMeta = (node as any)?.metadata || {};
        await supabase.from('venue_nodes' as any).update({
          metadata: { ...currentMeta, w: value.w, h: value.h }
        }).eq('id', id);
      } else if (property === 'shape') {
        // Shape is stored in metadata
        const node = tables.find(t => t.id === id);
        const currentMeta = (node as any)?.metadata || {};
        await supabase.from('venue_nodes' as any).update({
          metadata: { ...currentMeta, shape: value }
        }).eq('id', id);
      } else if (property === 'barId') {
        // Assign QR to a bar - stored in metadata
        const qr = qrs.find(q => q.id === id);
        const currentMeta = (qr as any)?.metadata || {};
        await supabase.from('venue_nodes' as any).update({
          metadata: { ...currentMeta, barId: value }
        }).eq('id', id);
      }
    } catch (err) {
      console.error('Property update error:', err);
    }
  }, [profile?.store_id, tables, bars, qrs]);

  const deleteNode = async (id: string, type: 'table' | 'bar' | 'qr') => {
    if (!profile?.store_id) return;

    // Role check: Only owners and admins can delete nodes
    const canManageVenue = profile.role === 'store_owner' || profile.role === 'super_admin' || (profile as any).is_admin;
    if (!canManageVenue) {
      addToast('No tienes permiso', 'error', 'Solo el dueño puede eliminar elementos del mapa');
      return;
    }

    const nodeLabel = type === 'table' ? tables.find(t => t.id === id)?.name : type === 'bar' ? bars.find(b => b.id === id)?.name : qrs.find(q => q.id === id)?.name;
    if (!window.confirm(`¿Eliminar "${nodeLabel || 'este elemento'}"? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await supabase.from('venue_nodes' as any).delete().eq('id', id);
      if (error) throw error;
      addToast('Elemento eliminado', 'info');
      clearSelections();
    } catch (err) {
      console.error('Error deleting:', err);
      addToast('Error al eliminar', 'error');
    }
  };

  // Toggle QR active status
  const handleToggleQrStatus = async (id: string) => {
    if (!profile?.store_id) return;
    const qr = qrs.find(q => q.id === id);
    if (!qr) return;

    const newStatus = !qr.isActive;
    // Optimistic update
    setQrs(prev => prev.map(q => q.id === id ? { ...q, isActive: newStatus } : q));

    try {
      // Update status in venue_nodes (closed = inactive, free = active)
      await supabase.from('venue_nodes' as any).update({
        status: newStatus ? 'free' : 'closed'
      }).eq('id', id);
      addToast(newStatus ? 'Punto QR activado' : 'Punto QR desactivado', 'success');
    } catch (err) {
      console.error('Error toggling QR status:', err);
      // Revert optimistic update
      setQrs(prev => prev.map(q => q.id === id ? { ...q, isActive: !newStatus } : q));
      addToast('Error al cambiar estado', 'error');
    }
  };

  // Status updates are now mostly driven by Orders, but "Clean" or "Closed" might be explicit
  // For "Occupied", we rely on open_table RPC in TableDetail (to be implemented)
  // For now, this generic updater can stick around for manual overrides if needed, but safe creation should be preferred.
  const handleUpdateTableStatus = useCallback(async (id: string, status: TableStatus) => {
    // This legacy function might need to be smarter. 
    // If changing to OCCUPIED, should normally create an order. 
    // For now, we update node status directly, but Sync Trigger might override it if no order exists?
    // Actually trigger syncs FROM order TO node. Manual node update is allowed.
    try {
      await supabase.from('venue_nodes' as any).update({ status }).eq('id', id);
    } catch (e) { console.error(e); }
  }, []);

  const handleSelectTable = (id: string | null) => { setSelectedTableId(id); setSelectedBarId(null); setSelectedQrId(null); };
  const handleSelectBar = (id: string | null) => { setSelectedBarId(id); setSelectedTableId(null); setSelectedQrId(null); };
  const handleSelectQr = (id: string | null) => { setSelectedQrId(id); setSelectedTableId(null); setSelectedBarId(null); };
  const clearSelections = () => { setSelectedTableId(null); setSelectedBarId(null); setSelectedQrId(null); setSelectedQrTarget(null); };

  const selectedTable = useMemo(() => tables.find(t => t.id === selectedTableId), [tables, selectedTableId]);
  const selectedBar = useMemo(() => bars.find(b => b.id === selectedBarId), [bars, selectedBarId]);
  const selectedQr = useMemo(() => qrs.find(q => q.id === selectedQrId), [qrs, selectedQrId]);

  return (
    <div className="flex flex-col h-full bg-black text-white overflow-hidden relative font-sans selection:bg-[#36e27b] selection:text-black">
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
          <div className="flex-1 relative bg-[#0a0a0a] overflow-hidden cursor-crosshair group/map">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
              style={{
                backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
                backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                transform: `scale(${zoom})`,
                transformOrigin: 'top left'
              }}
            ></div>

            {mode === AppMode.DISPATCH ? (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-4 opacity-30">
                  <ClipboardList size={64} className="text-amber-400" />
                  <h2 className="text-2xl font-black text-amber-400 tracking-widest uppercase">Vista de Despacho</h2>
                  <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Próximamente: Kanban de Pedidos</p>
                </div>
              </div>
            ) : (
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
                onUpdateProperty={updateNodeProperty}
                onDeleteNode={deleteNode}
                zoom={zoom}
                setZoom={setZoom}
                onBackgroundClick={clearSelections}
                notifications={notifications}
                onDismissNotification={async (notificationId: string) => {
                  await supabase.from('venue_notifications' as any)
                    .update({ is_read: true, attended_at: new Date().toISOString(), attended_by: profile?.id })
                    .eq('id', notificationId);
                  fetchNotifications();
                }}
              />
            )}

            {/* OVERLAYS (Mode, Zoom) - Kept same structure */}
            <div className="absolute bottom-6 left-6 pointer-events-none z-10 transition-all duration-500 ease-out transform translate-y-0 opacity-100">
              <div className={`px-4 py-2 rounded-full border backdrop-blur-md flex items-center gap-3 shadow-2xl
                     ${mode === AppMode.VIEW
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : mode === AppMode.DISPATCH
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : 'bg-white/5 border-white/10 text-white'
                }`}>
                <div className={`w-2 h-2 rounded-full animate-pulse 
                  ${mode === AppMode.VIEW ? 'bg-emerald-400' : mode === AppMode.DISPATCH ? 'bg-amber-400' : 'bg-white'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {mode === AppMode.VIEW ? 'Modo Operativo' : mode === AppMode.DISPATCH ? 'Modo Despacho' : 'Modo Edición'}
                </span>
              </div>
            </div>

            {/* MANAGEMENT DOCK (EDIT MODE) */}
            {mode === AppMode.EDIT && (
              <div className="absolute bottom-8 right-1/2 translates-x-1/2 md:translate-x-0 md:right-8 flex items-center gap-3 z-50">

                {/* GESTIÓN INDICATOR */}
                <div className="bg-[#111] border border-zinc-800 rounded-full h-12 px-6 flex items-center gap-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-bottom-4">
                  <div className="w-2 h-2 rounded-full bg-[#36e27b] animate-pulse shadow-[0_0_10px_#36e27b]"></div>
                  <span className="text-xs font-black text-[#36e27b] uppercase tracking-widest">Gestión</span>
                </div>

                {/* CONTROLS PILL */}
                <div className="bg-[#111] border border-zinc-800 rounded-full h-12 p-1.5 flex items-center gap-1 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-bottom-4 delay-75">
                  <button
                    onClick={() => setZoom(z => Math.max(z - 0.1, 0.5))}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors active:scale-95"
                  >
                    <ZoomOut size={16} />
                  </button>

                  <button
                    onClick={() => setZoom(z => Math.min(z + 0.1, 2))}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors active:scale-95"
                  >
                    <ZoomIn size={16} />
                  </button>

                  <div className="w-px h-4 bg-zinc-800 mx-1"></div>

                  <button
                    onClick={() => setShowAddMenu(true)}
                    className="h-9 px-4 rounded-full bg-[#36e27b] text-black hover:bg-[#2ecc71] transition-all flex items-center justify-center shadow-[0_0_15px_-3px_rgba(54,226,123,0.4)] hover:shadow-[0_0_20px_-3px_rgba(54,226,123,0.6)] active:scale-95"
                  >
                    <Plus size={18} strokeWidth={3} />
                  </button>
                </div>
              </div>
            )}

            {/* STANDARD ZOOM (VIEW/DISPATCH MODE) */}
            {mode !== AppMode.EDIT && (
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
            )}
          </div>



          <div className="w-[380px] border-l border-zinc-800 bg-[#0a0a0a] flex flex-col relative z-20 shadow-[-10px_0_30px_-10px_rgba(0,0,0,0.5)] transition-all duration-300">
            {(!selectedTable && !selectedBar && !selectedQr) && (
              mode === AppMode.VIEW ? (
                <LiveActivityPanel
                  storeId={profile?.store_id || ''}
                  zones={zones.map(z => ({ id: z.id, name: z.name }))}
                  activeZoneId={activeZoneId}
                  onSelectTable={(tableNumber) => {
                    // Find table by name and select it
                    const targetTable = tables.find(t => t.name === tableNumber);
                    if (targetTable) {
                      setSelectedTableId(targetTable.id);
                      setSelectedBarId(null);
                      setSelectedQrId(null);
                    }
                  }}
                />
              ) : (
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
              )
            )}
          </div>
        </div>
      </Layout >

      {/* DETAIL PANELS - Rendered outside Layout to overlap everything (z-index fix) */}
      {
        selectedTable && (
          <TableDetail
            table={selectedTable}
            onClose={clearSelections}
            onUpdateStatus={handleUpdateTableStatus}
            onUpdateProperty={(prop, val) => updateNodeProperty(selectedTable.id, 'table', prop, val)}
            mode={mode}
          />
        )
      }

      {
        selectedBar && (
          <BarDetail
            bar={selectedBar}
            allQrs={qrs}
            onClose={clearSelections}
            onUpdateProperty={(prop, val) => updateNodeProperty(selectedBar.id, 'bar', prop, val)}
            mode={mode}
            onToggleQrAssignment={(qrId) => {
              const currentIds = selectedBar.qrIds || [];
              const newIds = currentIds.includes(qrId)
                ? currentIds.filter(id => id !== qrId)
                : [...currentIds, qrId];
              updateNodeProperty(selectedBar.id, 'bar', 'qrIds', newIds);
            }}
            onUpdateStock={() => console.log('Update Stock')}
            onTransferOpen={(barId) => {
              const bar = bars.find(b => b.id === barId);
              if (bar?.locationId) {
                setTransferSourceLocationId(bar.locationId);
                setIsTransferModalOpen(true);
              } else {
                addToast('Barra sin ubicación de inventario vinculada', 'error');
              }
            }}
            onToggleQr={(qrId) => console.log('Toggle QR', qrId)}
            onClosureOpen={() => console.log('Closure Open')}
          />
        )
      }

      {/* QUICK TRANSFER MODAL */}
      <TransferStockModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
        onSuccess={() => {
          setIsTransferModalOpen(false);
          // Optional: refresh logic if needed
        }}
        preselectedFromLocation={transferSourceLocationId}
      />

      {
        selectedQr && (
          <QRDetail
            qr={selectedQr}
            bars={bars}
            onClose={clearSelections}
            mode={mode}
            storeSlug={storeSlug}
            storeId={profile?.store_id}
            onToggleStatus={handleToggleQrStatus}
            onUpdateProperty={(prop, val) => updateNodeProperty(selectedQr.id, 'qr', prop, val)}
            onReassign={(qrId, barId) => updateNodeProperty(qrId, 'qr', 'barId', barId)}
            onDelete={() => deleteNode(selectedQr.id, 'qr')}
          />
        )
      }

      {
        showAddMenu && (
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
        )
      }

      {
        selectedQrTarget && (
          <QRGenerator
            targetId={selectedQrTarget.id}
            targetName={selectedQrTarget.name}
            onClose={() => setSelectedQrTarget(null)}
          />
        )
      }
    </div >
  );
};

export default App;
