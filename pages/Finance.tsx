
import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';
import { CashRegisterSession } from '../types';
import DateRangeSelector from '../components/DateRangeSelector';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const PIE_COLORS = ['#4ADE80', '#B4965C', '#3B4D35'];

const Finance: React.FC = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'analytics' | 'caja'>('analytics');
  const [sessions] = useState<CashRegisterSession[]>([]);
  const [dateRange, setDateRange] = useState({ start: new Date(), end: new Date() });
  const [isLoading, setIsLoading] = useState(true);

  // Real metrics state
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    avgTicket: 0,
    orderCount: 0,
    revenueToday: 0
  });
  const [performanceData, setPerformanceData] = useState<any[]>([]);

  // Fetch real data from Supabase
  useEffect(() => {
    const fetchFinanceData = async () => {
      if (!profile?.store_id) return;
      setIsLoading(true);

      try {
        // Get today's date range
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
        const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

        // Fetch orders for the store
        const { data: orders, error } = await supabase
          .from('orders')
          .select('total_amount, created_at, status')
          .eq('store_id', profile.store_id)
          .gte('created_at', startOfDay)
          .lte('created_at', endOfDay);

        if (error) throw error;

        // Calculate metrics
        const completedOrders = orders?.filter(o => o.status !== 'cancelled') || [];
        const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const orderCount = completedOrders.length;
        const avgTicket = orderCount > 0 ? totalRevenue / orderCount : 0;

        setMetrics({
          totalRevenue,
          avgTicket,
          orderCount,
          revenueToday: totalRevenue
        });

        // Generate performance data by hour
        const hourlyData: Record<string, number> = {};
        completedOrders.forEach(o => {
          const hour = new Date(o.created_at).getHours();
          const key = `${hour.toString().padStart(2, '0')}:00`;
          hourlyData[key] = (hourlyData[key] || 0) + (o.total_amount || 0);
        });

        const chartData = Object.entries(hourlyData).map(([date, revenue]) => ({
          date,
          revenue
        })).sort((a, b) => a.date.localeCompare(b.date));

        setPerformanceData(chartData);

      } catch (err) {
        console.error('Finance data fetch error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchFinanceData();
  }, [profile?.store_id, dateRange]);

  return (
    <div className="p-6 md:p-10 space-y-10 max-w-[1400px] mx-auto animate-in fade-in duration-700 pb-32">
      {/* Header Táctico */}
      <header className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-neon/60 font-bold text-[10px] uppercase tracking-[0.3em]">
            <span className="size-1 rounded-full bg-neon shadow-neon-soft"></span>
            Financial Intelligence Unit
          </div>
          <h1 className="text-4xl italic-black tracking-tighter text-text-main dark:text-white uppercase leading-none">
            Panel <span className="text-neon/80">Financiero</span>
          </h1>
          <p className="text-text-secondary text-xs font-semibold opacity-50 uppercase tracking-widest mt-2">Análisis de rentabilidad y cierres de caja</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-start md:items-end w-full xl:w-auto">
          <DateRangeSelector onRangeChange={(start, end) => setDateRange({ start, end })} />

          <div className="flex bg-white dark:bg-surface-dark p-1 rounded-xl border border-black/[0.04] dark:border-white/[0.04] shadow-soft h-fit">
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'analytics' ? 'bg-primary dark:bg-neon/10 text-white dark:text-neon border border-primary dark:border-neon/20' : 'text-text-secondary hover:text-primary dark:hover:text-neon'}`}
            >
              Ventas
            </button>
            <button
              onClick={() => setActiveTab('caja')}
              className={`px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'caja' ? 'bg-primary dark:bg-neon/10 text-white dark:text-neon border border-primary dark:border-neon/20' : 'text-text-secondary hover:text-primary dark:hover:text-neon'}`}
            >
              Caja y Turnos
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'analytics' ? (
        <>
          {/* KPI Cards with Real Data */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <FinanceCard
              label="Ingresos Hoy"
              value={`$${metrics.revenueToday.toFixed(2)}`}
              trend={metrics.orderCount > 0 ? `${metrics.orderCount} pedidos` : '-'}
              type={metrics.revenueToday > 0 ? 'positive' : 'neutral'}
              icon="payments"
            />
            <FinanceCard
              label="Ticket Promedio"
              value={`$${metrics.avgTicket.toFixed(2)}`}
              trend="-"
              type="neutral"
              icon="receipt_long"
            />
            <FinanceCard label="Costo Lealtad" value="$0.00" trend="-" type="neutral" icon="loyalty" />
            <FinanceCard label="Ajustes Stock" value="$0.00" trend="-" type="neutral" icon="inventory_2" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white dark:bg-surface-dark p-8 rounded-2xl subtle-border shadow-soft">
              <div className="flex justify-between items-center mb-10">
                <h3 className="text-xs font-bold uppercase tracking-[0.2em] dark:text-white">Rendimiento Temporal</h3>
                <span className="text-[9px] font-black text-neon uppercase italic tracking-widest">Datos en tiempo real</span>
              </div>
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={performanceData}>
                    <defs>
                      <linearGradient id="financeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4ADE80" stopOpacity={0.05} />
                        <stop offset="95%" stopColor="#4ADE80" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.02)" strokeDasharray="5 5" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#71766F', fontSize: 9, fontWeight: 600 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#71766F', fontSize: 9 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#141714', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', fontSize: '10px', color: '#fff' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#4ADE80" strokeWidth={2} fillOpacity={1} fill="url(#financeGradient)" dot={{ r: 3, fill: '#4ADE80' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-4 bg-white dark:bg-surface-dark p-8 rounded-2xl subtle-border shadow-soft">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] dark:text-white mb-10 text-center">Origen de Pedidos</h3>
              <div className="h-64 w-full flex items-center justify-center">
                <p className="text-[10px] font-black text-white/10 uppercase tracking-widest italic">Sin datos de origen</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <FinanceCashManager />
      )}
    </div>
  );
};

// --- SUB-COMPONENTS ---

/* Cash Manager Component */
import { useCashShift, Zone } from '../hooks/useCashShift';

const FinanceCashManager: React.FC = () => {
  const { zones, activeSessions, loading, openSession, closeSession } = useCashShift();
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [isClosing, setIsClosing] = useState<string | null>(null); // sessionId being closed

  const handleAction = async () => {
    try {
      if (isClosing) {
        // Close Logic
        // TODO: Calculate expected cash based on orders linked to this session (Future Step)
        const expected = 0;
        await closeSession(isClosing, Number(amount), expected, "Cierre manual");
        setIsClosing(null);
      } else if (selectedZone) {
        // Open Logic
        await openSession(selectedZone, Number(amount));
        setSelectedZone(null);
      }
      setAmount('');
    } catch (e) {
      console.error(e);
      alert('Error al procesar la acción');
    }
  };

  if (loading) return <div className="text-white">Cargando datos operativos...</div>;

  return (
    <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">

      {/* 1. ZONES GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {zones.map(zone => {
          const session = activeSessions.find(s => s.zone_id === zone.id);
          const isActive = !!session;
          const hasPendingOrders = (session?.pending_orders_count || 0) > 0;

          // Status Visualization Logic
          let statusColor = 'border-black/5 dark:border-white/5 bg-white dark:bg-surface-dark opacity-60'; // Closed
          let statusDot = 'bg-red-500';
          let shadow = '';

          if (isActive) {
            if (hasPendingOrders) {
              statusColor = 'bg-[#1a0505] border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)] animate-pulse-slow';
              statusDot = 'bg-red-500 animate-ping';
              shadow = 'shadow-[0_0_30px_rgba(239,68,68,0.2)]';
            } else {
              statusColor = 'bg-[#051a05] border-neon/50 shadow-[0_0_20px_rgba(74,222,128,0.1)]';
              statusDot = 'bg-neon animate-pulse';
            }
          }

          return (
            <div key={zone.id} className={`p-6 rounded-2xl border transition-all relative overflow-hidden group ${statusColor}`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-black uppercase italic-black tracking-tight dark:text-white mb-1">{zone.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{zone.type}</span>
                    {isActive && (
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${hasPendingOrders ? 'bg-red-500 text-white' : 'bg-neon/10 text-neon'}`}>
                        {hasPendingOrders ? 'BUSY' : 'OPEN'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="relative">
                  <div className={`size-3 rounded-full ${isActive ? (hasPendingOrders ? 'bg-red-500' : 'bg-neon') : 'bg-bg-dark'}`}></div>
                  {isActive && <div className={`absolute inset-0 size-3 rounded-full ${statusDot} opacity-75`}></div>}
                </div>
              </div>

              {isActive ? (
                <div className="space-y-6">
                  {/* Timer & Operator */}
                  <div className="flex justify-between items-center pb-4 border-b border-white/5">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-1">Operador</span>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-neon">verified_user</span>
                        <span className="text-xs font-bold text-white uppercase">{session?.opener?.full_name || 'Staff'}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-1">Tiempo Activo</span>
                      {/* Simple Duration Calc (Could be extracted to component for real-time tick) */}
                      <SessionTimer openedAt={session.opened_at} />
                    </div>
                  </div>

                  {/* Pending Orders Alert */}
                  {hasPendingOrders && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between animate-pulse">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-red-500">notifications_active</span>
                        <span className="text-xs font-black text-red-500 uppercase tracking-widest">Pedidos Pendientes</span>
                      </div>
                      <span className="text-xl font-black text-white">{session?.pending_orders_count}</span>
                    </div>
                  )}

                  <button
                    onClick={() => setIsClosing(session.id)}
                    className="w-full py-3 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-500 border border-white/5 hover:border-red-500/30 text-[10px] font-black uppercase tracking-widest transition-all mb-0"
                  >
                    Cerrar Caja
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectedZone(zone.id)}
                  className="w-full mt-4 py-3 rounded-xl bg-black/[0.02] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-text-secondary hover:text-white hover:bg-neon/10 hover:border-neon/30 transition-all"
                >
                  Abrir Caja
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 2. ACTION MODAL (Simple Inline for now) */}
      {
        (selectedZone || isClosing) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
            <div className="bg-[#141414] border border-white/10 p-8 rounded-2xl w-full max-w-md shadow-2xl relative">
              <button onClick={() => { setSelectedZone(null); setIsClosing(null); }} className="absolute top-4 right-4 text-white/20 hover:text-white"><span className="material-symbols-outlined">close</span></button>

              <h3 className="text-xl font-black uppercase italic text-white mb-2">
                {isClosing ? 'Cierre de Caja' : 'Apertura de Caja'}
              </h3>
              <p className="text-[11px] text-white/50 mb-6 uppercase tracking-wider">
                {isClosing ? 'Ingrese el monto real en efectivo contado.' : 'Ingrese el monto inicial de apertura.'}
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-bold text-neon uppercase tracking-widest block mb-2">Monto ({isClosing ? 'Real' : 'Inicial'})</label>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-neon/50 text-lg"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>

                <button
                  onClick={handleAction}
                  className="w-full py-4 rounded-xl bg-neon text-black font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-neon-soft mt-4"
                >
                  {isClosing ? 'Confirmar Cierre' : 'Confirmar Apertura'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* 3. SHIFTS HISTORY (Existing table, reused) */}
      <div className="bg-white dark:bg-surface-dark rounded-2xl subtle-border shadow-soft overflow-hidden opacity-50 pointer-events-none grayscale">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/50">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] dark:text-white">Historial Auditado (Próximamente)</h3>
          <span className="text-[9px] font-black text-neon/40 uppercase tracking-widest">Requiere Cierres Reales</span>
        </div>
      </div>


    </div >
  );
};

