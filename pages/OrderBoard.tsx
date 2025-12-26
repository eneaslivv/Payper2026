
import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderStatus } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../components/ToastSystem';
import { useOffline } from '../contexts/OfflineContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const OrderBoard: React.FC = () => {
  const { addToast } = useToast();
  const { orders, updateOrderStatus, refreshOrders } = useOffline(); // Use offline context
  const { profile } = useAuth();
  const [now, setNow] = useState(new Date());
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activeColumn, setActiveColumn] = useState<OrderStatus | null>(null);

  // Filtrado por KPI
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'TODOS'>('TODOS');

  // Load latest orders on mount and set up realtime
  useEffect(() => {
    refreshOrders();
    const timer = setInterval(() => setNow(new Date()), 1000);

    // REALTIME SUBSCRIPTION for live order updates
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'orders',
          filter: profile?.store_id ? `store_id=eq.${profile.store_id}` : undefined
        },
        (payload) => {
          console.log('[REALTIME] Order change:', payload.eventType, payload);

          if (payload.eventType === 'INSERT') {
            addToast('NUEVO PEDIDO', 'order', 'Llegó un nuevo pedido');
          } else if (payload.eventType === 'UPDATE') {
            addToast('PEDIDO ACTUALIZADO', 'status', 'Estado modificado');
          }

          // Refresh orders to get the latest data
          refreshOrders();
        }
      )
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [profile?.store_id]);

  // Update selected order reference when orders list changes (to reflect status updates)
  useEffect(() => {
    if (selectedOrder) {
      const updated = orders.find(o => o.id === selectedOrder.id);
      if (updated) setSelectedOrder(updated);
    }
  }, [orders, selectedOrder?.id]);

  const handleStatusChange = (orderId: string, newStatus: OrderStatus) => {
    updateOrderStatus(orderId, newStatus);
    addToast(`PEDIDO #${orderId}`, 'status', `Estado actualizado: ${newStatus}`);
  };

  // Keyboard Shortcuts for Order Selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedOrder) return;

      switch (e.key.toUpperCase()) {
        case '1':
          handleStatusChange(selectedOrder.id, 'Pendiente');
          break;
        case '2':
          handleStatusChange(selectedOrder.id, 'En Preparación');
          break;
        case '3':
          handleStatusChange(selectedOrder.id, 'Listo');
          break;
        case '4':
          handleStatusChange(selectedOrder.id, 'Entregado');
          break;
        case 'X':
          handleStatusChange(selectedOrder.id, 'Cancelado');
          break;
        case 'ESCAPE':
          setSelectedOrder(null);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOrder]);

  const stats = useMemo(() => ({
    total: orders.filter(o => o.status !== 'Entregado').length,
    pendientes: orders.filter(o => o.status === 'Pendiente').length,
    proceso: orders.filter(o => o.status === 'En Preparación').length,
    listos: orders.filter(o => o.status === 'Listo').length,
  }), [orders]);

  const handleAdvanceStatus = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const order = orders.find(o => o.id === id);
    if (!order) return;

    if (order.status === 'Pendiente') {
      handleStatusChange(id, 'En Preparación');
      addToast("INICIANDO", 'status', "Protocolo de preparación activo");
    } else if (order.status === 'En Preparación') {
      handleStatusChange(id, 'Listo');
      addToast("PEDIDO LISTO", 'success', "Notificando al cliente");
    } else if (order.status === 'Listo') {
      handleStatusChange(id, 'Entregado');
      addToast("ENTREGADO", 'status', "Ciclo completado");
    }

    if (selectedOrder?.id === id) setSelectedOrder(null);
  };

  const handleMoveOrder = (orderId: string, newStatus: OrderStatus) => {
    handleStatusChange(orderId, newStatus);
    setActiveColumn(null);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const isNotDelivered = o.status !== 'Entregado';
      const matchesSearch = o.id.includes(searchTerm) || o.customer.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'TODOS' ? isNotDelivered : o.status === statusFilter;

      return isNotDelivered && matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  const formattedDate = now.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  const formattedTime = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className="h-[calc(100vh-64px)] bg-[#0D0F0D] flex flex-col overflow-hidden animate-in fade-in duration-500">

      <header className="p-6 pb-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shrink-0">
        <div className="flex items-center gap-6">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-neon font-bold text-[8px] uppercase tracking-[0.2em]">
              <span className="size-1 rounded-full bg-neon animate-pulse"></span>
              OPS REAL-TIME
            </div>
            <h1 className="text-2xl font-black italic-black tracking-tighter text-white uppercase leading-none">
              TABLERO <span className="text-neon">DESPACHO</span>
            </h1>
          </div>
          <div className="h-6 w-px bg-white/10 hidden sm:block"></div>
          <div className="flex flex-col">
            <p className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">{formattedDate}</p>
            <p className="text-lg font-black italic-black text-neon leading-none uppercase tracking-tighter">{formattedTime}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full xl:w-auto">
          <div className="flex bg-white/5 p-1 rounded-lg border border-white/5">
            <button onClick={() => setViewMode('kanban')} className={`size-8 flex items-center justify-center rounded-md transition-all ${viewMode === 'kanban' ? 'bg-neon text-black shadow-neon-soft' : 'text-white/40 hover:text-white'}`}>
              <span className="material-symbols-outlined text-lg">view_kanban</span>
            </button>
            <button onClick={() => setViewMode('list')} className={`size-8 flex items-center justify-center rounded-md transition-all ${viewMode === 'list' ? 'bg-neon text-black shadow-neon-soft' : 'text-white/40 hover:text-white'}`}>
              <span className="material-symbols-outlined text-lg">format_list_bulleted</span>
            </button>
          </div>
          <div className="relative group flex-1 xl:w-48">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-sm">search</span>
            <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="BUSCAR..." className="h-9 w-full pl-9 pr-3 rounded-lg border border-white/5 bg-white/5 outline-none focus:ring-1 focus:ring-neon/20 text-[9px] font-bold uppercase tracking-widest text-white placeholder:text-white/10" />
          </div>
        </div>
      </header>

      {/* KPI FILTERS - INTERACTIVOS */}
      <div className="px-6 grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0 mb-6">
        <KpiBox
          label="TOTAL ACTIVO"
          value={stats.total}
          onClick={() => setStatusFilter('TODOS')}
          active={statusFilter === 'TODOS'}
          border="border-neon/20"
        />
        <KpiBox
          label="PENDIENTES"
          value={stats.pendientes}
          onClick={() => setStatusFilter('Pendiente')}
          active={statusFilter === 'Pendiente'}
          textColor="text-orange-500"
          border="border-orange-500/20"
        />
        <KpiBox
          label="EN PROCESO"
          value={stats.proceso}
          onClick={() => setStatusFilter('En Preparación')}
          active={statusFilter === 'En Preparación'}
          textColor="text-blue-500"
          border="border-blue-500/20"
        />
        <KpiBox
          label="LISTOS"
          value={stats.listos}
          onClick={() => setStatusFilter('Listo')}
          active={statusFilter === 'Listo'}
          textColor="text-neon"
          border="border-neon/20"
        />
      </div>

      <div className="flex-1 overflow-x-auto no-scrollbar pb-6 px-6 scroll-smooth">
        {viewMode === 'kanban' ? (
          <div className="flex gap-5 h-full min-w-max">
            {(statusFilter === 'TODOS' || statusFilter === 'Pendiente') && (
              <Column
                title="PENDIENTES"
                status="Pendiente"
                dotColor="bg-orange-500"
                orders={filteredOrders.filter(o => o.status === 'Pendiente')}
                onClickCard={setSelectedOrder}
                onAdvance={handleAdvanceStatus}
                onMove={handleMoveOrder}
                isActive={activeColumn === 'Pendiente'}
                setActiveColumn={setActiveColumn}
              />
            )}
            {(statusFilter === 'TODOS' || statusFilter === 'En Preparación') && (
              <Column
                title="PROCESO"
                status="En Preparación"
                dotColor="bg-blue-500"
                orders={filteredOrders.filter(o => o.status === 'En Preparación')}
                onClickCard={setSelectedOrder}
                onAdvance={handleAdvanceStatus}
                onMove={handleMoveOrder}
                isActive={activeColumn === 'En Preparación'}
                setActiveColumn={setActiveColumn}
              />
            )}
            {(statusFilter === 'TODOS' || statusFilter === 'Listo') && (
              <Column
                title="LISTO"
                status="Listo"
                dotColor="bg-neon"
                orders={filteredOrders.filter(o => o.status === 'Listo')}
                onClickCard={setSelectedOrder}
                onAdvance={handleAdvanceStatus}
                onMove={handleMoveOrder}
                isActive={activeColumn === 'Listo'}
                setActiveColumn={setActiveColumn}
              />
            )}
          </div>
        ) : (
          <div className="h-full overflow-y-auto no-scrollbar bg-white/[0.02] border border-white/5 rounded-xl animate-in fade-in">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[#0D0F0D] z-10">
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-6 py-3 text-[8px] font-black text-white/30 uppercase tracking-widest">ID</th>
                  <th className="px-6 py-3 text-[8px] font-black text-white/30 uppercase tracking-widest">Cliente</th>
                  <th className="px-6 py-3 text-[8px] font-black text-white/30 uppercase tracking-widest">Ubicación</th>
                  <th className="px-6 py-3 text-[8px] font-black text-white/30 uppercase tracking-widest">Estado</th>
                  <th className="px-6 py-3 text-right text-[8px] font-black text-white/30 uppercase tracking-widest">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredOrders.map(o => (
                  <tr key={o.id} onClick={() => setSelectedOrder(o)} className="hover:bg-white/[0.01] transition-colors cursor-pointer">
                    <td className="px-6 py-4 text-xs font-black text-white italic tracking-tighter">#{o.id}</td>
                    <td className="px-6 py-4 text-[10px] font-bold text-white uppercase">{o.customer}</td>
                    <td className="px-6 py-4 text-[9px] font-bold text-neon/60 uppercase">{o.table ? `Mesa ${o.table}` : 'Takeaway'}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded border ${getStatusStyles(o.status)}`}>{o.status}</span>
                    </td>
                    <td className="px-6 py-4 text-[10px] font-black text-white text-right">${o.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={`fixed inset-y-0 right-0 z-[100] w-full max-w-[450px] bg-surface-dark border-l border-white/5 shadow-2xl transition-transform duration-500 flex flex-col ${selectedOrder ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedOrder && (
          <>
            <div className="p-8 border-b border-white/5 flex justify-between items-center">
              <div>
                <h2 className="text-3xl font-black italic-black text-white tracking-tighter uppercase leading-none">PEDIDO <span className="text-neon">#{selectedOrder.id}</span></h2>
                <p className="text-[10px] font-bold text-text-secondary uppercase mt-2 tracking-widest opacity-60">{selectedOrder.time}</p>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="size-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-text-secondary uppercase tracking-[0.2em]">Cliente Operativo</label>
                <p className="text-xl font-black text-white uppercase italic tracking-tight">{selectedOrder.customer}</p>
                <p className="text-[10px] text-neon font-bold uppercase tracking-widest">{selectedOrder.table ? `UBICACIÓN: MESA ${selectedOrder.table}` : 'MODALIDAD: PARA LLEVAR'}</p>
              </div>

              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                <h4 className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-3">Atajos de Estado</h4>
                <div className="flex gap-2">
                  <span className="px-2 py-1 rounded bg-white/5 text-[9px] font-bold text-white border border-white/10">[1] Pendiente</span>
                  <span className="px-2 py-1 rounded bg-white/5 text-[9px] font-bold text-white border border-white/10">[2] Prep</span>
                  <span className="px-2 py-1 rounded bg-white/5 text-[9px] font-bold text-white border border-white/10">[3] Listo</span>
                  <span className="px-2 py-1 rounded bg-white/5 text-[9px] font-bold text-red-400 border border-white/10">[X] Cancelar</span>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[9px] font-black text-text-secondary uppercase tracking-[0.2em]">Items del Reporte</label>
                <div className="space-y-2">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="size-6 rounded bg-neon/10 text-neon flex items-center justify-center font-black text-[10px]">{item.quantity}x</span>
                        <span className="text-[11px] font-bold text-white uppercase tracking-tight">{item.name}</span>
                      </div>
                      <span className="text-[11px] font-black text-white/40">${(item.price_unit * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-neon/5 border border-neon/10 flex justify-between items-center">
                <span className="text-[10px] font-black text-neon uppercase tracking-widest">Total Transacción</span>
                <span className="text-2xl font-black text-white italic-black leading-none">${selectedOrder.amount.toFixed(2)}</span>
              </div>
            </div>

            <div className="p-8 bg-[#0D0F0D]/80 backdrop-blur-xl border-t border-white/5 grid grid-cols-2 gap-4">
              <button onClick={() => handleAdvanceStatus(selectedOrder.id)} className="col-span-2 py-5 rounded-2xl bg-neon text-black font-black text-xs uppercase tracking-[0.3em] shadow-neon-soft active:scale-95 transition-all">
                {selectedOrder.status === 'Listo' ? 'MARCAR COMO ENTREGADO' : 'AVANZAR PROTOCOLO'}
              </button>
              <button className="py-4 border border-white/5 rounded-xl text-[10px] font-black text-white/20 uppercase tracking-widest hover:text-primary transition-colors">Cancelar</button>
              <button className="py-4 border border-white/5 rounded-xl text-[10px] font-black text-white/20 uppercase tracking-widest hover:text-white transition-colors">Imprimir Comanda</button>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {selectedOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90]"
            onClick={() => setSelectedOrder(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

const KpiBox: React.FC<{ label: string, value: number, border?: string, textColor?: string, active?: boolean, onClick: () => void }> = ({ label, value, border = "border-white/5", textColor = "text-white", active, onClick }) => (
  <button
    onClick={onClick}
    className={`bg-[#111311] border ${active ? border + ' bg-white/[0.04]' : 'border-white/5'} rounded-[1.2rem] p-4 flex flex-col items-center justify-center transition-all h-[90px] shadow-lg group active:scale-95`}
  >
    <p className={`text-[8px] font-black uppercase tracking-[0.15em] mb-1.5 transition-colors ${active ? textColor : 'text-white/30'}`}>{label}</p>
    <h3 className={`text-2xl font-black italic-black leading-none tracking-tighter transition-all ${active ? textColor + ' scale-110' : 'text-white'}`}>{value}</h3>
    {active && <div className={`mt-2 w-4 h-0.5 rounded-full shadow-neon-soft ${textColor.includes('neon') ? 'bg-neon' : textColor.includes('orange') ? 'bg-orange-500' : 'bg-blue-500'}`}></div>}
  </button>
);

const Column: React.FC<{
  title: string,
  status: OrderStatus,
  dotColor: string,
  orders: Order[],
  onClickCard: (o: Order) => void,
  onAdvance: (id: string, e: React.MouseEvent) => void,
  onMove: (orderId: string, newStatus: OrderStatus) => void,
  isActive: boolean,
  setActiveColumn: (s: OrderStatus | null) => void
}> = ({ title, status, dotColor, orders, onClickCard, onAdvance, onMove, isActive, setActiveColumn }) => {

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setActiveColumn(status);
  };

  const handleDrop = (e: React.DragEvent) => {
    const orderId = e.dataTransfer.getData("orderId");
    onMove(orderId, status);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={() => setActiveColumn(null)}
      onDrop={handleDrop}
      className={`flex flex-col w-[320px] shrink-0 rounded-[1.5rem] p-4 border transition-all h-full ${isActive ? 'bg-neon/5 border-neon/30 scale-[1.02] shadow-neon-soft' : 'bg-[#121412]/50 border-white/5'
        }`}
    >
      <div className="flex items-center justify-between mb-5 px-1 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className={`size-2 rounded-full ${dotColor} shadow-[0_0_10px_rgba(255,255,255,0.1)]`}></div>
          <h3 className="text-[11px] font-black text-white uppercase tracking-[0.25em] italic opacity-80">{title}</h3>
        </div>
        <span className="text-[9px] font-black px-2 py-1 rounded bg-white/5 text-white/30">{orders.length}</span>
      </div>

      <div className="flex-1 space-y-3.5 overflow-y-auto no-scrollbar pr-0.5">
        <AnimatePresence mode="popLayout">
          {orders.map(order => (
            <motion.div
              key={order.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("orderId", order.id);
                (e.target as HTMLElement).classList.add('opacity-40');
              }}
              onDragEnd={(e) => {
                (e.target as HTMLElement).classList.remove('opacity-40');
              }}
              whileDrag={{
                rotate: 2.5,
                scale: 1.05,
                zIndex: 100,
                cursor: 'grabbing',
                boxShadow: "0 25px 60px -12px rgba(0, 0, 0, 0.7)"
              }}
              onClick={() => onClickCard(order)}
              className="bg-[#141714] p-5 rounded-2xl border border-white/5 hover:border-neon/30 transition-all cursor-pointer group active:scale-[0.98] relative overflow-hidden shadow-xl"
            >
              <div className="flex justify-between items-start mb-4 pointer-events-none">
                <span className="text-2xl font-black italic-black text-white tracking-tighter group-hover:text-neon transition-colors leading-none">#{order.id}</span>
                <span className="text-[8px] font-black text-white/40 uppercase bg-white/5 px-2 py-1 rounded leading-none">{order.time.toUpperCase()}</span>
              </div>
              <div className="space-y-1 mb-6 pointer-events-none">
                <p className="text-[13px] font-black text-white uppercase italic tracking-tight truncate leading-tight">{order.customer}</p>
                <p className="text-[9px] text-neon font-bold uppercase tracking-[0.15em]">{order.table ? `MESA ${order.table}` : 'PARA LLEVAR'}</p>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-white/5 pointer-events-none">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[14px] text-neon opacity-70">payments</span>
                  <span className="text-[11px] font-black text-white opacity-80">${order.amount.toFixed(2)}</span>
                </div>

                <button
                  onClick={(e) => onAdvance(order.id, e)}
                  className={`group/btn flex items-center justify-center size-9 rounded-xl border transition-all shadow-neon-soft ${order.status === 'Listo' ? 'bg-neon text-black border-neon' : 'bg-neon/10 text-neon border-neon/20 hover:bg-neon hover:text-black'
                    }`}
                >
                  <span className="material-symbols-outlined text-xl group-hover/btn:translate-x-0.5 transition-transform">
                    {order.status === 'Listo' ? 'check_circle' : 'arrow_forward'}
                  </span>
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {orders.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-full flex flex-col items-center justify-center border border-dashed border-white/5 rounded-2xl opacity-10 py-20"
          >
            <span className="material-symbols-outlined text-3xl mb-2">inbox</span>
            <p className="text-[9px] font-black uppercase tracking-[0.3em]">Columna Vacía</p>
          </motion.div>
        )}
      </div>
    </div>
  );
};

const getStatusStyles = (status: string) => {
  switch (status) {
    case 'Pendiente': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
    case 'En Preparación': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    case 'Listo': return 'bg-neon/10 text-neon border-neon/20';
    default: return 'bg-white/5 text-white/40 border-white/10';
  }
};

export default OrderBoard;
