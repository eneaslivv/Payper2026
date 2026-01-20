import React, { useState, useEffect } from 'react';
import { Table, OrderStatus, TableStatus, AppMode } from '../types';
import { ORDER_STATUS_COLORS, STATUS_COLORS } from '../constants';
import { X, Plus, MoveHorizontal, CreditCard, CheckCircle2, Clock, BarChart3, Receipt, History as HistoryIcon, ArrowLeft, Banknote, QrCode, Check, AlertCircle, Loader2, Users, Minus, User } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getAppUrl } from '../../../lib/urlUtils';
import { useAuth } from '../../../contexts/AuthContext';
import QRCode from 'react-qr-code';
import { useToast } from '../../../components/ToastSystem';

interface TableDetailProps {
  table: Table;
  mode: AppMode;
  onClose: () => void;
  onUpdateStatus: (id: string, status: TableStatus) => void;
  onUpdateProperty: (prop: string, val: any) => void;
}

const TableDetail: React.FC<TableDetailProps> = ({ table, mode, onClose, onUpdateStatus, onUpdateProperty }) => {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'analytics'>('active');
  const [view, setView] = useState<'details' | 'checkout' | 'closing' | 'qr' | 'addOrder' | 'reservation'>('details');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'qr'>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [qrHash, setQrHash] = useState<string | null>(null);
  const [qrStats, setQrStats] = useState<{ scan_count: number; last_scanned_at: string | null; is_active: boolean } | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [pax, setPax] = useState(2); // Default 2 people
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [reservationAmount, setReservationAmount] = useState<string>('');
  const [inviteEnabled, setInviteEnabled] = useState(true);
  const [customerSearch, setCustomerSearch] = useState('');
  const [foundCustomers, setFoundCustomers] = useState<any[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Dispatch Stations for dropdown
  const [dispatchStations, setDispatchStations] = useState<{ id: string; name: string }[]>([]);
  // Storage Locations for inventory tracking dropdown
  const [storageLocations, setStorageLocations] = useState<{ id: string; name: string; location_type: string }[]>([]);

  // Fetch dispatch stations on mount
  useEffect(() => {
    if (!profile?.store_id) return;
    supabase
      .from('dispatch_stations' as any)
      .select('id, name')
      .eq('store_id', profile.store_id)
      .eq('is_visible', true)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (data) setDispatchStations(data);
      });
  }, [profile?.store_id]);

  // Fetch storage locations for inventory tracking
  useEffect(() => {
    if (!profile?.store_id) return;
    supabase
      .from('storage_locations')
      .select('id, name, location_type')
      .eq('store_id', profile.store_id)
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) setStorageLocations(data as any);
      });
  }, [profile?.store_id]);

  // Handler to update node's dispatch station
  const handleUpdateNodeStation = async (stationName: string) => {
    const { error } = await supabase
      .from('venue_nodes' as any)
      .update({ dispatch_station: stationName || null })
      .eq('id', table.id);

    if (!error) {
      addToast('Estación actualizada', 'success');
      onUpdateProperty('dispatch_station', stationName || null);
    } else {
      addToast('Error al actualizar estación', 'error');
    }
  };

  // Handler to update node's location_id (for inventory tracking)
  const handleUpdateNodeLocation = async (locationId: string | null) => {
    const { error } = await supabase
      .from('venue_nodes' as any)
      .update({ location_id: locationId })
      .eq('id', table.id);

    if (!error) {
      addToast('Ubicación de inventario actualizada', 'success');
      onUpdateProperty('locationId', locationId);
    } else {
      addToast('Error al actualizar ubicación', 'error');
    }
  };

  // Fetch customers for syncing
  useEffect(() => {
    if (customerSearch.length < 2) {
      setFoundCustomers([]);
      setShowCustomerDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles' as any)
        .select('id, full_name, avatar_url')
        .or(`full_name.ilike.%${customerSearch}%`)
        .limit(5);

      if (data) {
        setFoundCustomers(data);
        setShowCustomerDropdown(true);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [customerSearch]);

  // Real Data State
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);

  // Multi-Order State
  const [activeOrdersList, setActiveOrdersList] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(table.activeOrderId || null);

  // Fetch all active orders for this table
  const fetchActiveOrders = async () => {
    if (!profile?.store_id || !table.id) return;
    try {
      const { data } = await supabase
        .from('orders' as any)
        .select('id, order_number, total_amount, status, created_at')
        .eq('store_id', profile.store_id)
        .eq('node_id', table.id)
        .in('status', ['draft', 'pending', 'preparing', 'ready', 'served', 'delivered', 'bill_requested', 'Pendiente', 'En Preparación', 'Listo', 'Entregado'])
        .order('created_at', { ascending: false });

      if (data) {
        setActiveOrdersList(data);
        // If selectedOrderId is not in the list (or null), select the newest one
        if (!selectedOrderId || !data.find(o => o.id === selectedOrderId)) {
          if (data.length > 0) setSelectedOrderId(data[0].id);
          else setSelectedOrderId(null);
        }
      }
    } catch (e) {
      console.error('Error fetching active orders:', e);
    }
  };

  useEffect(() => {
    fetchActiveOrders();
    // Subscribe to new orders for this table
    const channel = supabase.channel(`table-orders-${table.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `node_id=eq.${table.id}` },
        () => fetchActiveOrders()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [table.id]);

  // Add Order State
  const [products, setProducts] = useState<any[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [addingItemId, setAddingItemId] = useState<string | null>(null);

  // History State
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Fetch Items when selectedOrderId changes
  useEffect(() => {
    if (!selectedOrderId) {
      setOrderItems([]);
      return;
    }

    const fetchItems = async () => {
      setIsLoadingItems(true);
      const { data } = await supabase
        .from('order_items' as any)
        .select('*')
        .eq('order_id', selectedOrderId);
      if (data) setOrderItems(data);
      setIsLoadingItems(false);
    };

    fetchItems();

    // Subscribe to item updates
    const channel = supabase.channel(`order-${selectedOrderId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items', filter: `order_id=eq.${selectedOrderId}` },
        () => fetchItems()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };

  }, [selectedOrderId]);

  // Fetch products when addOrder view opens
  const fetchProducts = async () => {
    if (!profile?.store_id) return;
    setLoadingProducts(true);
    try {
      const { data, error } = await supabase
        .from('products' as any)
        .select('id, name, base_price, category')
        .eq('store_id', profile.store_id)
        .eq('active', true)
        .eq('is_available', true)
        .order('category')
        .order('name')
        .limit(200);

      if (error) throw error;
      if (data) setProducts(data);
    } catch (e) {
      console.error('Failed to fetch products:', e);
    } finally {
      setLoadingProducts(false);
    }
  };

  // Get unique categories for filter
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

  // Add item to active order
  // Add item to active order
  const handleAddItem = async (product: any) => {
    if (!selectedOrderId || !profile?.store_id) {
      addToast('No hay orden seleccionada', 'error');
      return;
    }

    setAddingItemId(product.id);
    try {
      const { error } = await supabase.from('order_items' as any).insert({
        order_id: selectedOrderId,
        product_id: product.id,
        price_at_time: product.base_price || product.price || 0,
        quantity: 1,
        status: 'pending'
      });

      if (error) throw error;
      addToast(`${product.name} agregado`, 'success');
    } catch (e: any) {
      console.error(e);
      addToast('Error al agregar', 'error', e.message);
    } finally {
      setAddingItemId(null);
    }
  };

  // Filtered products for search and category
  const filteredProducts = products.filter(p => {
    const matchesSearch = searchQuery === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Fetch order history for this table
  const fetchHistoryOrders = async () => {
    if (!profile?.store_id || !table.id) return;
    setLoadingHistory(true);
    try {
      const { data } = await supabase
        .from('orders' as any)
        .select('id, total, status, payment_method, created_at, paid_at')
        .eq('store_id', profile.store_id)
        .eq('node_id', table.id)
        .in('status', ['paid', 'cancelled', 'completed'])
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) setHistoryOrders(data);
    } catch (e) {
      console.error('Failed to fetch history:', e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Fetch history when tab changes to history
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistoryOrders();
    }
  }, [activeTab]);

  const handleOpenTable = async () => {
    if (!profile?.store_id) return;
    try {
      const { data, error } = await supabase.rpc('open_table' as any, {
        p_node_id: table.id,
        p_store_id: profile.store_id,
        p_user_id: profile.id
      });

      if (error) throw error;
      // Check exact RPC return structure (assuming standard {success: true/false})
      // If the RPC returns void loop or raw row, handle accordingly.
      // My migration defined it as RETURNS jsonb.
      // Cast RPC result
      const result = data as any as { success: boolean; message: string };
      if (result && result.success === false) {
        addToast(result.message || 'Error', 'error');
      } else {
        addToast('Mesa Abierta', 'success');
        // App.tsx subscription will catch the update and refresh table.status/activeOrderId
      }
    } catch (e: any) {
      console.error(e);
      addToast('Error al abrir mesa', 'error', e.message);
    }
  };

  const activeOrders = orderItems.filter(o => !['served', 'delivered', 'Entregado', 'cancelled', 'paid'].includes(o.status));
  const deliveredOrders = orderItems.filter(o => ['served', 'delivered', 'Entregado', 'delivered'].includes(o.status));

  const subtotal = table.totalAmount; // This might be aggregate from view, but we are paying specific order.
  // Actually, we should calculate subtotal from orderItems of SELECTED order
  const currentOrderTotal = orderItems.reduce((sum, item) => sum + ((item.quantity * item.price_at_time) || 0), 0);
  const currentServiceCharge = currentOrderTotal * 0.1;
  const currentTotal = currentOrderTotal + currentServiceCharge;

  const handleProcessPayment = async () => {
    if (!selectedOrderId) return;
    setIsProcessing(true);

    try {
      // Update Order to PAID
      const { error } = await supabase
        .from('orders' as any)
        .update({
          status: 'paid',
          payment_method: paymentMethod,
          paid_at: new Date().toISOString()
        })
        .eq('id', selectedOrderId);

      if (error) throw error;

      // ALSO UPDATE NODE TO FREE (Fixes "Timer continues" issue)
      await onUpdateStatus(table.id, 'free');

      addToast('Pago Procesado', 'success');
      onClose();
    } catch (e) {
      console.error(e);
      addToast('Error al cobrar', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseTable = async () => {
    // Role check: Only managers/owners can force close
    const canForceClose = profile?.role === 'store_owner' || profile?.role === 'super_admin' || (profile as any).is_admin;
    if (!canForceClose) {
      addToast('No tienes permiso', 'error', 'Solo administradores pueden forzar el cierre de una mesa');
      return;
    }

    // Force close (Cancel ALL active orders)
    try {
      const { error } = await supabase
        .from('orders' as any)
        .update({ status: 'cancelled' })
        .eq('node_id', table.id)
        .in('status', ['draft', 'pending', 'preparing', 'ready', 'served', 'delivered', 'bill_requested', 'Pendiente', 'En Preparación', 'Listo', 'Entregado']);

      if (error) throw error;

      // ALSO UPDATE NODE TO FREE
      await onUpdateStatus(table.id, 'free');

      addToast('Mesa Cerrada', 'info');
      onClose();
    } catch (e) {
      console.error(e);
      addToast('Error al cerrar', 'error');
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
      // First try to fetch from new qr_codes table
      const { data: existingQR, error: fetchError } = await supabase
        .from('qr_codes' as any)
        .select('id, code_hash, scan_count, last_scanned_at, is_active')
        .eq('store_id', profile.store_id)
        .eq('table_id', table.id)
        .maybeSingle();

      if (existingQR) {
        // QR exists - use it and show stats
        setQrHash((existingQR as any).code_hash);
        setQrStats({
          scan_count: (existingQR as any).scan_count || 0,
          last_scanned_at: (existingQR as any).last_scanned_at,
          is_active: (existingQR as any).is_active
        });
      } else {
        // Create new QR in qr_codes table
        const newHash = btoa(`${profile.store_id}-${table.id}-${Date.now()}`)
          .replace(/[^a-zA-Z0-9]/g, '')
          .substring(0, 12);

        const { data: newQR, error: insertError } = await supabase
          .from('qr_codes' as any)
          .insert({
            store_id: profile.store_id,
            qr_type: 'table',
            table_id: table.id,
            code_hash: newHash,
            label: table.name,
            is_active: true
          })
          .select('code_hash')
          .single();

        if (insertError) throw insertError;
        setQrHash((newQR as any).code_hash);
        setQrStats({ scan_count: 0, last_scanned_at: null, is_active: true });
      }
    } catch (e: any) {
      console.error('QR Error:', e);
      addToast('Error QR', 'error', e.message);
      setView('details');
    } finally {
      setLoadingQr(false);
    }
  };


  const handleUpdateOrderItem = async (itemId: string, newStatus: string) => {
    if (!profile?.store_id) return;
    try {
      const { error } = await supabase
        .from('order_items' as any)
        .update({ status: newStatus })
        .eq('id', itemId);

      if (error) throw error;
      // Subscription will update list
      addToast('Item actualizado', 'success');
    } catch (e) {
      console.error(e);
      addToast('Error al actualizar item', 'error');
    }
  };

  const handleReserveTable = async () => {
    if (!profile?.store_id) return;
    setIsProcessing(true);
    try {
      const { error } = await supabase
        .from('venue_nodes' as any)
        .update({
          status: 'reserved',
          label: customerName ? `${table.name} (${customerName})` : table.name,
          metadata: {
            ...(table as any).metadata,
            reserved_for: customerName,
            reserved_email: customerEmail,
            reserved_customer_id: selectedCustomerId,
            reservation_amount: reservationAmount ? parseFloat(reservationAmount) : 0,
            pax: pax
          }
        })
        .eq('id', table.id);

      if (error) throw error;
      addToast('Mesa Reservada', 'success');
      setView('details');
    } catch (e) {
      console.error(e);
      addToast('Error al reservar', 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancelReservation = async () => {
    if (!profile?.store_id) return;
    try {
      const { error } = await supabase
        .from('venue_nodes' as any)
        .update({ status: 'free' })
        .eq('id', table.id);

      if (error) throw error;
      addToast('Reserva Cancelada', 'info');
    } catch (e) {
      console.error(e);
      addToast('Error al cancelar reserva', 'error');
    }
  };

  const isEditMode = mode === AppMode.EDIT;
  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  // AddOrder view - product selection
  if (view === 'addOrder') {
    return (
      <div
        onPointerDown={handlePointerDown}
        className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-[#050505] border-l border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,1)] z-[210] flex flex-col animate-in slide-in-from-right duration-500"
      >
        <div className="p-6 border-b border-zinc-900 bg-[#080808] flex items-center justify-between">
          <button onClick={() => setView('details')} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-all">
            <ArrowLeft size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">Volver</span>
          </button>
          <h3 className="text-sm font-black text-white uppercase tracking-widest italic flex items-center gap-2">
            <Plus size={16} className="text-[#36e27b]" />
            Agregar a {table.name}
          </h3>
          <div className="w-8"></div>
        </div>

        <div className="p-4 border-b border-zinc-900 space-y-4">
          <input
            type="text"
            placeholder="Buscar producto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:border-[#36e27b]/50 outline-none transition-all"
            autoFocus
          />

          {/* Category Tabs */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${!selectedCategory ? 'bg-[#36e27b] text-black border-[#36e27b]' : 'bg-zinc-950 text-zinc-500 border-zinc-900 hover:border-zinc-700'}`}
            >
              Todos
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all border ${selectedCategory === cat ? 'bg-[#36e27b] text-black border-[#36e27b]' : 'bg-zinc-950 text-zinc-500 border-zinc-900 hover:border-zinc-700'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {loadingProducts ? (
            <div className="py-12 text-center">
              <Loader2 className="animate-spin mx-auto text-[#36e27b] mb-4" size={32} />
              <p className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Cargando menú...</p>
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="space-y-2">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleAddItem(product)}
                  disabled={addingItemId === product.id}
                  className="w-full bg-[#080808] border border-zinc-900 hover:border-[#36e27b]/30 p-4 rounded-2xl flex items-center justify-between group transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center text-zinc-500 group-hover:text-[#36e27b] transition-colors">
                      <Receipt size={16} />
                    </div>
                    <div className="text-left">
                      <p className="text-white text-sm font-bold">{product.name}</p>
                      <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">{product.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[#36e27b] font-black text-sm tabular-nums">${product.price?.toLocaleString()}</span>
                    {addingItemId === product.id ? (
                      <Loader2 size={16} className="text-[#36e27b] animate-spin" />
                    ) : (
                      <Plus size={16} className="text-zinc-600 group-hover:text-[#36e27b] transition-colors" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Receipt size={32} className="mx-auto text-zinc-700 mb-4" />
              <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">No se encontraron productos</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (view === 'checkout') {
    return (
      <div
        onPointerDown={handlePointerDown}
        className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-[#050505] border-l border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,1)] z-[210] flex flex-col animate-in slide-in-from-right duration-500"
      >
        <div className="p-8 border-b border-zinc-900 bg-[#080808] flex items-center justify-between">
          <button onClick={() => setView('details')} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-all">
            <ArrowLeft size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">Volver</span>
          </button>
          <h3 className="text-sm font-black text-white uppercase tracking-widest italic">Checkout {table.name}</h3>
          <div className="w-8"></div>
        </div>

        <div className="flex-1 p-8 space-y-10 overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
            <div className="flex justify-between items-end border-b border-zinc-900/50 pb-4">
              <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Subtotal Consumo</span>
              <span className="text-xl font-black text-white italic tabular-nums">${currentOrderTotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-end border-b border-zinc-900/50 pb-4">
              <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Servicio (10%)</span>
              <span className="text-xl font-black text-white italic tabular-nums">${currentServiceCharge.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-[10px] font-black text-[#36e27b] uppercase tracking-[0.3em]">Total a Cobrar</span>
              <span className="text-4xl font-black text-[#36e27b] tracking-tighter tabular-nums italic">${currentTotal.toLocaleString()}</span>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-zinc-600 uppercase tracking-widest italic">Método de Pago</h4>
            <div className="grid grid-cols-3 gap-3">
              <PaymentOption
                active={paymentMethod === 'cash'}
                onClick={() => setPaymentMethod('cash')}
                icon={<Banknote size={20} />}
                label="Efectivo"
              />
              <PaymentOption
                active={paymentMethod === 'card'}
                onClick={() => setPaymentMethod('card')}
                icon={<CreditCard size={20} />}
                label="Tarjeta"
              />
              <PaymentOption
                active={paymentMethod === 'qr'}
                onClick={() => setPaymentMethod('qr')}
                icon={<QrCode size={20} />}
                label="Payper QR"
              />
            </div>
          </div>

          <div className="bg-zinc-900/20 border border-zinc-800 p-6 rounded-[32px] space-y-4">
            <div className="flex items-center gap-3 text-[#36e27b]">
              <CheckCircle2 size={16} />
              <span className="text-[9px] font-black uppercase tracking-widest">Listo para procesar</span>
            </div>
            <p className="text-[10px] text-zinc-500 font-medium leading-relaxed">Al confirmar, la mesa se marcará como pagada y se liberará automáticamente en el mapa general.</p>
          </div>
        </div>

        <div className="p-8 bg-black border-t border-zinc-900">
          <button
            disabled={isProcessing}
            onClick={handleProcessPayment}
            className={`w-full py-5 rounded-[24px] text-[12px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-2xl ${isProcessing ? 'bg-zinc-800 text-zinc-600' : 'bg-[#36e27b] text-black hover:shadow-[#36e27b]/20 hover:scale-[1.02]'}`}
          >
            {isProcessing ? (
              <>Procesando...</>
            ) : (
              <>Finalizar Cobro <Check size={18} strokeWidth={3} /></>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (view === 'closing') {
    return (
      <div
        onPointerDown={handlePointerDown}
        className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-[#050505] border-l border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,1)] z-[210] flex flex-col animate-in zoom-in-95 duration-300"
      >
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-8">
          <div className="w-24 h-24 rounded-full bg-rose-500/10 border-4 border-rose-500/20 flex items-center justify-center text-rose-500 animate-pulse">
            <AlertCircle size={48} />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">¿Cerrar Mesa?</h3>
            <p className="text-zinc-500 text-xs font-medium max-w-[240px]">Se cancelará el pedido actual y se liberará la mesa.</p>
          </div>
          <div className="flex flex-col w-full gap-3">
            <button
              onClick={handleCloseTable}
              className="w-full py-5 bg-rose-500 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-[24px] hover:bg-rose-600 transition-all shadow-xl shadow-rose-500/10"
            >
              Confirmar Cierre
            </button>
            <button
              onClick={() => setView('details')}
              className="w-full py-5 bg-zinc-900 text-zinc-400 text-[10px] font-black uppercase tracking-[0.3em] rounded-[24px] border border-zinc-800 hover:text-white transition-all"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'qr') {
    // Download helpers
    const downloadPNG = () => {
      const svg = document.querySelector('#table-qr-svg svg');
      if (!svg) return;

      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const data = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([data], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 400, 400);
        ctx.drawImage(img, 0, 0, 400, 400);
        const link = document.createElement('a');
        link.download = `QR-${table.name}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };

    const downloadSVG = () => {
      const svg = document.querySelector('#table-qr-svg svg');
      if (!svg) return;
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svg);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const link = document.createElement('a');
      link.download = `QR-${table.name}.svg`;
      link.href = URL.createObjectURL(blob);
      link.click();
    };

    const downloadPDF = async () => {
      const { jsPDF } = await import('jspdf');
      const svg = document.querySelector('#table-qr-svg svg');
      if (!svg) return;

      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const data = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([data], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, 400, 400);
        ctx.drawImage(img, 0, 0, 400, 400);

        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const qrSize = 80;
        const x = (pdfWidth - qrSize) / 2;

        pdf.setFontSize(24);
        pdf.setFont('helvetica', 'bold');
        pdf.text(table.name, pdfWidth / 2, 30, { align: 'center' });
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        pdf.text('Escanea para ordenar', pdfWidth / 2, 40, { align: 'center' });
        pdf.addImage(imgData, 'PNG', x, 50, qrSize, qrSize);
        pdf.setFontSize(10);
        pdf.text(`${getAppUrl()}/#/qr/${qrHash}`, pdfWidth / 2, 140, { align: 'center' });
        pdf.save(`QR-${table.name}.pdf`);
        URL.revokeObjectURL(url);
      };
      img.src = url;
    };

    return (
      <div
        onPointerDown={(e) => e.stopPropagation()}
        className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-[#050505] border-l border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,1)] z-[210] flex flex-col animate-in zoom-in-95 duration-300"
      >
        <div className="p-6 border-b border-zinc-900 bg-[#080808] flex items-center justify-between">
          <button onClick={() => setView('details')} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-all">
            <ArrowLeft size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">Volver</span>
          </button>
          <h3 className="text-sm font-black text-white uppercase tracking-widest italic flex items-center gap-2">
            <QrCode size={16} className="text-[#36e27b]" />
            QR {table.name}
          </h3>
          <div className="w-8"></div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6 overflow-y-auto">
          {loadingQr ? (
            <div className="flex flex-col items-center gap-4 animate-pulse">
              <Loader2 size={48} className="text-[#36e27b] animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#36e27b]">Generando Enlace...</p>
            </div>
          ) : (
            <>
              <div className="bg-white p-4 rounded-2xl border-4 border-[#36e27b] shadow-[0_0_50px_rgba(54,226,123,0.3)]" id="table-qr-svg">
                {qrHash && (
                  <QRCode
                    value={`${getAppUrl()}/#/qr/${qrHash}`}
                    size={180}
                    viewBox={`0 0 256 256`}
                  />
                )}
              </div>

              {/* QR STATS */}
              {qrStats && (
                <div className="grid grid-cols-3 gap-3 w-full max-w-[320px]">
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 text-center">
                    <p className="text-xl font-black text-white tabular-nums">{qrStats.scan_count}</p>
                    <p className="text-[7px] font-black uppercase tracking-widest text-zinc-500">Escaneos</p>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 text-center">
                    <p className="text-xs font-bold text-white">
                      {qrStats.last_scanned_at
                        ? new Date(qrStats.last_scanned_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
                        : 'Nunca'}
                    </p>
                    <p className="text-[7px] font-black uppercase tracking-widest text-zinc-500">Último</p>
                  </div>
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 text-center">
                    <div className={`w-3 h-3 rounded-full mx-auto mb-1 ${qrStats.is_active ? 'bg-[#36e27b]' : 'bg-rose-500'}`} />
                    <p className="text-[7px] font-black uppercase tracking-widest text-zinc-500">
                      {qrStats.is_active ? 'Activo' : 'Inactivo'}
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em]">Enlace Permanente</p>
                <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-[9px] font-mono text-zinc-400 break-all max-w-[280px]">
                  {getAppUrl()}/#/qr/{qrHash}
                </div>
              </div>

              {/* DOWNLOAD BUTTONS */}
              <div className="space-y-3 w-full max-w-[280px]">
                <p className="text-zinc-600 text-[8px] font-black uppercase tracking-widest">Descargar QR</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={downloadPNG} className="flex flex-col items-center justify-center gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white hover:border-[#36e27b]/40 transition-all active:scale-95">
                    <span className="text-[10px]">🖼️</span>
                    <span className="text-[7px] font-black uppercase tracking-widest">PNG</span>
                  </button>
                  <button onClick={downloadSVG} className="flex flex-col items-center justify-center gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white hover:border-[#36e27b]/40 transition-all active:scale-95">
                    <span className="text-[10px]">📐</span>
                    <span className="text-[7px] font-black uppercase tracking-widest">SVG</span>
                  </button>
                  <button onClick={downloadPDF} className="flex flex-col items-center justify-center gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white hover:border-[#36e27b]/40 transition-all active:scale-95">
                    <span className="text-[10px]">📄</span>
                    <span className="text-[7px] font-black uppercase tracking-widest">PDF</span>
                  </button>
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
    );
  }

  // Edit Mode Header Button
  const editButton = isEditMode && (
    <button
      onClick={handleGenerateQR}
      className="mt-2 w-full py-2 bg-zinc-900 border border-zinc-800 hover:border-[#36e27b]/50 text-zinc-400 hover:text-[#36e27b] rounded-xl flex items-center justify-center gap-2 transition-all group"
    >
      <QrCode size={14} />
      <span className="text-[8px] font-black uppercase tracking-widest">Ver QR</span>
    </button>
  );

  return (
    <div
      onPointerDown={handlePointerDown}
      className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-[#050505] border-l border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,1)] z-[210] flex flex-col animate-in slide-in-from-right duration-500"
    >
      <div className="p-6 border-b border-zinc-900 bg-[#080808] flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[table.status]} shadow-[0_0_15px_#36e27b]/30`}></div>
            <div className="flex-1">
              {isEditMode ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="text"
                    value={table.name}
                    onChange={(e) => onUpdateProperty('name', e.target.value)}
                    className="bg-black border border-zinc-800 rounded-lg px-2 py-1 text-xl font-black text-[#36e27b] uppercase focus:border-[#36e27b] outline-none w-full"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Estación:</span>
                    <select
                      value={(table as any).dispatch_station || ''}
                      onChange={(e) => onUpdateProperty('dispatch_station', e.target.value || null)}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-[10px] font-black text-white uppercase outline-none focus:border-[#36e27b] transition-all cursor-pointer"
                    >
                      <option value="">Sin asignar</option>
                      {dispatchStations.map(s => (
                        <option key={s.id} value={s.name}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Inventario:</span>
                    <select
                      value={table.locationId || ''}
                      onChange={(e) => handleUpdateNodeLocation(e.target.value || null)}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1.5 text-[10px] font-black text-white uppercase outline-none focus:border-amber-500 transition-all cursor-pointer"
                    >
                      <option value="">Sin asignar</option>
                      {storageLocations.map(loc => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name} {loc.location_type === 'bar' ? '🍺' : loc.location_type === 'storage' ? '📦' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editButton}
                </div>
              ) : (
                <>
                  <h3 className="text-2xl font-black tracking-tighter text-white italic leading-tight">{table.name}</h3>
                  <p className="text-[9px] text-zinc-600 font-black uppercase tracking-[0.2em] opacity-60">
                    Nodo {table.activeOrderId ? `ORD #${table.activeOrderId.slice(0, 4)}` : 'DISPONIBLE'}
                  </p>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-white bg-zinc-900/30 rounded-2xl transition-all border border-zinc-800">
            <X size={18} />
          </button>
        </div>

        {/* MULTIPLE ORDERS SELECTOR */}
        {activeOrdersList.length > 1 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {activeOrdersList.map(order => (
              <button
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all whitespace-nowrap flex-shrink-0 ${selectedOrderId === order.id ? 'bg-[#36e27b] text-black border-[#36e27b]' : 'bg-black text-zinc-500 border-zinc-900 hover:border-zinc-700'}`}
              >
                #{order.order_number || order.id.slice(0, 4)} • ${order.total_amount?.toLocaleString()}
              </button>
            ))}
          </div>
        )}

        <div className="flex bg-black p-1 rounded-2xl border border-zinc-900">
          {[
            { id: 'active', label: 'Items', icon: <Receipt size={14} /> },
            { id: 'history', label: 'Historial', icon: <HistoryIcon size={14} /> },
            { id: 'analytics', label: 'Datos', icon: <BarChart3 size={14} /> }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === tab.id ? 'bg-zinc-900 text-[#36e27b] shadow-lg border border-zinc-800' : 'text-zinc-600'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {activeTab === 'active' && (
          <div className="space-y-8">
            {!table.activeOrderId ? (
              <div className="flex flex-col h-full animate-in fade-in duration-500">
                {/* HERO ILLUSTRATION / STATE */}
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-6">
                  <div className="relative group cursor-pointer">
                    <div className="absolute inset-0 bg-[#36e27b]/20 rounded-full blur-xl group-hover:blur-2xl transition-all duration-500"></div>
                    <div className="relative w-24 h-24 rounded-full bg-[#0a0a0a] border border-zinc-800 flex items-center justify-center group-hover:border-[#36e27b]/50 transition-all duration-300 shadow-2xl">
                      <Users size={32} className="text-zinc-500 group-hover:text-[#36e27b] transition-colors" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white italic uppercase tracking-wider mb-2">Preparar Mesa</h3>
                    <p className="text-[10px] text-zinc-500 font-medium max-w-[200px] mx-auto leading-relaxed">
                      Configura la sesión antes de abrir.
                    </p>
                  </div>
                </div>

                {/* CONFIGURATION CARD */}
                <div className="bg-[#0a0a0a] border-t border-zinc-900 p-6 space-y-6 rounded-t-[40px] shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)]">

                  {/* PAX SELECTOR */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Comensales</span>
                      <span className="text-[9px] font-black text-[#36e27b] uppercase tracking-widest">{pax} Personas</span>
                    </div>
                    <div className="flex items-center gap-2 bg-[#111] p-1.5 rounded-2xl border border-zinc-800/50">
                      <button
                        onClick={() => setPax(Math.max(1, pax - 1))}
                        className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
                      >
                        <Minus size={18} />
                      </button>
                      <div className="flex-1 flex items-center justify-center">
                        <span className="text-2xl font-black text-white italic tabular-nums">{pax}</span>
                      </div>
                      <button
                        onClick={() => setPax(Math.min(20, pax + 1))}
                        className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 hover:text-white hover:bg-zinc-800 transition-all active:scale-95"
                      >
                        <Plus size={18} />
                      </button>
                    </div>
                  </div>

                  {/* DISPATCH STATION SELECTOR */}
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Estación de Despacho</span>
                      {table.dispatch_station && (
                        <span className="text-[9px] font-black text-[#36e27b] uppercase tracking-widest">{table.dispatch_station}</span>
                      )}
                    </div>
                    <select
                      value={table.dispatch_station || ''}
                      onChange={(e) => handleUpdateNodeStation(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-[#36e27b]/50 focus:outline-none transition-all"
                    >
                      <option value="">Sin asignar</option>
                      {dispatchStations.map(station => (
                        <option key={station.id} value={station.name}>{station.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* WAITER INFO */}
                  <div className="flex items-center gap-4 p-4 bg-[#111] rounded-2xl border border-zinc-800/50">
                    <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
                      <User size={16} className="text-zinc-400" />
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-zinc-600 uppercase tracking-widest">Atendido por</p>
                      <p className="text-sm font-bold text-zinc-200">Tú ({profile?.email?.split('@')[0] || 'Usuario'})</p>
                    </div>
                  </div>

                  {table.status === TableStatus.RESERVED ? (
                    <div className="flex flex-col gap-3">
                      <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-center space-y-1">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Mesa Reservada</p>
                        <p className="text-[9px] text-zinc-500 italic">Cliente esperando llegada</p>
                      </div>
                      <button
                        onClick={handleOpenTable}
                        className="w-full py-5 bg-[#36e27b] text-black text-[11px] font-black uppercase tracking-[0.2em] rounded-3xl shadow-[0_0_30px_rgba(54,226,123,0.3)] hover:shadow-[0_0_50px_rgba(54,226,123,0.5)] hover:scale-[1.02] active:scale-95 transition-all duration-300"
                      >
                        Confirmar Llegada
                      </button>
                      <button
                        onClick={handleCancelReservation}
                        className="w-full py-3 bg-zinc-900 text-zinc-500 text-[9px] font-black uppercase tracking-widest rounded-2xl border border-zinc-800 hover:text-white transition-all"
                      >
                        Cancelar Reserva
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <button
                        onClick={handleOpenTable}
                        className="w-full py-5 bg-[#36e27b] text-black text-[11px] font-black uppercase tracking-[0.2em] rounded-3xl shadow-[0_0_30px_rgba(54,226,123,0.3)] hover:shadow-[0_0_50px_rgba(54,226,123,0.5)] hover:scale-[1.02] active:scale-95 transition-all duration-300 flex items-center justify-center gap-2"
                      >
                        <span>Comenzar Servicio</span>
                        <ArrowLeft size={16} className="rotate-180" />
                      </button>
                      <button
                        onClick={handleReserveTable}
                        className="w-full py-3 bg-zinc-900 text-indigo-400 text-[9px] font-black uppercase tracking-widest rounded-2xl border border-zinc-800 hover:bg-indigo-500/10 transition-all"
                      >
                        Reservar Mesa
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <ActionButton icon={<Plus size={16} />} label="Pedido" onClick={() => { setView('addOrder'); fetchProducts(); }} />
                  <ActionButton
                    icon={<Users size={16} />}
                    label="Reservar"
                    onClick={() => setView('reservation')}
                  />
                  <ActionButton
                    icon={<CreditCard size={16} />}
                    label="Cobrar"
                    accent
                    onClick={() => setView('checkout')}
                  />
                  <ActionButton
                    icon={<CheckCircle2 size={16} />}
                    label="Cerrar"
                    danger
                    onClick={() => setView('closing')}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-end justify-between border-b border-zinc-900 pb-4">
                    <h4 className="text-[9px] font-black uppercase tracking-widest text-zinc-600 italic">Consumo Activo</h4>
                    <div className="text-right">
                      <p className="text-[8px] text-zinc-600 font-black uppercase tracking-widest">Balance</p>
                      <p className="text-2xl font-black text-[#36e27b] tracking-tighter tabular-nums">${table.totalAmount.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {isLoadingItems ? (
                      <div className="py-8 text-center"><Loader2 className="animate-spin mx-auto text-zinc-600" /></div>
                    ) : activeOrders.length > 0 ? (
                      activeOrders.map((order) => (
                        <div key={order.id} className="bg-[#080808] border border-zinc-900/50 p-4 rounded-2xl flex items-center justify-between group hover:border-[#36e27b]/20 transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center text-zinc-500 group-hover:text-[#36e27b] transition-colors">
                              <Receipt size={16} />
                            </div>
                            <div>
                              <p className="text-white text-xs font-bold uppercase tracking-tight">{order.product_name || 'Item'} <span className="text-zinc-600 ml-1">x{order.quantity}</span></p>
                              <span className={`text-[7px] px-2 py-0.5 border rounded-full font-black uppercase tracking-widest mt-1 inline-block ${ORDER_STATUS_COLORS[order.status as OrderStatus] || 'border-zinc-800 text-zinc-500'}`}>
                                {order.status}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleUpdateOrderItem(order.id, 'Entregado')}
                            className="w-8 h-8 flex items-center justify-center text-[#36e27b] hover:bg-[#36e27b]/10 rounded-lg transition-all border border-transparent hover:border-[#36e27b]/20"
                          >
                            <CheckCircle2 size={16} />
                          </button>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 bg-[#080808] border border-zinc-900 border-dashed rounded-3xl opacity-30">
                        <Clock size={24} className="mx-auto mb-3 text-zinc-600" />
                        <p className="font-black uppercase tracking-widest text-[8px]">Esperando Comandos</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <h4 className="text-[9px] font-black uppercase tracking-widest text-zinc-600 italic border-b border-zinc-900 pb-4">Historial de Cierres</h4>
            <div className="space-y-2">
              {loadingHistory ? (
                <div className="py-12 text-center">
                  <Loader2 className="animate-spin mx-auto text-zinc-600 mb-4" size={24} />
                  <p className="text-[8px] font-black uppercase tracking-widest text-zinc-600">Cargando historial...</p>
                </div>
              ) : historyOrders.length > 0 ? (
                historyOrders.map((order) => (
                  <div key={order.id} className="bg-[#080808] border border-zinc-900/50 p-4 rounded-2xl flex items-center justify-between group hover:border-zinc-700 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center text-zinc-500">
                        <Receipt size={16} />
                      </div>
                      <div>
                        <p className="text-white text-xs font-bold uppercase tracking-tight">
                          ${order.total?.toLocaleString() || '0'}
                          <span className="text-zinc-600 ml-2 text-[9px]">{order.payment_method || 'N/A'}</span>
                        </p>
                        <p className="text-[8px] text-zinc-600 font-medium">
                          {new Date(order.paid_at || order.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[7px] px-2 py-0.5 border rounded-full font-black uppercase tracking-widest ${order.status === 'paid' ? 'border-[#36e27b]/30 text-[#36e27b]' : order.status === 'cancelled' ? 'border-rose-500/30 text-rose-500' : 'border-zinc-700 text-zinc-500'}`}>
                      {order.status === 'paid' ? 'Pagado' : order.status === 'cancelled' ? 'Cancelado' : order.status}
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-zinc-700">
                  <HistoryIcon size={24} className="mx-auto mb-3 opacity-20" />
                  <p className="text-[8px] font-black uppercase tracking-widest">Sin cierres recientes</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Tickets Totales"
                value={historyOrders.length.toString()}
              />
              <MetricCard
                label="Venta Histórica"
                value={`$${historyOrders.reduce((sum, o) => sum + (o.total || 0), 0).toLocaleString()}`}
              />
            </div>

            <div className="p-6 bg-[#080808] border border-zinc-900 rounded-3xl space-y-6">
              <div className="flex justify-between items-center">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-zinc-600 italic">Ticket Promedio</h4>
                <p className="text-sm font-black text-[#36e27b] tabular-nums">
                  ${historyOrders.length > 0
                    ? Math.round(historyOrders.reduce((sum, o) => sum + (o.total || 0), 0) / historyOrders.length).toLocaleString()
                    : '0'
                  }
                </p>
              </div>
              <div className="w-full h-1 bg-black rounded-full overflow-hidden">
                <div className="h-full bg-[#36e27b]" style={{ width: '100%' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-black border-t border-zinc-900">
        <button className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl transition-all border border-zinc-800">
          Imprimir Factura Provisoria
        </button>
        {view === 'reservation' && (
          <div className="fixed inset-y-0 right-0 w-full md:w-[420px] bg-[#050505] border-l border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,1)] z-[210] flex flex-col animate-in slide-in-from-right duration-500">
            <div className="p-8 border-b border-zinc-900 flex items-center justify-between bg-[#080808]">
              <button onClick={() => setView('details')} className="flex items-center gap-2 text-zinc-500 hover:text-white transition-all">
                <ArrowLeft size={18} />
                <span className="text-[10px] font-black uppercase tracking-widest">Atrás</span>
              </button>
              <h3 className="text-sm font-black text-indigo-400 uppercase tracking-widest italic flex items-center gap-2">
                <Users size={16} />
                Nueva Reserva
              </h3>
              <div className="w-8"></div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-10">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] italic">Detalles del Cliente</label>
                <div className="space-y-4">
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-indigo-400 transition-colors" size={18} />
                    <input
                      autoFocus
                      type="text"
                      placeholder="BUSCAR CLIENTE..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setCustomerName(e.target.value);
                        if (!e.target.value) {
                          setSelectedCustomerId(null);
                          setShowCustomerDropdown(false);
                        }
                      }}
                      className="w-full bg-[#0a0a0a] border border-zinc-900 rounded-[24px] py-5 pl-14 pr-6 text-sm font-black text-white placeholder:text-zinc-800 focus:border-indigo-500/50 outline-none transition-all focus:ring-4 focus:ring-indigo-500/5"
                    />

                    {/* CUSTOMER DROPDOWN */}
                    {showCustomerDropdown && foundCustomers.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a] border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden">
                        {foundCustomers.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomerId(c.id);
                              setCustomerName(c.full_name);
                              setCustomerSearch(c.full_name);
                              setShowCustomerDropdown(false);
                            }}
                            className="w-full p-4 flex items-center gap-3 hover:bg-zinc-900 transition-all text-left border-b border-zinc-900/50 last:border-0"
                          >
                            <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 text-xs font-bold uppercase">
                              {c.full_name?.[0] || 'C'}
                            </div>
                            <div className="flex-1">
                              <p className="text-xs font-black text-white uppercase italic">{c.full_name}</p>
                              <p className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest">Cliente Registrado</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-indigo-400 transition-colors">
                      <Receipt size={18} />
                    </div>
                    <input
                      type="email"
                      placeholder="EMAIL (OPCIONAL)..."
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-zinc-900 rounded-[24px] py-5 pl-14 pr-6 text-sm font-black text-white placeholder:text-zinc-800 focus:border-indigo-500/50 outline-none transition-all focus:ring-4 focus:ring-indigo-500/5"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] italic">Pre-pago / Consumo Mínimo</label>
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-700 group-focus-within:text-[#36e27b] transition-colors">
                    <Banknote size={18} />
                  </div>
                  <input
                    type="number"
                    placeholder="MONTO ASIGNADO (0.00)..."
                    value={reservationAmount}
                    onChange={(e) => setReservationAmount(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-zinc-900 rounded-[24px] py-5 pl-14 pr-6 text-sm font-black text-[#36e27b] placeholder:text-zinc-800 focus:border-[#36e27b]/40 outline-none transition-all focus:ring-4 focus:ring-[#36e27b]/5"
                  />
                  <div className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-black text-zinc-700 uppercase tracking-widest italic">ARS</div>
                </div>
                <p className="text-[8px] text-zinc-600 font-medium px-4">Si se ingresa un monto, se considerará como consumo mínimo o pre-pago de la mesa.</p>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em] italic">Capacidad</label>
                <div className="flex items-center gap-3 bg-[#0a0a0a] p-2 rounded-[32px] border border-zinc-900">
                  <button onClick={() => setPax(Math.max(1, pax - 1))} className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-900 transition-all"><Minus size={18} /></button>
                  <div className="flex-1 text-center">
                    <span className="text-2xl font-black text-white italic tabular-nums">{pax}</span>
                    <span className="text-[10px] font-medium text-zinc-600 ml-2 uppercase">Personas</span>
                  </div>
                  <button onClick={() => setPax(pax + 1)} className="w-12 h-12 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-900 transition-all"><Plus size={18} /></button>
                </div>
              </div>

              <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-[32px] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                      <CheckCircle2 size={16} />
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-white uppercase tracking-widest">Enviar Invitación</p>
                      <p className="text-[9px] text-zinc-500">Link de registro rápido vía App</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setInviteEnabled(!inviteEnabled)}
                    className={`w-12 h-6 rounded-full transition-all relative ${inviteEnabled ? 'bg-indigo-500' : 'bg-zinc-800'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${inviteEnabled ? 'left-7' : 'left-1'}`} />
                  </button>
                </div>
              </div>
            </div>

            <div className="p-8 bg-black border-t border-zinc-900">
              <button
                disabled={!customerName || isProcessing}
                onClick={handleReserveTable}
                className={`w-full py-6 rounded-[28px] text-[12px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 shadow-2xl ${!customerName || isProcessing
                  ? 'bg-zinc-900 text-zinc-700'
                  : 'bg-indigo-500 text-white hover:shadow-indigo-500/20 hover:scale-[1.02]'
                  }`}
              >
                {isProcessing ? 'Procesando...' : 'Confirmar Reserva'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ActionButton: React.FC<{ icon: React.ReactNode, label: string, accent?: boolean, danger?: boolean, onClick?: () => void }> = ({ icon, label, accent, danger, onClick }) => (
  <button
    onClick={onClick}
    className={`
      flex flex-col items-center justify-center p-6 rounded-3xl border transition-all duration-300 active:scale-95 group
      ${accent ? 'bg-[#36e27b] border-[#36e27b] text-black shadow-[0_0_20px_rgba(54,226,123,0.1)] hover:shadow-[0_0_30px_rgba(54,226,123,0.2)]' :
        danger ? 'bg-black border-zinc-900 text-zinc-600 hover:text-rose-500 hover:border-rose-900/50 hover:bg-rose-500/[0.02]' :
          'bg-[#080808] border-zinc-900 text-zinc-600 hover:text-white hover:border-zinc-700'}
    `}
  >
    <div className={`mb-2 transition-transform group-hover:scale-110 ${accent ? 'text-black' : ''}`}>{icon}</div>
    <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

const PaymentOption: React.FC<{ active: boolean, onClick: () => void, icon: React.ReactNode, label: string }> = ({ active, onClick, icon, label }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center gap-3 p-5 rounded-[24px] border transition-all ${active ? 'bg-[#36e27b]/5 border-[#36e27b] text-[#36e27b]' : 'bg-[#080808] border-zinc-900 text-zinc-600 hover:border-zinc-700'}`}
  >
    {icon}
    <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

const MetricCard: React.FC<{ label: string, value: string }> = ({ label, value }) => (
  <div className="bg-[#080808] border border-zinc-900 p-5 rounded-3xl group hover:border-zinc-700 transition-all">
    <p className="text-[7px] text-zinc-600 font-black uppercase tracking-[0.3em] mb-2">{label}</p>
    <p className="text-xl font-black text-white italic group-hover:text-[#36e27b] transition-colors leading-none">{value}</p>
  </div>
);

export default TableDetail;