const SessionTimer: React.FC<{ openedAt: string }> = ({ openedAt }) => {
  const [duration, setDuration] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const start = new Date(openedAt);
      const diff = now.getTime() - start.getTime();

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      setDuration(`${hours}h ${minutes}m`);
    };

    update();
    const interval = setInterval(update, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [openedAt]);

  return <span className="text-xs font-bold text-white uppercase tracking-tight">{duration}</span>;
};

const FinanceCard: React.FC<{ label: string, value: string, trend: string, type: 'positive' | 'negative' | 'neutral', icon: string }> = ({ label, value, trend, type, icon }) => (
  <div className="bg-white dark:bg-surface-dark p-6 rounded-2xl subtle-border shadow-soft group transition-all hover:-translate-y-1">
    <div className="flex items-center gap-4 mb-4">
      <div className={`size-10 rounded-xl flex items-center justify-center ${type === 'positive' ? 'bg-neon/10 text-neon' : type === 'negative' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'}`}>
        <span className="material-symbols-outlined text-lg">{icon}</span>
      </div>
      <div>
        <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest mb-0.5">{label}</p>
        <h3 className="text-xl font-bold text-text-main dark:text-white tracking-tight italic">{value}</h3>
      </div>
    </div>
    <div className={`flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-widest ${type === 'positive' ? 'text-neon' : type === 'negative' ? 'text-primary' : 'text-accent'}`}>
      <span className="material-symbols-outlined text-[12px]">{type === 'positive' ? 'trending_up' : type === 'negative' ? 'trending_down' : 'sync'}</span>
      {trend}
    </div>
  </div>
);

export default Finance;
