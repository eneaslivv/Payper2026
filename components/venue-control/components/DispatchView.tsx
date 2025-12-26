
import React from 'react';
import { Table, OrderStatus, OrderItem } from '../types';
import { ORDER_STATUS_COLORS } from '../constants';
import { CheckCircle2, AlertTriangle, Clock, Filter, ChefHat } from 'lucide-react';

interface DispatchViewProps {
  tables: Table[];
  onOrderAction: (tableId: string, orderId: string, status: OrderStatus) => void;
}

const DispatchView: React.FC<DispatchViewProps> = ({ tables, onOrderAction }) => {
  const pendingOrders = tables.flatMap(t => 
    t.orders
      .filter(o => o.status !== OrderStatus.DELIVERED && o.status !== OrderStatus.CANCELLED)
      .map(o => ({ ...o, tableName: t.name, tableId: t.id }))
  ).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return (
    <div className="h-full flex flex-col gap-10">
      <div className="flex items-center justify-between bg-[#080808] p-6 rounded-[40px] border border-zinc-900 shadow-2xl">
        <div className="flex items-center gap-6">
           <button className="px-6 py-3 bg-zinc-900/50 text-zinc-400 rounded-2xl border border-zinc-800 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 hover:text-white transition-all">
             <Filter size={16} /> Filter: Global Despacho
           </button>
           <span className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.2em] italic">{pendingOrders.length} ACTIVE COMMANDS</span>
        </div>
        <div className="flex items-center gap-3">
           <div className="w-2 h-2 rounded-full bg-[#36e27b] animate-ping"></div>
           <span className="text-[10px] font-black tracking-widest text-zinc-500 uppercase">System Integrated</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8 content-start overflow-y-auto custom-scrollbar pr-4">
        {pendingOrders.map((order) => (
          <div key={order.id} className="bg-[#080808] border border-zinc-900 rounded-[48px] overflow-hidden flex flex-col shadow-2xl group hover:border-[#36e27b]/20 transition-all">
             <div className="p-8 bg-zinc-950 flex items-center justify-between border-b border-zinc-900">
                <div className="flex flex-col">
                  <span className="text-2xl font-black text-white italic tracking-tighter">{order.tableName}</span>
                  <span className="text-[8px] text-zinc-600 font-black uppercase tracking-[0.3em] mt-1">Order #{order.id.slice(0, 4)}</span>
                </div>
                <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-[#36e27b]">
                  <Clock size={18} />
                </div>
             </div>
             
             <div className="p-8 flex-1 space-y-6">
                <div className="flex items-start justify-between">
                  <h5 className="text-xl font-black text-white uppercase tracking-tight leading-none">{order.name}</h5>
                  <span className="text-4xl font-black text-[#36e27b] opacity-20 group-hover:opacity-100 transition-opacity">x{order.quantity}</span>
                </div>

                <div className={`text-[9px] px-3 py-1.5 rounded-full border inline-block font-black uppercase tracking-widest ${ORDER_STATUS_COLORS[order.status]}`}>
                  {order.status}
                </div>
             </div>

             <div className="p-4 bg-zinc-950/50 grid grid-cols-2 gap-3">
                <button 
                  onClick={() => onOrderAction(order.tableId, order.id, OrderStatus.PREPARING)}
                  className="flex flex-col items-center justify-center gap-2 py-6 bg-zinc-900 hover:bg-amber-500/[0.05] text-zinc-600 hover:text-amber-400 rounded-[32px] text-[8px] font-black uppercase tracking-widest transition-all border border-zinc-900 hover:border-amber-900/30"
                >
                  <Clock size={18} /> Prepare
                </button>
                <button 
                  onClick={() => onOrderAction(order.tableId, order.id, OrderStatus.READY)}
                  className="flex flex-col items-center justify-center gap-2 py-6 bg-zinc-900 hover:bg-[#36e27b]/[0.05] text-zinc-600 hover:text-[#36e27b] rounded-[32px] text-[8px] font-black uppercase tracking-widest transition-all border border-zinc-900 hover:border-[#36e27b]/30"
                >
                  <CheckCircle2 size={18} /> Deliver
                </button>
                <button 
                  onClick={() => onOrderAction(order.tableId, order.id, OrderStatus.CANCELLED)}
                  className="col-span-2 flex items-center justify-center gap-4 py-4 bg-black/40 hover:bg-rose-500/[0.05] text-zinc-700 hover:text-rose-400 rounded-[28px] text-[8px] font-black uppercase tracking-widest transition-all border border-zinc-900/50"
                >
                  <AlertTriangle size={16} /> Stock Conflict
                </button>
             </div>
          </div>
        ))}

        {pendingOrders.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center py-40 bg-[#080808] rounded-[64px] border border-zinc-900 border-dashed">
             <ChefHat size={80} className="mb-8 text-zinc-900" />
             <p className="text-2xl font-black italic text-zinc-800 uppercase tracking-[0.5em]">Clear Kitchen</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DispatchView;
