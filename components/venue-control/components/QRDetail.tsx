
import React, { useRef, useEffect, useState } from 'react';
import { QR, Bar, AppMode } from '../types';
import { X, QrCode, TrendingUp, Settings2, Power, History, Menu as MenuIcon, FileText, Image as ImageIcon, Box, ChevronDown, Plus, ShoppingCart, Bell } from 'lucide-react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import { supabase } from '../../../lib/supabase';

interface QRDetailProps {
  qr: QR;
  bars: Bar[];
  mode: AppMode;
  storeSlug?: string;
  storeId?: string;
  onClose: () => void;
  onToggleStatus: (id: string) => void;
  onUpdateProperty: (prop: string, val: any) => void;
  onReassign?: (qrId: string, barId: string) => void;
}

interface OrderHistoryItem {
  id: string;
  client_name: string;
  total_amount: number;
  status: string;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  category?: string;
}

const MOCK_MENUS = [
  { id: 'm1', name: 'MENÚ NOCTURNO' },
  { id: 'm2', name: 'HAPPY HOUR' },
  { id: 'm3', name: 'VIP SELECTION' },
  { id: 'm4', name: 'ONLY DRINKS' }
];

const QRDetail: React.FC<QRDetailProps> = ({ qr, bars = [], mode, storeSlug = 'demo', storeId, onClose, onToggleStatus, onUpdateProperty, onReassign }) => {
  const [orders, setOrders] = useState<OrderHistoryItem[]>([]);
  const [stats, setStats] = useState({ totalOrders: 0, totalRevenue: 0, activeOrders: 0 });
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [newOrderItems, setNewOrderItems] = useState<{ productId: string, name: string, price: number, qty: number }[]>([]);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [newOrderNotification, setNewOrderNotification] = useState(false);

  const activeBar = bars?.find(b => b.id === qr.barId);
  const barName = activeBar?.name || "SIN ASIGNAR";
  const activeMenu = MOCK_MENUS.find(m => m.id === qr.menuId)?.name || "MENÚ ESTÁNDAR";
  const isEditMode = mode === AppMode.EDIT;
  const isOperativeMode = mode === AppMode.OPERATE;

  // Generate QR URL
  const qrUrl = `${window.location.origin}/#/m/${storeSlug}?table=${qr.name}`;

  // Fetch real stats and orders
  const fetchStats = async () => {
    setIsLoadingStats(true);
    try {
      const { data: ordersData } = await supabase
        .from('orders')
        .select('id, total_amount, status, created_at, clients(name)')
        .eq('table_number', qr.name)
        .order('created_at', { ascending: false })
        .limit(20);

      if (ordersData) {
        const formattedOrders = ordersData.map((o: any) => ({
          id: o.id,
          client_name: o.clients?.name || 'Invitado',
          total_amount: o.total_amount || 0,
          status: o.status || 'pending',
          created_at: o.created_at
        }));
        setOrders(formattedOrders);

        const totalRevenue = ordersData.reduce((sum: number, o: any) => sum + (o.total_amount || 0), 0);
        const activeOrders = ordersData.filter((o: any) => ['pending', 'in_progress', 'preparing'].includes(o.status)).length;
        setStats({
          totalOrders: ordersData.length,
          totalRevenue,
          activeOrders
        });
      }
    } catch (err) {
      console.error('Error fetching QR stats:', err);
    } finally {
      setIsLoadingStats(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [qr.name]);

  // Real-time subscription for orders on this table
  useEffect(() => {
    const channel = supabase
      .channel(`orders-table-${qr.name}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `table_number=eq.${qr.name}`
        },
        (payload) => {
          console.log('Real-time order update:', payload);
          setNewOrderNotification(true);
          setTimeout(() => setNewOrderNotification(false), 3000);
          fetchStats(); // Refresh data
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qr.name]);

  // Fetch products for manual order
  useEffect(() => {
    const fetchProducts = async () => {
      if (!storeId) return;
      const { data } = await supabase
        .from('inventory_items')
        .select('id, name, price')
        .eq('store_id', storeId)
        .eq('item_type', 'sellable')
        .limit(50);
      if (data) setProducts(data);
    };
    if (showNewOrderModal) fetchProducts();
  }, [showNewOrderModal, storeId]);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  // Download as PNG
  const downloadPNG = () => {
    const canvas = document.querySelector('#qr-canvas canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `QR-${qr.name}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  // Download as SVG
  const downloadSVG = () => {
    const svg = document.querySelector('#qr-svg svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svg);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const link = document.createElement('a');
    link.download = `QR-${qr.name}.svg`;
    link.href = URL.createObjectURL(blob);
    link.click();
  };

  // Download as PDF
  const downloadPDF = () => {
    const canvas = document.querySelector('#qr-canvas canvas') as HTMLCanvasElement;
    if (!canvas) return;

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const imgData = canvas.toDataURL('image/png');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const qrSize = 80;
    const x = (pdfWidth - qrSize) / 2;

    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    pdf.text(qr.name, pdfWidth / 2, 30, { align: 'center' });
    pdf.setFontSize(12);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Escanea para ordenar', pdfWidth / 2, 40, { align: 'center' });
    pdf.addImage(imgData, 'PNG', x, 50, qrSize, qrSize);
    pdf.setFontSize(10);
    pdf.text(qrUrl, pdfWidth / 2, 140, { align: 'center' });
    pdf.save(`QR-${qr.name}.pdf`);
  };

  // Add product to new order
  const addProductToOrder = (product: Product) => {
    const existing = newOrderItems.find(i => i.productId === product.id);
    if (existing) {
      setNewOrderItems(prev => prev.map(i => i.productId === product.id ? { ...i, qty: i.qty + 1 } : i));
    } else {
      setNewOrderItems(prev => [...prev, { productId: product.id, name: product.name, price: product.price, qty: 1 }]);
    }
  };

  // Create manual order
  const createManualOrder = async () => {
    if (newOrderItems.length === 0 || !storeId) return;
    setIsCreatingOrder(true);
    try {
      const total = newOrderItems.reduce((sum, i) => sum + (i.price * i.qty), 0);

      // Create order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          store_id: storeId,
          table_number: qr.name,
          total_amount: total,
          status: 'pending',
          payment_method: 'cash',
          order_type: 'local'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = newOrderItems.map(item => ({
        order_id: orderData.id,
        product_id: item.productId,
        price_at_time: item.price,
        quantity: item.qty,
        status: 'pending'
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      setShowNewOrderModal(false);
      setNewOrderItems([]);
      fetchStats();
    } catch (err) {
      console.error('Error creating order:', err);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Time ago helper
  const timeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'ahora';
    if (diffMins < 60) return `${diffMins}m`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d`;
  };

  // Status color
  const statusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-500';
      case 'in_progress': case 'preparing': return 'text-blue-500';
      case 'completed': case 'delivered': return 'text-green-500';
      case 'cancelled': return 'text-red-500';
      default: return 'text-zinc-500';
    }
  };

  const orderTotal = newOrderItems.reduce((sum, i) => sum + (i.price * i.qty), 0);

  return (
    <div
      onPointerDown={handlePointerDown}
      className="fixed inset-y-0 right-0 w-full md:w-[400px] bg-[#050505] border-l border-zinc-900 shadow-[0_0_100px_rgba(0,0,0,1)] z-[210] flex flex-col animate-in slide-in-from-right duration-500"
    >
      {/* Header */}
      <div className="p-8 border-b border-zinc-900 bg-[#080808] flex items-center justify-between relative">
        {newOrderNotification && (
          <div className="absolute top-2 right-2 bg-[#36e27b] text-black text-[8px] font-black uppercase px-2 py-1 rounded-full animate-pulse flex items-center gap-1">
            <Bell size={10} /> NUEVO PEDIDO
          </div>
        )}
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

      <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
        {/* QR PREVIEW */}
        <div className="space-y-4">
          <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600 italic border-b border-zinc-900 pb-4">PREVISUALIZACIÓN QR</h4>
          <div className="flex flex-col items-center gap-4">
            <div className="bg-white p-4 rounded-2xl" id="qr-svg">
              <QRCodeSVG value={qrUrl} size={160} level="H" includeMargin={true} />
            </div>
            <div className="hidden" id="qr-canvas">
              <QRCodeCanvas value={qrUrl} size={400} level="H" includeMargin={true} />
            </div>
            <p className="text-[8px] text-zinc-500 font-mono break-all text-center max-w-[280px]">{qrUrl}</p>
          </div>
        </div>

        {/* EXPORT */}
        <div className="space-y-3">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-600 italic">Exportar</h4>
          <div className="grid grid-cols-3 gap-2">
            <DownloadButton icon={<ImageIcon size={14} />} label="PNG" onClick={downloadPNG} />
            <DownloadButton icon={<Box size={14} />} label="SVG" onClick={downloadSVG} />
            <DownloadButton icon={<FileText size={14} />} label="PDF" onClick={downloadPDF} />
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#080808] border border-zinc-900 p-4 rounded-2xl">
            <p className="text-[7px] text-zinc-600 font-black uppercase tracking-widest mb-2">Pedidos</p>
            <span className="text-2xl font-black text-white italic tabular-nums">{isLoadingStats ? '...' : stats.totalOrders}</span>
          </div>
          <div className="bg-[#080808] border border-zinc-900 p-4 rounded-2xl">
            <p className="text-[7px] text-zinc-600 font-black uppercase tracking-widest mb-2">Activos</p>
            <span className="text-2xl font-black text-yellow-500 italic tabular-nums">{isLoadingStats ? '...' : stats.activeOrders}</span>
          </div>
          <div className="bg-[#080808] border border-zinc-900 p-4 rounded-2xl">
            <p className="text-[7px] text-zinc-600 font-black uppercase tracking-widest mb-2">Ingresos</p>
            <span className="text-xl font-black text-[#36e27b] italic tabular-nums">${isLoadingStats ? '...' : stats.totalRevenue.toLocaleString()}</span>
          </div>
        </div>

        {/* OPERATIVE MODE: Create Manual Order */}
        {isOperativeMode && (
          <button
            onClick={() => setShowNewOrderModal(true)}
            className="w-full py-4 flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest rounded-2xl bg-[#36e27b]/10 text-[#36e27b] border border-[#36e27b]/30 hover:bg-[#36e27b]/20 transition-all active:scale-95"
          >
            <Plus size={16} /> Crear Pedido Manual
          </button>
        )}

        {/* ORDER HISTORY */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-900 pb-3">
            <div className="flex items-center gap-2">
              <History size={14} className="text-zinc-600" />
              <h4 className="text-[10px] font-black uppercase tracking-widest text-white italic">Pedidos Recientes</h4>
            </div>
            <button onClick={fetchStats} className="text-[8px] text-zinc-500 hover:text-white uppercase">Actualizar</button>
          </div>
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {isLoadingStats ? (
              <p className="text-[10px] text-zinc-500">Cargando...</p>
            ) : orders.length > 0 ? (
              orders.map((order) => (
                <div key={order.id} className="bg-[#080808] border border-zinc-900 p-3 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 font-black text-[8px] uppercase">
                      {order.client_name[0]}
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-white uppercase">{order.client_name}</p>
                      <p className="text-[7px] text-zinc-600 font-bold uppercase tracking-widest">hace {timeAgo(order.created_at)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-black text-[#36e27b] italic tabular-nums">${order.total_amount.toLocaleString()}</span>
                    <p className={`text-[7px] font-black uppercase ${statusColor(order.status)}`}>{order.status}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[10px] text-zinc-500">Sin pedidos aún</p>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-6 bg-black border-t border-zinc-900">
        <button
          onClick={() => onToggleStatus(qr.id)}
          className={`w-full py-4 flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all border shadow-xl active:scale-95 ${qr.isActive ? 'bg-zinc-900 text-rose-500 border-rose-900/20' : 'bg-[#36e27b] text-black border-[#36e27b]'}`}
        >
          <Power size={16} /> {qr.isActive ? 'Desactivar Punto QR' : 'Activar Punto QR'}
        </button>
      </div>

      {/* NEW ORDER MODAL */}
      {showNewOrderModal && (
        <div className="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-4">
          <div className="bg-[#0a0a0a] border border-zinc-800 rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-black text-white uppercase tracking-tight">Nuevo Pedido - {qr.name}</h3>
              <button onClick={() => { setShowNewOrderModal(false); setNewOrderItems([]); }} className="text-zinc-500 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {products.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
                  <div>
                    <p className="text-sm font-bold text-white">{p.name}</p>
                    <p className="text-xs text-[#36e27b] font-black">${p.price}</p>
                  </div>
                  <button onClick={() => addProductToOrder(p)} className="w-8 h-8 flex items-center justify-center rounded-full bg-[#36e27b] text-black">
                    <Plus size={16} />
                  </button>
                </div>
              ))}
            </div>
            {newOrderItems.length > 0 && (
              <div className="p-4 border-t border-zinc-800 space-y-3">
                <div className="space-y-1">
                  {newOrderItems.map(item => (
                    <div key={item.productId} className="flex justify-between text-sm">
                      <span className="text-zinc-400">{item.qty}x {item.name}</span>
                      <span className="text-white font-bold">${(item.price * item.qty).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-lg font-black border-t border-zinc-800 pt-3">
                  <span className="text-white">TOTAL</span>
                  <span className="text-[#36e27b]">${orderTotal.toLocaleString()}</span>
                </div>
                <button
                  onClick={createManualOrder}
                  disabled={isCreatingOrder}
                  className="w-full py-3 bg-[#36e27b] text-black font-black uppercase rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <ShoppingCart size={16} /> {isCreatingOrder ? 'Creando...' : 'Confirmar Pedido'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const DownloadButton: React.FC<{ icon: React.ReactNode, label: string, onClick: () => void }> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="flex flex-col items-center justify-center gap-2 p-3 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-500 hover:text-white hover:border-[#36e27b]/40 transition-all group active:scale-95"
  >
    <div className="group-hover:text-[#36e27b] transition-colors">{icon}</div>
    <span className="text-[7px] font-black uppercase tracking-widest">{label}</span>
  </button>
);

export default QRDetail;
