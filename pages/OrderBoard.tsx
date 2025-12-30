
import React, { useState, useMemo, useEffect } from 'react';
import { Order, OrderStatus } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '../components/ToastSystem';
import { useOffline } from '../contexts/OfflineContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const OrderBoard: React.FC = () => {
  const { addToast } = useToast();
  const { orders, updateOrderStatus, refreshOrders, syncOrder, confirmOrderDelivery } = useOffline();
  const { profile } = useAuth();
  const [now, setNow] = useState(new Date());
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [incomingOrder, setIncomingOrder] = useState<any>(null);
  const [activeColumn, setActiveColumn] = useState<OrderStatus | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'TODOS'>('TODOS');
  const [showHistory, setShowHistory] = useState(false);

  // New State for Cancellation Confirmation
  const [orderToCancel, setOrderToCancel] = useState<Order | null>(null);

  // Load latest orders on mount and set up realtime
  useEffect(() => {
    // ...
  }, [selectedOrder, orderToCancel]);

  const stats = useMemo(() => ({
    total: orders.filter(o => o.status !== 'Entregado' && o.status !== 'Cancelado').length,
    pendientes: orders.filter(o => o.status === 'Pendiente').length,
    proceso: orders.filter(o => o.status === 'En Preparación').length,
    listos: orders.filter(o => o.status === 'Listo').length,
    // History Stats
    entregados: orders.filter(o => o.status === 'Entregado').length,
    cancelados: orders.filter(o => o.status === 'Cancelado').length,
  }), [orders]);

  const handleOpenIncoming = (rawOrder: any) => {
    const fullOrder = orders.find(o => o.id === rawOrder.id);
    if (fullOrder) {
      setSelectedOrder(fullOrder);
      setIncomingOrder(null);
    } else {
      refreshOrders();
      setTimeout(() => {
        const retry = orders.find(o => o.id === rawOrder.id);
        if (retry) setSelectedOrder(retry);
      }, 500);
      setIncomingOrder(null);
    }
  };

  useEffect(() => {
    if (selectedOrder) {
      const updated = orders.find(o => o.id === selectedOrder.id);
      if (updated) setSelectedOrder(updated);
    }
  }, [orders, selectedOrder?.id]);

  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    if (newStatus === 'Entregado') {
      const result = await confirmOrderDelivery(orderId, profile?.id || '');
      if (result.success) {
        addToast(`PEDIDO #${orderId}`, 'success', result.message);
      } else {
        addToast(`ERROR`, 'error', result.message);
      }
    } else {
      updateOrderStatus(orderId, newStatus);
      addToast(`PEDIDO #${orderId}`, 'status', `Estado actualizado: ${newStatus}`);
    }
  };

  const confirmCancelOrder = () => {
    if (orderToCancel) {
      handleStatusChange(orderToCancel.id, 'Cancelado');
      setOrderToCancel(null);
      if (selectedOrder?.id === orderToCancel.id) setSelectedOrder(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedOrder) return;
      if (orderToCancel) return;

      switch (e.key.toUpperCase()) {
        case '1': handleStatusChange(selectedOrder.id, 'Pendiente'); break;
        case '2': handleStatusChange(selectedOrder.id, 'En Preparación'); break;
        case '3': handleStatusChange(selectedOrder.id, 'Listo'); break;
        case '4': handleStatusChange(selectedOrder.id, 'Entregado'); break;
        case 'X': setOrderToCancel(selectedOrder); break;
        case 'ESCAPE': setSelectedOrder(null); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOrder, orderToCancel]);

  const handleAdvanceStatus = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const order = orders.find(o => o.id === id);
    if (!order) return;

    // Fase 3 Plan L: Block advancing unpaid MP orders
    const provider = (order as any).payment_provider;
    const isPaid = (order as any).is_paid || order.payment_status === 'approved' || order.payment_status === 'paid';

    if (provider === 'mercadopago' && !isPaid) {
      addToast("PAGO PENDIENTE", 'error', "Este pedido requiere pago de Mercado Pago antes de avanzar");
      return;
    }

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
      const isHistoryStatus = o.status === 'Entregado' || o.status === 'Cancelado';

      // Mode Filter
      if (showHistory && !isHistoryStatus) return false;
      if (!showHistory && isHistoryStatus) return false;

      const term = searchTerm.toLowerCase();
      const cleanNumber = term.replace(/\D/g, ''); // Extract only digits

      const matchesSearch =
        o.id.toLowerCase().includes(term) ||
        o.customer.toLowerCase().includes(term) ||
        (cleanNumber.length > 0 && o.order_number?.toString().includes(cleanNumber));

      // Status Filter (Only applies in Active Mode)
      const matchesStatus = showHistory ? true : (statusFilter === 'TODOS' ? true : o.status === statusFilter);

      // Payment Filter: Hide Unpaid MercadoPago Orders
      // If provider is 'mercadopago' and it's NOT paid, hide it completely.
      const isMP = (o as any).payment_provider === 'mercadopago' || (o as any).payment_method === 'mercadopago';
      const isPaid = (o as any).is_paid === true || (o as any).payment_status === 'approved' || (o as any).payment_status === 'paid';

      if (isMP && !isPaid) return false;

      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter, showHistory]);

  const formattedDate = now.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  const formattedTime = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <>
      <div className="h-[calc(100vh-64px)] bg-[#0D0F0D] flex flex-col overflow-hidden animate-in fade-in duration-500">
        <header className="p-6 pb-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 shrink-0">
          <div className="flex items-center gap-6">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5 text-neon font-bold text-[8px] uppercase tracking-[0.2em]">
                <span className={`size-1 rounded-full ${showHistory ? 'bg-white/50' : 'bg-neon animate-pulse'}`}></span>
                {showHistory ? 'HISTORIAL DE PEDIDOS' : 'OPS REAL-TIME'}
              </div>
              <h1 className="text-2xl font-black italic-black tracking-tighter text-white uppercase leading-none">
                TABLERO <span className={showHistory ? "text-white/40" : "text-neon"}>DESPACHO</span>
              </h1>
            </div>
            <div className="h-6 w-px bg-white/10 hidden sm:block"></div>
            <div className="flex flex-col">
              <p className="text-[8px] font-black text-white/30 uppercase tracking-widest leading-none mb-1">{formattedDate}</p>
              <p className="text-lg font-black italic-black text-neon leading-none uppercase tracking-tighter">{formattedTime}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full xl:w-auto">
            {/* HISTORY TOGGLE */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`h-9 px-4 rounded-lg border flex items-center gap-2 transition-all ${showHistory ? 'bg-white text-black border-white' : 'bg-white/5 text-white/60 border-white/5 hover:text-white'}`}
            >
              <span className="material-symbols-outlined text-lg">{showHistory ? 'history_toggle_off' : 'history'}</span>
              <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">{showHistory ? 'VOLVER A ACTIVO' : 'HISTORIAL'}</span>
            </button>

            <div className="w-px h-6 bg-white/10 mx-1"></div>

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

        {/* KPI FILTERS - CONDITIONAL */}
        <div className="px-6 grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0 mb-6">
          {!showHistory ? (
            <>
              <KpiBox label="TOTAL ACTIVO" value={stats.total} onClick={() => setStatusFilter('TODOS')} active={statusFilter === 'TODOS'} border="border-neon/20" />
              <KpiBox label="PENDIENTES" value={stats.pendientes} onClick={() => setStatusFilter('Pendiente')} active={statusFilter === 'Pendiente'} textColor="text-orange-500" border="border-orange-500/20" />
              <KpiBox label="EN PROCESO" value={stats.proceso} onClick={() => setStatusFilter('En Preparación')} active={statusFilter === 'En Preparación'} textColor="text-blue-500" border="border-blue-500/20" />
              <KpiBox label="LISTOS" value={stats.listos} onClick={() => setStatusFilter('Listo')} active={statusFilter === 'Listo'} textColor="text-neon" border="border-neon/20" />
            </>
          ) : (
            <>
              <KpiBox label="TOTAL FINALIZADOS" value={stats.entregados + stats.cancelados} onClick={() => { }} active={true} border="border-white/20" textColor="text-white" />
              <div className="hidden lg:block"></div>
              <KpiBox label="ENTREGADOS" value={stats.entregados} onClick={() => { }} active={false} textColor="text-green-500" />
              <KpiBox label="CANCELADOS" value={stats.cancelados} onClick={() => { }} active={false} textColor="text-red-500" />
            </>
          )}
        </div>

        <div className="flex-1 overflow-x-auto no-scrollbar pb-6 px-6 scroll-smooth">
          {viewMode === 'kanban' ? (
            <div className="flex gap-5 h-full min-w-max">
              {!showHistory ? (
                <>
                  {(statusFilter === 'TODOS' || statusFilter === 'Pendiente') && (
                    <Column title="PENDIENTES" status="Pendiente" dotColor="bg-orange-500" orders={filteredOrders.filter(o => o.status === 'Pendiente')} onClickCard={setSelectedOrder} onAdvance={handleAdvanceStatus} onMove={handleMoveOrder} isActive={activeColumn === 'Pendiente'} setActiveColumn={setActiveColumn} />
                  )}
                  {(statusFilter === 'TODOS' || statusFilter === 'En Preparación') && (
                    <Column title="PROCESO" status="En Preparación" dotColor="bg-blue-500" orders={filteredOrders.filter(o => o.status === 'En Preparación')} onClickCard={setSelectedOrder} onAdvance={handleAdvanceStatus} onMove={handleMoveOrder} isActive={activeColumn === 'En Preparación'} setActiveColumn={setActiveColumn} />
                  )}
                  {(statusFilter === 'TODOS' || statusFilter === 'Listo') && (
                    <Column title="LISTO" status="Listo" dotColor="bg-neon" orders={filteredOrders.filter(o => o.status === 'Listo')} onClickCard={setSelectedOrder} onAdvance={handleAdvanceStatus} onMove={handleMoveOrder} isActive={activeColumn === 'Listo'} setActiveColumn={setActiveColumn} />
                  )}
                </>
              ) : (
                <>
                  <Column title="ENTREGADOS" status="Entregado" dotColor="bg-green-500" orders={filteredOrders.filter(o => o.status === 'Entregado')} onClickCard={setSelectedOrder} onAdvance={handleAdvanceStatus} onMove={handleMoveOrder} isActive={activeColumn === 'Entregado'} setActiveColumn={setActiveColumn} />
                  <Column title="CANCELADOS" status="Cancelado" dotColor="bg-red-500" orders={filteredOrders.filter(o => o.status === 'Cancelado')} onClickCard={setSelectedOrder} onAdvance={handleAdvanceStatus} onMove={handleMoveOrder} isActive={activeColumn === 'Cancelado'} setActiveColumn={setActiveColumn} />
                </>
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
                    <th className="px-6 py-3 text-[8px] font-black text-white/30 uppercase tracking-widest">Pago</th>
                    <th className="px-6 py-3 text-right text-[8px] font-black text-white/30 uppercase tracking-widest">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredOrders.map(o => (
                    <tr key={o.id} onClick={() => setSelectedOrder(o)} className="hover:bg-white/[0.01] transition-colors cursor-pointer">
                      <td className="px-6 py-4 text-xs font-black text-white italic tracking-tighter">#{getDisplayId(o)}</td>
                      <td className="px-6 py-4 text-[10px] font-bold text-white uppercase">{o.customer}</td>
                      <td className="px-6 py-4 text-[9px] font-bold text-neon/60 uppercase">{o.table ? `Mesa ${o.table}` : 'Takeaway'}</td>
                      <td className="px-6 py-4">
                        <span className={`text-[7px] font-black uppercase px-2 py-0.5 rounded border ${getStatusStyles(o.status)}`}>{o.status}</span>
                      </td>
                      <td className="px-6 py-4">
                        <PaymentBadge order={o} />
                      </td>
                      <td className="px-6 py-4 text-[10px] font-black text-white text-right">${o.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className={`fixed inset-y-0 right-0 z-[9999] w-full max-w-[450px] bg-surface-dark border-l border-white/5 shadow-2xl transition-transform duration-500 flex flex-col ${selectedOrder ? 'translate-x-0' : 'translate-x-full'}`}>
        {selectedOrder && (
          <>
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-[#0D0F0D]">
              <div>
                <h2 className="text-3xl font-black italic-black text-white tracking-tighter uppercase leading-none">PEDIDO <span className="text-neon">#{getDisplayId(selectedOrder)}</span></h2>
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
                <h4 className="text-[9px] font-black text-white/40 uppercase tracking-widest mb-3">Atajos de Teclado</h4>
                <div className="flex gap-2 flex-wrap">
                  <span className="px-2 py-1 rounded bg-white/5 text-[9px] font-bold text-white border border-white/10">[1] Pendiente</span>
                  <span className="px-2 py-1 rounded bg-white/5 text-[9px] font-bold text-white border border-white/10">[2] En Prep</span>
                  <span className="px-2 py-1 rounded bg-white/5 text-[9px] font-bold text-white border border-white/10">[3] Listo</span>
                  <span className="px-2 py-1 rounded bg-white/5 text-[9px] font-bold text-red-400 border border-white/10">[X] Cancelar</span>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[9px] font-black text-text-secondary uppercase tracking-[0.2em]">Detalle de Items</label>
                <div className="space-y-2">
                  {selectedOrder.items.length === 0 ? (
                    <p className="text-white/40 text-[10px] italic">No hay productos registrados en esta orden.</p>
                  ) : (
                    selectedOrder.items.map((item, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex justify-between items-start">
                        <div className="flex gap-3">
                          <span className="size-6 rounded bg-neon/10 text-neon flex items-center justify-center font-black text-[10px] shrink-0">{item.quantity}x</span>
                          <div className="flex flex-col">
                            <span className="text-[12px] font-bold text-white uppercase tracking-tight leading-snug">{item.name || 'Producto Desconocido'}</span>
                            {item.notes && <span className="text-[10px] text-white/50 italic mt-0.5">Nota: {item.notes}</span>}
                          </div>
                        </div>
                        <span className="text-[11px] font-black text-white/40">${(item.price_unit * item.quantity).toFixed(2)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="p-6 rounded-2xl bg-neon/5 border border-neon/10 flex justify-between items-center">
                <span className="text-[10px] font-black text-neon uppercase tracking-widest">Total</span>
                <span className="text-2xl font-black text-white italic-black leading-none">${selectedOrder.amount.toFixed(2)}</span>
              </div>
            </div>

            <div className="p-8 bg-[#0D0F0D]/80 backdrop-blur-xl border-t border-white/5 grid grid-cols-2 gap-4">
              <button
                onClick={() => handleAdvanceStatus(selectedOrder.id)}
                className="col-span-2 py-5 rounded-2xl bg-neon text-black font-black text-xs uppercase tracking-[0.2em] shadow-neon-soft active:scale-95 transition-all hover:bg-neon/90"
              >
                {selectedOrder.status === 'Pendiente' ? 'COMENZAR PREPARACIÓN' :
                  selectedOrder.status === 'En Preparación' ? 'MARCAR COMO LISTO' :
                    selectedOrder.status === 'Listo' ? 'ENTREGAR PEDIDO' : 'ACCIONES COMPLETADAS'}
              </button>
              <button onClick={() => setOrderToCancel(selectedOrder)} className="py-4 border border-white/5 rounded-xl text-[10px] font-black text-red-500/60 uppercase tracking-widest hover:text-red-500 hover:bg-red-500/5 transition-colors">Cancelar</button>
              <button className="py-4 border border-white/5 rounded-xl text-[10px] font-black text-white/20 uppercase tracking-widest hover:text-white transition-colors">Imprimir</button>
            </div>
          </>
        )}
      </div>

      <AnimatePresence>
        {orderToCancel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOrderToCancel(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="bg-[#1a1c1a] border border-red-500/30 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center relative overflow-hidden"
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-red-500 rounded-b-full shadow-[0_0_40px_rgba(239,68,68,0.5)]"></div>
              <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
                <span className="material-symbols-outlined text-3xl text-red-500">warning</span>
              </div>
              <h3 className="text-2xl font-black italic-black text-white uppercase tracking-tighter mb-2">¿Cancelar Pedido?</h3>
              <p className="text-white/60 text-sm mb-8">Esta acción es irreversible. El pedido #{getDisplayId(orderToCancel)} será marcado como cancelado.</p>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => setOrderToCancel(null)} className="py-4 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 font-bold uppercase tracking-widest text-xs transition-colors">Volver</button>
                <button onClick={confirmCancelOrder} className="py-4 rounded-xl bg-red-500 hover:bg-red-600 text-white font-black uppercase tracking-widest text-xs shadow-lg transition-colors">Sí, Cancelar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {incomingOrder && (
          <NewOrderAlert
            order={incomingOrder}
            onOpen={() => handleOpenIncoming(incomingOrder)}
            onClose={() => setIncomingOrder(null)}
          />
        )}
      </AnimatePresence>
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
    </>
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

// Payment Badge Component - Fase 1 Plan L
const PaymentBadge: React.FC<{ order: Order }> = ({ order }) => {
  const isPaid = order.is_paid || order.payment_status === 'approved' || order.payment_status === 'paid';
  const provider = order.payment_provider || order.payment_method;

  // Determine badge type
  let badge = { label: 'EFECTIVO', bg: 'bg-amber-500', border: 'border-amber-500/30', icon: '💵' };

  if (!isPaid) {
    if (provider === 'mercadopago') {
      badge = { label: 'PAGO PENDIENTE', bg: 'bg-red-500', border: 'border-red-500/30', icon: '⏳' };
    } else {
      badge = { label: 'PENDIENTE', bg: 'bg-red-500', border: 'border-red-500/30', icon: '⏳' };
    }
  } else if (provider === 'mercadopago') {
    badge = { label: 'MERCADO PAGO', bg: 'bg-[#009ee3]', border: 'border-[#009ee3]/30', icon: '💳' };
  } else if (provider === 'wallet' || order.payment_method === 'wallet') {
    badge = { label: 'SALDO', bg: 'bg-violet-500', border: 'border-violet-500/30', icon: '💜' };
  }

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${badge.bg} ${badge.border} bg-opacity-10 backdrop-blur-md`}>
      <span className="text-[10px]">{badge.icon}</span>
      <span className={`text-[9px] font-black uppercase tracking-wider ${badge.bg.replace('bg-', 'text-')}`}>
        {badge.label}
      </span>
    </div>
  );
};

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
              <div className="flex justify-between items-center mb-4 pointer-events-none relative">
                <span className="text-xl font-black italic-black text-white tracking-tighter group-hover:text-neon transition-colors leading-none">#{getDisplayId(order)}</span>

                <div className="flex items-center gap-2">
                  {/* DELAY BADGE */}
                  {getDelayStatus(order, orders.length) > 0 && (
                    <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 px-2 py-1 rounded-lg animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.1)]">
                      <span className="material-symbols-outlined text-[12px] text-red-500 font-black">warning</span>
                      <span className="text-[9px] font-black text-red-500 uppercase tracking-tight leading-none">
                        +{getDelayStatus(order, orders.length)} MIN
                      </span>
                    </div>
                  )}

                  <span className="text-[8px] font-black text-white/30 uppercase bg-white/5 px-2 py-1 rounded leading-none shrink-0">{order.time.toUpperCase()}</span>
                </div>
              </div>

              <div className="space-y-1 mb-4 pointer-events-none">
                <p className="text-[13px] font-black text-white uppercase italic tracking-tight truncate leading-tight">{order.customer}</p>
                <p className="text-[9px] text-neon font-bold uppercase tracking-[0.15em]">{order.table ? `MESA ${order.table}` : 'PARA LLEVAR'}</p>
              </div>

              {/* PRODUCTOS (VISIBLES) */}
              <div className="space-y-2 mb-4 pointer-events-none min-h-[20px]">
                {order.items && order.items.length > 0 ? (
                  <>
                    {order.items.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center p-1.5 rounded bg-white/[0.03] border border-white/5">
                        <span className="text-[9px] font-bold text-white uppercase tracking-tight truncate max-w-[150px]">{item.name}</span>
                        <span className="text-xs font-black text-neon leading-none">x{item.quantity}</span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <div className="pt-1">
                        <p className="text-[8px] font-bold text-white/40 uppercase tracking-widest text-center">+ {order.items.length - 3} MÁS</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[9px] text-white/20 italic">...</p>
                )}
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-white/5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px] text-neon opacity-70">payments</span>
                    <span className="text-[11px] font-black text-white opacity-80">${order.amount.toFixed(2)}</span>
                  </div>
                  <PaymentBadge order={order} />
                </div>

                <button
                  onClick={(e) => onAdvance(order.id, e)}
                  title={order.status === 'Listo' ? "Entregar Pedido" : "Avanzar Estado"}
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

// NEW ORDER NOTIFICATION MODAL
const NewOrderAlert: React.FC<{ order: any, onOpen: () => void, onClose: () => void }> = ({ order, onOpen, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 10000); // Auto close after 10s
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.9 }}
      className="fixed top-24 left-1/2 -translate-x-1/2 z-[10000] bg-[#1a1c1a] border border-neon p-6 rounded-2xl shadow-[0_0_50px_rgba(74,222,128,0.2)] flex items-center gap-6 min-w-[400px]"
    >
      <div className="size-16 rounded-full bg-neon/10 flex items-center justify-center animate-pulse">
        <span className="material-symbols-outlined text-3xl text-neon">notifications_active</span>
      </div>
      <div className="flex-1">
        <h3 className="text-neon font-black text-2xl italic tracking-tighter uppercase leading-none mb-1">NUEVO PEDIDO</h3>
        <p className="text-white text-lg font-bold uppercase tracking-tight">#{getDisplayId(order)} <span className="text-white/40 mx-2">|</span> {order.table_number ? `Mesa ${order.table_number}` : 'Para Llevar'}</p>
      </div>
      <button
        onClick={() => { onOpen(); onClose(); }}
        className="px-6 py-3 bg-neon text-black font-black uppercase tracking-widest text-xs rounded-xl hover:bg-white hover:text-black transition-colors"
      >
        VER
      </button>
      <button onClick={onClose} className="absolute top-2 right-2 text-white/20 hover:text-white">
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </motion.div>
  );
};

const getDisplayId = (order: Order) => {
  if (order.order_number && Number(order.order_number) > 0) return order.order_number;
  if (order.id && order.id.length >= 4) return order.id.slice(0, 4);
  return '???';
};

// Returns delay in minutes if delayed, otherwise 0
const getDelayStatus = (order: Order, activeOrdersCount: number) => {
  if (order.status === 'Listo' || order.status === 'Entregado' || order.status === 'Cancelado') return 0;

  const created = new Date(order.created_at).getTime();
  const now = new Date().getTime();
  const elapsedMinutes = Math.floor((now - created) / 60000);

  // Dynamic Threshold: Base 10m + 2m per 5 active orders (Simulation)
  const dynamicThreshold = 10 + Math.floor(activeOrdersCount / 5) * 2;
  // Hard Limit: 15m
  const hardLimit = 15;

  // Trigger if > 15m OR > Dynamic Threshold
  if (elapsedMinutes > hardLimit || elapsedMinutes > dynamicThreshold) {
    return elapsedMinutes;
  }
  return 0;
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
