
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
    revenueToday: 0,
    loyaltyCost: 0 // Sum of monetary_cost from loyalty redemptions
  });
  const [performanceData, setPerformanceData] = useState<any[]>([]);

  // Advanced Chart & Expenses State (Migrated)
  const [chartFilter, setChartFilter] = useState<'total' | 'mercadopago' | 'cash' | 'wallet'>('total');
  const [fixedExpensesList, setFixedExpensesList] = useState<any[]>([]);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);
  const [topProducts, setTopProducts] = useState<any[]>([]); // Added correctly here

  const [expenseForm, setExpenseForm] = useState({
    name: '',
    amount: '',
    category: 'rent',
    description: ''
  });

  const handleRegisterExpense = async () => {
    if (!expenseForm.name || !expenseForm.amount) return alert('Nombre y monto requeridos');
    setIsSubmittingExpense(true);

    try {
      const { error } = await supabase.rpc('register_fixed_expense', {
        p_store_id: profile?.store_id,
        p_name: expenseForm.name,
        p_amount: Number(expenseForm.amount),
        p_category: expenseForm.category,
        p_description: expenseForm.description,
        p_date: new Date().toISOString(),
        p_is_recurring: false
      });

      if (error) throw error;

      alert('Gasto registrado correctamente');
      setShowExpenseModal(false);
      setExpenseForm({ name: '', amount: '', category: 'rent', description: '' });
      // Trigger refresh
      window.location.reload();
    } catch (err) {
      console.error('Error al registrar gasto:', err);
      alert('Error al registrar el gasto');
    } finally {
      setIsSubmittingExpense(false);
    }
  };

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

    const fetchAdvancedData = async () => {
      if (!profile?.store_id) return;

      try {
        // 1. Fetch Hourly Chart Data (RPC)
        const { data: chartData, error: chartError } = await supabase.rpc('get_financial_chart_data', {
          p_store_id: profile.store_id,
          p_start_date: dateRange.start.toISOString(),
          p_end_date: dateRange.end.toISOString()
        });

        if (chartError) console.error('Error chart:', chartError);
        setPerformanceData(chartData || []);

        // 1.5 Fetch Top Products
        const { data: topData, error: topError } = await supabase.rpc('get_top_products', {
          p_store_id: profile.store_id,
          p_start_date: dateRange.start.toISOString(),
          p_end_date: dateRange.end.toISOString()
        });
        if (topError) console.error('Error top products:', topError);
        setTopProducts(topData || []);

        // 2. Fetch Fixed Expenses
        const { data: expensesList } = await (supabase as any)
          .from('fixed_expenses')
          .select('*')
          .eq('store_id', profile.store_id)
          .gte('expense_date', dateRange.start.toISOString())
          .lte('expense_date', dateRange.end.toISOString())
          .order('expense_date', { ascending: false });

        setFixedExpensesList(expensesList || []);

        // 3. Fetch Loyalty Redemption Cost (COGS of redeemed rewards)
        const { data: loyaltyData } = await (supabase as any)
          .from('loyalty_transactions')
          .select('monetary_cost')
          .eq('store_id', profile.store_id)
          .eq('type', 'burn')
          .eq('is_rolled_back', false)
          .gte('created_at', dateRange.start.toISOString())
          .lte('created_at', dateRange.end.toISOString());

        const totalLoyaltyCost = (loyaltyData || []).reduce((sum: number, tx: any) => sum + (Number(tx.monetary_cost) || 0), 0);
        setMetrics(prev => ({ ...prev, loyaltyCost: totalLoyaltyCost }));

      } catch (err) {
        console.error('Error fetching advanced data:', err);
      }
    };

    fetchFinanceData();
    fetchAdvancedData();
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
            <FinanceCard label="Costo Lealtad" value={`$${metrics.loyaltyCost.toFixed(2)}`} trend={metrics.loyaltyCost > 0 ? 'Canjes activos' : '-'} type={metrics.loyaltyCost > 0 ? 'negative' : 'neutral'} icon="loyalty" />
            <FinanceCard label="Ajustes Stock" value="$0.00" trend="-" type="neutral" icon="inventory_2" />
          </div>

          <div className="lg:col-span-12 bg-[#141714] rounded-3xl border border-white/5 p-6 shadow-soft mb-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-lg font-black italic uppercase tracking-tighter text-white leading-none">FLUJO DE OPERACIONES</h3>
                <p className="text-[9px] font-black text-[#71766F] uppercase tracking-[0.2em] mt-1">ANÁLISIS DE INGRESOS POR CANAL</p>
              </div>
              <div className="flex gap-2">
                {['total', 'mercadopago', 'cash', 'wallet'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setChartFilter(filter as any)}
                    className={`px-4 py-1.5 rounded-lg text-[8px] font-black uppercase transition-all ${chartFilter === filter ? 'bg-neon/10 text-neon border border-neon/20 shadow-neon-soft' : 'text-[#71766F] border border-white/5 hover:text-white'}`}
                  >
                    {filter === 'total' ? 'TOTAL' : filter === 'mercadopago' ? 'MERCADO PAGO' : filter === 'cash' ? 'EFECTIVO' : 'WALLET'}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={performanceData}>
                  <defs>
                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00ff9d" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#00ff9d" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorMp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ffffff" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.02)" strokeDasharray="5 5" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#71766F', fontWeight: 800 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#141714', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: '10px' }} />

                  {chartFilter === 'total' && (
                    <Area type="monotone" dataKey="total_revenue" stroke="#00ff9d" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" animationDuration={1500} />
                  )}
                  {chartFilter === 'mercadopago' && (
                    <Area type="monotone" dataKey="mercadopago" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorMp)" animationDuration={1000} />
                  )}
                  {chartFilter === 'cash' && (
                    <>
                      <Area type="monotone" dataKey="cash_sales" stackId="1" stroke="#ffffff" strokeWidth={2} fillOpacity={1} fill="url(#colorCash)" name="Ventas Efectivo" />
                      <Area type="monotone" dataKey="cash_topups" stackId="1" stroke="#ffffff" strokeWidth={2} strokeDasharray="5 5" fill="transparent" name="Cargas Efectivo" />
                    </>
                  )}
                  {chartFilter === 'wallet' && (
                    <Area type="monotone" dataKey="wallet_sales" stroke="#8b5cf6" strokeWidth={3} fillOpacity={0.2} fill="#8b5cf6" name="Consumo Wallet" />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* FIXED EXPENSES SECTION */}
          <div className="lg:col-span-12 bg-[#141714] rounded-3xl border border-white/5 p-6 shadow-soft mb-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-black italic uppercase text-white">GASTOS FIJOS / RECURRENTES</h3>
                <p className="text-[9px] font-bold text-white/40 uppercase">ALQUILER, LUZ, SERVICIOS, SUELDOS</p>
              </div>
              <button
                onClick={() => setShowExpenseModal(true)}
                className="px-4 py-2 bg-white text-black font-black text-[10px] uppercase tracking-wider rounded-xl hover:bg-neon hover:scale-105 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                REGISTRAR GASTO
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* List */}
              <div className="col-span-1 md:col-span-1 lg:col-span-4 space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {fixedExpensesList.map(exp => (
                  <div key={exp.id} className="flex justify-between items-center p-3 rounded-xl bg-black/20 border border-white/5 hover:border-white/10 transition-colors group">
                    <div>
                      <p className="text-[10px] font-black uppercase text-white group-hover:text-neon transition-colors">{exp.name}</p>
                      <div className="flex gap-2 items-center">
                        <span className="text-[8px] font-bold text-white/40 uppercase bg-white/5 px-1.5 py-0.5 rounded">{exp.category}</span>
                        <span className="text-[8px] font-bold text-white/20 uppercase">{new Date(exp.expense_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <span className="text-sm font-black text-white">$ {exp.amount.toLocaleString()}</span>
                  </div>
                ))}
                {fixedExpensesList.length === 0 && (
                  <div className="flex items-center justify-center h-full border border-dashed border-white/10 rounded-xl p-4">
                    <p className="text-[10px] font-bold text-white/20 uppercase">No hay gastos fijos registrados en este periodo</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* MODAL */}
          {showExpenseModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
              <div className="bg-[#141714] border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
                <button
                  onClick={() => setShowExpenseModal(false)}
                  className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>

                <h3 className="text-xl font-black italic uppercase text-white mb-1">REGISTRAR GASTO FIJO</h3>
                <p className="text-[10px] text-white/40 font-bold uppercase mb-6">REGISTRO DE SALIDAS DE DINERO RECURRENTES</p>

                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] font-black uppercase text-white/60 mb-1.5 block">CONCEPTO / NOMBRE</label>
                    <input
                      type="text"
                      value={expenseForm.name}
                      onChange={e => setExpenseForm({ ...expenseForm, name: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-neon transition-colors"
                      placeholder="Ej: Alquiler Local"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black uppercase text-white/60 mb-1.5 block">MONTO</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 font-bold">$</span>
                        <input
                          type="number"
                          value={expenseForm.amount}
                          onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white font-bold outline-none focus:border-neon transition-colors"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-white/60 mb-1.5 block">CATEGORÍA</label>
                      <select
                        value={expenseForm.category}
                        onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-neon transition-colors appearance-none"
                      >
                        <option value="rent">ALQUILER</option>
                        <option value="utilities">SERVICIOS</option>
                        <option value="salaries">SUELDOS</option>
                        <option value="marketing_fixed">MARKETING FIJO</option>
                        <option value="software">SOFTWARE</option>
                        <option value="maintenance">MANTENIMIENTO</option>
                        <option value="other">OTROS</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase text-white/60 mb-1.5 block">DESCRIPCIÓN</label>
                    <textarea
                      value={expenseForm.description}
                      onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-bold outline-none focus:border-neon transition-colors h-24 resize-none"
                      placeholder="Detalles adicionales..."
                    />
                  </div>

                  <button
                    onClick={handleRegisterExpense}
                    disabled={isSubmittingExpense}
                    className="w-full bg-neon text-black font-black uppercase tracking-widest py-4 rounded-xl mt-4 hover:shadow-neon transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmittingExpense ? 'REGISTRANDO...' : 'CONFIRMAR GASTO'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
            {/* Main Chart Section (Takes 8 columns) */}
            <div className="lg:col-span-8 bg-[#141714] rounded-3xl border border-white/5 p-6 shadow-soft">
              {/* ... (Existing Chart Logic, already rendered above, we just need to wrap it correctly if layout changes) */}
              {/* NOTE: Since I am replacing a specific block below the chart, I will implement Top Products there for now, 
                   but usually this would be a sidebar. Let's put it as a secondary card. */}
            </div>
          </div>

          {/* Re-using the spot of "Origen de Pedidos" for Top Products */}
          <div className="lg:col-span-4 bg-[#141714] border border-white/5 p-6 rounded-3xl shadow-soft">
            <h3 className="text-lg font-black italic uppercase text-white mb-4">PRODUCTOS TOP</h3>
            <div className="space-y-3">
              {topProducts.length > 0 ? (
                topProducts.map((prod, idx) => (
                  <div key={idx} className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-3">
                      <span className={`text-lg font-black ${idx === 0 ? 'text-neon' : 'text-white/40'}`}>#{idx + 1}</span>
                      <div>
                        <p className="text-xs font-bold text-white uppercase">{prod.name}</p>
                        <p className="text-[9px] text-white/40 font-bold uppercase">{prod.quantity} unidades</p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-neon">$ {prod.total_sales.toLocaleString()}</span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center py-10 opacity-50">
                  <p className="text-[10px] uppercase font-bold text-white">Sin datos de ventas</p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <FinanceCashManager dateRange={dateRange} />
      )}
    </div>
  );
};

// --- SUB-COMPONENTS ---

/* Cash Manager Component */
import { useCashShift, Zone } from '../hooks/useCashShift';

const FinanceCashManager: React.FC<{
  dateRange: { start: string | Date; end: string | Date };
  onUpdate?: () => void;
}> = ({ dateRange, onUpdate }) => {
  const { zones, activeSessions, loading, openSession, closeSession } = useCashShift();

  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [isClosing, setIsClosing] = useState<string | null>(null); // sessionId being closed

  const handleAction = async () => {
    try {
      if (isClosing) {
        // Close Logic
        // Calculate expected cash from backend
        // @ts-ignore
        const { data: expectedData } = await supabase.rpc('get_session_expected_cash', { query_session_id: isClosing });
        const expected = Number(expectedData) || 0;

        await closeSession(isClosing, Number(amount), expected, "Cierre manual");
        setIsClosing(null);
        if (onUpdate) onUpdate(); // Trigger refresh
      } else if (selectedZone) {
        // Open Logic
        await openSession(selectedZone, Number(amount));
        setSelectedZone(null);
        if (onUpdate) onUpdate(); // Trigger refresh
      }
      setAmount('');
    } catch (err) {
      console.error('Action failed:', err);
      // alert('Error al procesar la acción');
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
          <CashShiftModal
            isClosing={!!isClosing}
            sessionId={isClosing}
            zoneId={selectedZone}
            onClose={() => { setSelectedZone(null); setIsClosing(null); }}
            onConfirm={async (amount, expected, notes) => {
              if (isClosing) {
                await closeSession(isClosing, amount, expected || 0, notes);
                setIsClosing(null);
                if (onUpdate) onUpdate();
              } else if (selectedZone) {
                await openSession(selectedZone, amount);
                setSelectedZone(null);
                if (onUpdate) onUpdate();
              }
            }}
          />
        )
      }

      {/* 3. SHIFTS HISTORY */}
      <CashAuditTable dateRange={dateRange} />


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

const CashShiftModal: React.FC<{
  isClosing: boolean;
  sessionId: string | null;
  zoneId: string | null;
  onClose: () => void;
  onConfirm: (amount: number, expected?: number, notes?: string) => void;
}> = ({ isClosing, sessionId, zoneId, onClose, onConfirm }) => {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [expectedCash, setExpectedCash] = useState<number | null>(null);
  const [loadingExpected, setLoadingExpected] = useState(false);

  useEffect(() => {
    if (isClosing && sessionId) {
      const fetchExpected = async () => {
        setLoadingExpected(true);
        // @ts-ignore
        const { data } = await supabase.rpc('get_session_expected_cash', { query_session_id: sessionId });
        setExpectedCash(data || 0);
        setLoadingExpected(false);
      };
      fetchExpected();
    }
  }, [isClosing, sessionId]);

  const realAmount = Number(amount) || 0;
  const expected = expectedCash || 0;
  const difference = realAmount - expected;
  const diffColor = difference === 0 ? 'text-white' : difference > 0 ? 'text-neon' : 'text-red-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#141414] border border-white/10 p-8 rounded-2xl w-full max-w-md shadow-2xl relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/20 hover:text-white transition-colors">
          <span className="material-symbols-outlined">close</span>
        </button>

        <h3 className="text-xl font-black uppercase italic text-white mb-2">
          {isClosing ? 'Cierre de Caja' : 'Apertura de Caja'}
        </h3>
        <p className="text-[11px] text-white/50 mb-6 uppercase tracking-wider">
          {isClosing ? 'Verifique el efectivo físico contra el sistema.' : 'Ingrese el monto inicial (Fondo).'}
        </p>

        <div className="space-y-6">
          {/* Comparison Display (Only for Closing) */}
          {isClosing && (
            <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-xl border border-white/5">
              <div>
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest block mb-1">Esperado (Sistema)</span>
                {loadingExpected ? (
                  <span className="text-sm text-white/20 animate-pulse">Calculando...</span>
                ) : (
                  <span className="text-xl font-black text-white/80">${expected.toLocaleString('es-AR')}</span>
                )}
              </div>
              <div className="text-right">
                <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest block mb-1">Diferencia</span>
                <span className={`text-xl font-black ${diffColor}`}>
                  {difference > 0 ? '+' : ''}${difference.toLocaleString('es-AR')}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="text-[9px] font-bold text-neon uppercase tracking-widest block mb-2">
              Monto {isClosing ? 'Real (Físico)' : 'Inicial'}
            </label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-white font-bold outline-none focus:border-neon/50 text-2xl"
              placeholder="0.00"
              autoFocus
            />
          </div>

          {isClosing && (
            <div>
              <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest block mb-2">Notas / Observaciones</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-white/20 min-h-[80px]"
                placeholder="Ej. Falta cambio, retiro parcial..."
              />
            </div>
          )}

          <button
            onClick={() => onConfirm(realAmount, expected, notes)}
            className="w-full py-4 rounded-xl bg-neon text-black font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-neon-soft group flex items-center justify-center gap-2"
          >
            {isClosing ? 'Confirmar Cierre' : 'Confirmar Apertura'}
            <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const CashAuditTable: React.FC<{ dateRange: { start: string | Date; end: string | Date } }> = ({ dateRange }) => {
  const [closures, setClosures] = useState<any[]>([]);
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClosures = async () => {
      if (!profile?.store_id) return;
      setLoading(true);

      const start = new Date(dateRange.start).toISOString();
      const end = new Date(dateRange.end).toISOString();

      try {
        const { data, error } = await supabase
          .from('cash_closures')
          .select(`
            *,
            session:cash_sessions (
              opened_at,
              zone:venue_zones(name),
              opener:profiles!opened_by(full_name),
              closer:profiles!closed_by(full_name)
            )
          `)
          .eq('store_id', profile.store_id)
          .gte('created_at', start)
          .lte('created_at', end)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setClosures(data || []);
      } catch (err) {
        console.error('Error loading audit:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchClosures();
  }, [profile?.store_id, dateRange]);

  if (loading) return <div className="p-8 text-center text-xs uppercase tracking-widest opacity-50 text-white">Cargando auditoría...</div>;

  if (closures.length === 0) {
    return (
      <div className="bg-white dark:bg-surface-dark rounded-2xl subtle-border shadow-soft p-8 text-center">
        <div className="flex flex-col items-center gap-3 opacity-50">
          <span className="material-symbols-outlined text-4xl">inbox</span>
          <p className="text-xs font-bold uppercase tracking-widest">No hay registros de cierre en este periodo</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-surface-dark rounded-2xl subtle-border shadow-soft overflow-hidden">
      <div className="p-6 border-b border-white/5 flex justify-between items-center bg-black/20">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] dark:text-white mb-1">Registro de Cierres de Caja</h3>
          <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Auditoría Financiera</span>
        </div>
        <button className="px-4 py-2 rounded-lg bg-white/5 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-colors text-white">
          Exportar CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-black/40 text-[9px] font-black uppercase tracking-widest text-white/40">
            <tr>
              <th className="px-6 py-4">Fecha / Hora</th>
              <th className="px-6 py-4">Zona / Caja</th>
              <th className="px-6 py-4">Responsables</th>
              <th className="px-6 py-4 text-right">Sistema (Esp)</th>
              <th className="px-6 py-4 text-right">Real (Físico)</th>
              <th className="px-6 py-4 text-right">Diferencia</th>
              <th className="px-6 py-4">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 text-[11px] font-medium text-white/70">
            {closures.map((record) => {
              // Difference calculation is stored in DB generated column, but we can compute or use it.
              // Assuming record.difference is available or we compute it.
              const diff = record.difference ?? (record.real_cash - record.expected_cash);
              const isPositive = diff >= 0;
              const isPerfect = diff === 0;

              return (
                <tr key={record.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-white font-bold">
                        {new Date(record.created_at).toLocaleDateString()}
                      </span>
                      <span className="text-[9px] opacity-50">
                        {new Date(record.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-white/20"></span>
                      <span className="font-bold text-white">{record.session?.zone?.name || 'Zona Eliminada'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[10px] text-neon">lock_open</span>
                        <span className="text-[10px]">{record.session?.opener?.full_name?.split(' ')[0]}</span>
                      </div>
                      <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        <span className="material-symbols-outlined text-[10px] text-red-400">lock</span>
                        <span className="text-[10px]">{record.session?.closer?.full_name?.split(' ')[0] || 'Auto'}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-white/50">
                    ${record.expected_cash?.toLocaleString('es-AR')}
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-white">
                    ${record.real_cash?.toLocaleString('es-AR')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className={`font-mono font-black px-2 py-1 rounded-md text-[10px] ${isPerfect ? 'bg-white/5 text-white/50' : isPositive ? 'bg-neon/10 text-neon' : 'bg-red-500/10 text-red-500'}`}>
                      {diff > 0 ? '+' : ''}${diff?.toLocaleString('es-AR')}
                    </span>
                  </td>
                  <td className="px-6 py-4 max-w-[200px] truncate opacity-50 italic">
                    {record.notes || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Finance;
