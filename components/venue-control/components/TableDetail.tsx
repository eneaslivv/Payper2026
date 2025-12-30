import React, { useState } from 'react';
import { Table, OrderStatus, TableStatus, AppMode } from '../types';
import { ORDER_STATUS_COLORS, STATUS_COLORS } from '../constants';
import { X, Plus, MoveHorizontal, CreditCard, CheckCircle2, Clock, BarChart3, Receipt, History as HistoryIcon, ArrowLeft, Banknote, QrCode, Check, AlertCircle, Loader2 } from 'lucide-react';
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
  onUpdateOrder: (id: string, orderId: string, status: OrderStatus) => void;
  onUpdateProperty: (prop: string, val: any) => void;
}

const TableDetail: React.FC<TableDetailProps> = ({ table, mode, onClose, onUpdateStatus, onUpdateOrder, onUpdateProperty }) => {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'active' | 'history' | 'analytics'>('active');
  const [view, setView] = useState<'details' | 'checkout' | 'closing' | 'qr'>('details');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'qr'>('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [qrHash, setQrHash] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const handleGenerateQR = async () => {
    if (!profile?.store_id) {
      addToast('Error de Seguridad', 'error', 'No se identificó el Store ID');
      return;
    }

    setLoadingQr(true);
    setView('qr');

    try {
      // 1. Check if exists
      const { data: existing, error: fetchError } = await supabase
        .from('qr_links' as any)
        .select('hash')
        .eq('store_id', profile.store_id)
        .eq('node_id', table.id)
        .maybeSingle();

      if (existing) {
        setQrHash((existing as any).hash);
      } else {
        // 2. Generate and Insert
        const newHash = btoa(`${profile.store_id}-${table.id}-${Date.now()}`).replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);

        const { error: insertError } = await supabase
          .from('qr_links' as any)
          .insert({
            store_id: profile.store_id,
            node_id: table.id,
            hash: newHash,
            type: 'TABLE',
            is_active: true
          });

        if (insertError) throw insertError;
        setQrHash(newHash);
      }
    } catch (e: any) {
      console.error('QR Error:', e);
      addToast('Error QR', 'error', e.message);
      setView('details');
    } finally {
      setLoadingQr(false);
    }
  };

  const isEditMode = mode === AppMode.EDIT;
  const activeOrders = table.orders.filter(o => o.status !== OrderStatus.DELIVERED);
  const deliveredOrders = table.orders.filter(o => o.status === OrderStatus.DELIVERED);

  const subtotal = table.totalAmount;
  const serviceCharge = subtotal * 0.1;
  const total = subtotal + serviceCharge;

  const handleProcessPayment = () => {
    setIsProcessing(true);
    setTimeout(() => {
      onUpdateStatus(table.id, TableStatus.FREE);
      setIsProcessing(false);
      onClose();
    }, 1500);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

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
              <span className="text-xl font-black text-white italic tabular-nums">${subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-end border-b border-zinc-900/50 pb-4">
              <span className="text-[10px] font-black text-zinc-600 uppercase tracking-widest">Servicio (10%)</span>
              <span className="text-xl font-black text-white italic tabular-nums">${serviceCharge.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-[10px] font-black text-[#36e27b] uppercase tracking-[0.3em]">Total a Cobrar</span>
              <span className="text-4xl font-black text-[#36e27b] tracking-tighter tabular-nums italic">${total.toLocaleString()}</span>
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
            <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">¿Liberar Mesa?</h3>
            <p className="text-zinc-500 text-xs font-medium max-w-[240px]">Esta acción borrará todos los pedidos activos y pondrá la mesa disponible inmediatamente.</p>
          </div>
          <div className="flex flex-col w-full gap-3">
            <button
              onClick={() => { onUpdateStatus(table.id, TableStatus.FREE); onClose(); }}
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

        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-8">
          {loadingQr ? (
            <div className="flex flex-col items-center gap-4 animate-pulse">
              <Loader2 size={48} className="text-[#36e27b] animate-spin" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[#36e27b]">Generando Enlace...</p>
            </div>
          ) : (
            <>
              <div className="bg-white p-6 rounded-3xl border-4 border-[#36e27b] shadow-[0_0_50px_rgba(54,226,123,0.3)]">
                {qrHash && (
                  <QRCode
                    value={`${getAppUrl()}/menu?t=${qrHash}`}
                    size={200}
                    viewBox={`0 0 256 256`}
                  />
                )}
              </div>

              <div className="space-y-2">
                <p className="text-zinc-500 text-[9px] font-black uppercase tracking-[0.2em]">Enlace Permanente</p>
                <div className="p-3 bg-zinc-900 rounded-xl border border-zinc-800 text-[10px] font-mono text-zinc-400 break-all max-w-[280px]">
                  {getAppUrl()}/menu?t={qrHash}
                </div>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${getAppUrl()}/menu?t=${qrHash}`);
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
                <div className="flex flex-col gap-1">
                  <input
                    type="text"
                    value={table.name}
                    onChange={(e) => onUpdateProperty('name', e.target.value)}
                    className="bg-black border border-zinc-800 rounded-lg px-2 py-1 text-xl font-black text-[#36e27b] uppercase focus:border-[#36e27b] outline-none w-full"
                  />
                  {editButton}
                </div>
              ) : (
                <>
                  <h3 className="text-2xl font-black tracking-tighter text-white italic leading-tight">{table.name}</h3>
                  <p className="text-[9px] text-zinc-600 font-black uppercase tracking-[0.2em] opacity-60">Nodo {table.id.toUpperCase()} • Cap. {table.capacity}</p>
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-zinc-500 hover:text-white bg-zinc-900/30 rounded-2xl transition-all border border-zinc-800">
            <X size={18} />
          </button>
        </div>

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
            <div className="grid grid-cols-2 gap-3">
              <ActionButton icon={<Plus size={16} />} label="Pedido" />
              <ActionButton icon={<MoveHorizontal size={16} />} label="Mover" />
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
                {activeOrders.length > 0 ? (
                  activeOrders.map((order) => (
                    <div key={order.id} className="bg-[#080808] border border-zinc-900/50 p-4 rounded-2xl flex items-center justify-between group hover:border-[#36e27b]/20 transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center text-zinc-500 group-hover:text-[#36e27b] transition-colors">
                          <Receipt size={16} />
                        </div>
                        <div>
                          <p className="text-white text-xs font-bold uppercase tracking-tight">{order.name} <span className="text-zinc-600 ml-1">x{order.quantity}</span></p>
                          <span className={`text-[7px] px-2 py-0.5 border rounded-full font-black uppercase tracking-widest mt-1 inline-block ${ORDER_STATUS_COLORS[order.status]}`}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => onUpdateOrder(table.id, order.id, OrderStatus.READY)}
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
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <h4 className="text-[9px] font-black uppercase tracking-widest text-zinc-600 italic border-b border-zinc-900 pb-4">Archivo de Pedidos</h4>
            <div className="space-y-2">
              {deliveredOrders.length > 0 ? (
                deliveredOrders.map((order) => (
                  <div key={order.id} className="bg-zinc-900/20 border border-zinc-900 p-4 rounded-2xl flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center text-zinc-600">
                        <CheckCircle2 size={16} />
                      </div>
                      <div>
                        <p className="text-zinc-400 text-xs font-bold uppercase">{order.name} <span className="text-zinc-700 ml-1">x{order.quantity}</span></p>
                        <span className="text-[7px] text-zinc-700 font-bold uppercase tracking-widest">Entregado</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-zinc-600">${(order.price * order.quantity).toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-zinc-700">
                  <HistoryIcon size={24} className="mx-auto mb-3 opacity-20" />
                  <p className="text-[8px] font-black uppercase tracking-widest">Sin datos históricos</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-2 gap-3">
              <MetricCard label="Ticket Promedio" value={`$4.2k`} />
              <MetricCard label="Duración" value="52m" />
            </div>

            <div className="p-6 bg-[#080808] border border-zinc-900 rounded-3xl space-y-6">
              <h4 className="text-[9px] font-black uppercase tracking-widest text-zinc-600 italic">Pulso de Volumen</h4>
              <div className="space-y-4">
                {[
                  { name: 'Fernet', val: 82, trend: '+12%' },
                  { name: 'Gin 47', val: 64, trend: '+8%' },
                  { name: 'Sushi T', val: 32, trend: '-2%' }
                ].map((item, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between text-[8px] font-black uppercase tracking-widest">
                      <span className="text-zinc-500">{item.name}</span>
                      <span className="text-[#36e27b]">{item.trend}</span>
                    </div>
                    <div className="w-full h-1 bg-black rounded-full overflow-hidden">
                      <div style={{ width: `${item.val}%` }} className="h-full bg-[#36e27b]"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-black border-t border-zinc-900">
        <button className="w-full py-3 bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl transition-all border border-zinc-800">
          Imprimir Factura Provisoria
        </button>
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
