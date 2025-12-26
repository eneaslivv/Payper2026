
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
        <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
          <div className="flex bg-black/40 border border-white/5 rounded-2xl p-10 items-center justify-center flex-col gap-3">
            <span className="material-symbols-outlined text-white/10 text-4xl">inbox</span>
            <p className="text-[10px] font-black text-white/20 uppercase tracking-widest italic">Caja no inicializada</p>
          </div>

          <div className="bg-white dark:bg-surface-dark rounded-2xl subtle-border shadow-soft overflow-hidden">
            <div className="p-6 border-b border-black/[0.02] dark:border-white/[0.02] flex justify-between items-center">
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] dark:text-white">Historial de Turnos</h3>
              <button className="text-[9px] font-bold text-text-secondary border border-black/[0.05] dark:border-white/[0.05] px-4 py-1.5 rounded-lg hover:bg-black/[0.02] uppercase tracking-widest transition-all">Reporte Completo</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/[0.01] dark:bg-white/[0.01] border-b border-black/[0.02] dark:border-white/[0.02]">
                    <th className="px-8 py-4 text-[9px] font-bold uppercase text-text-secondary tracking-widest">Apertura / Cierre</th>
                    <th className="px-8 py-4 text-[9px] font-bold uppercase text-text-secondary tracking-widest">Operador</th>
                    <th className="px-8 py-4 text-[9px] font-bold uppercase text-text-secondary tracking-widest">Volumen</th>
                    <th className="px-8 py-4 text-[9px] font-bold uppercase text-text-secondary tracking-widest">Recaudación</th>
                    <th className="px-8 py-4 text-[9px] font-bold uppercase text-text-secondary tracking-widest">Estado</th>
                    <th className="px-8 py-4 text-[9px] font-bold uppercase text-text-secondary tracking-widest text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/[0.02] dark:divide-white/[0.02]">
                  {sessions.map(session => (
                    <tr key={session.id} className="hover:bg-black/[0.01] dark:hover:bg-white/[0.01] transition-colors">
                      <td className="px-8 py-5">
                        <p className="text-[11px] font-bold dark:text-white uppercase leading-none mb-1">{session.opened_at.split(' ')[0]}</p>
                        <p className="text-[9px] text-text-secondary font-semibold uppercase">{session.opened_at.split(' ')[1]} - {session.closed_at?.split(' ')[1] || 'ACTIVO'}</p>
                      </td>
                      <td className="px-8 py-5 text-[11px] font-bold dark:text-white uppercase italic">{session.opened_by}</td>
                      <td className="px-8 py-5 text-[11px] font-bold dark:text-white">{session.total_orders} Pedidos</td>
                      <td className="px-8 py-5 text-[11px] font-black dark:text-white">${session.total_revenue.toLocaleString()}</td>
                      <td className="px-8 py-5">
                        <span className={`px-2 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-widest border ${session.status === 'open' ? 'bg-neon/5 text-neon border-neon/10' : 'bg-black/[0.03] text-text-secondary border-black/[0.03]'}`}>
                          {session.status === 'open' ? 'En Curso' : 'Finalizado'}
                        </span>
                      </td>
                      <td className="px-8 py-5 text-right">
                        <button className="text-text-secondary hover:text-neon transition-colors"><span className="material-symbols-outlined text-lg">description</span></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
