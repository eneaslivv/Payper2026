import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { CashRegisterSession } from '../types';
import DateRangeSelector from '../components/DateRangeSelector';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useCashShift, Zone } from '../hooks/useCashShift';
import { safeQuery } from '../src/lib/pagination';

const AreaChart = React.lazy(() => import('recharts').then((mod) => ({ default: mod.AreaChart })));
const Area = React.lazy(() => import('recharts').then((mod) => ({ default: mod.Area })));
const XAxis = React.lazy(() => import('recharts').then((mod) => ({ default: mod.XAxis })));
const CartesianGrid = React.lazy(() => import('recharts').then((mod) => ({ default: mod.CartesianGrid })));
const Tooltip = React.lazy(() => import('recharts').then((mod) => ({ default: mod.Tooltip })));
const ResponsiveContainer = React.lazy(() => import('recharts').then((mod) => ({ default: mod.ResponsiveContainer })));

const PIE_COLORS = ['#4ADE80', '#B4965C', '#3B4D35'];

const Finance: React.FC = () => {
  const { profile } = useAuth();
  const location = useLocation();

  // Tab sync from query params
  const [activeTab, setActiveTab] = useState<'analytics' | 'caja'>(() => {
    const params = new URLSearchParams(location.search);
    return params.get('tab') === 'caja' ? 'caja' : 'analytics';
  });

  // Sync tab if URL changes without unmount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab === 'caja' || tab === 'analytics') {
      setActiveTab(tab as any);
    }
  }, [location.search]);

  const [sessions] = useState<CashRegisterSession[]>([]);
  const [dateRange, setDateRange] = useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  });
  const [isLoading, setIsLoading] = useState(true);

  // Real metrics state
  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    avgTicket: 0,
    orderCount: 0,
    revenueToday: 0,
    topupsToday: 0, // NEW
    totalLiability: 0, // NEW
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
        p_is_recurring: false,
        p_recurrence_frequency: 'monthly'
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

        // 1. Fetch orders for the store (with pagination limit)
        const { data: orders, error } = await safeQuery(
          supabase
            .from('orders')
            .select('total_amount, created_at, status')
            .eq('store_id', profile.store_id)
            .gte('created_at', startOfDay)
            .lte('created_at', endOfDay)
        );

        if (error) throw error;

        // 2. Fetch Wallet Top-ups for today (with pagination limit)
        const { data: topups, error: topupError } = await safeQuery(
          (supabase as any)
            .from('wallet_ledger')
            .select('amount')
            .eq('store_id', profile.store_id)
            .gte('created_at', startOfDay)
            .lte('created_at', endOfDay)
            .eq('entry_type', 'topup')
        );

        if (topupError) console.error('Error fetching topups', topupError);

        // 3. Fetch Total Wallet Liability (All clients balance - with pagination limit)
        const { data: clientsData, error: clientError } = await safeQuery(
          supabase
            .from('clients')
            .select('wallet_balance')
            .eq('store_id', profile.store_id)
        );

        if (clientError) console.error('Error fetching clients liability', clientError);

        // Calculate metrics - use canonical revenue filter (matches is_revenue_order() in DB)
        const NON_REVENUE_STATUSES = ['draft', 'pending', 'cancelled', 'refunded', 'rejected'];
        const completedOrders = orders?.filter(o => !NON_REVENUE_STATUSES.includes(o.status)) || [];
        const totalSales = completedOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        const totalTopups = (topups || []).reduce((sum: number, t: any) => sum + (Number(t.amount) || 0), 0);
        const totalLiability = (clientsData || []).reduce((sum, c) => sum + (c.wallet_balance || 0), 0);

        const orderCount = completedOrders.length;
        const avgTicket = orderCount > 0 ? totalSales / orderCount : 0;

        setMetrics({
          totalRevenue: totalSales, // Keep as Sales Volume
          avgTicket,
          orderCount,
          revenueToday: totalSales,
          topupsToday: totalTopups, // New Metric
          totalLiability, // New Metric
          loyaltyCost: metrics.loyaltyCost // Preserve existing if not updated here (it is updated in advanced)
        });

        // Generate performance data by hour (Client Side fallback)
        const hourlyData: Record<string, number> = {};
        completedOrders.forEach(o => {
          const hour = new Date(o.created_at).getHours();
          const key = `${hour.toString().padStart(2, '0')}:00`;
          hourlyData[key] = (hourlyData[key] || 0) + (o.total_amount || 0);
        });

        const chartData = Object.entries(hourlyData).map(([timeStr, revenue]) => ({
          name: timeStr, // Recharts XAxis key (e.g., "14:00")
          total_revenue: revenue, // Match Area dataKey
          // Add other keys as 0 for safety/tooltip
          mercadopago: 0,
          cash_sales: 0,
          wallet_sales: 0,
          cash_topups: 0,
          transfer_topups: 0
        })).sort((a, b) => a.name.localeCompare(b.name));

        // Note: RPC will overwrite this, but good for initial load
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

        if (chartError) {
          console.error('Error chart:', chartError);
        } else if (chartData && Array.isArray(chartData) && chartData.length > 0) {
          setPerformanceData(chartData);
        }

        // 1.5 Fetch Top Products
        const { data: topData, error: topError } = await supabase.rpc('get_top_products', {
          p_store_id: profile.store_id,
          p_start_date: dateRange.start.toISOString(),
          p_end_date: dateRange.end.toISOString()
        });
        if (topError) console.error('Error top products:', topError);
        setTopProducts(topData || []);

        // 2. Fetch Fixed Expenses (with pagination limit)
        const { data: expensesList } = await safeQuery(
          (supabase as any)
            .from('fixed_expenses')
            .select('*')
            .eq('store_id', profile.store_id)
            .gte('expense_date', dateRange.start.toISOString())
            .lte('expense_date', dateRange.end.toISOString())
            .order('expense_date', { ascending: false })
        );

        setFixedExpensesList(expensesList || []);

        // 3. Fetch Loyalty Redemption Cost (COGS of redeemed rewards - with pagination limit)
        const { data: loyaltyData } = await safeQuery(
          (supabase as any)
            .from('loyalty_transactions')
            .select('monetary_cost')
            .eq('store_id', profile.store_id)
            .eq('type', 'burn')
            .eq('is_rolled_back', false)
            .gte('created_at', dateRange.start.toISOString())
            .lte('created_at', dateRange.end.toISOString())
        );

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
    <div className="p-6 md:p-10 space-y-10 max-w-[1400px] mx-auto animate-in fade-in duration-700 pb-32 bg-[#F8F9F7] dark:bg-transparent min-h-screen transition-colors duration-300">
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
              value={`$${(metrics.revenueToday || 0).toFixed(2)}`}
              trend={metrics.orderCount > 0 ? `${metrics.orderCount} pedidos` : '-'}
              type={metrics.revenueToday > 0 ? 'positive' : 'neutral'}
              icon="payments"
            />
            <FinanceCard
              label="Ticket Promedio"
              value={`$${(metrics.avgTicket || 0).toFixed(2)}`}
              trend="-"
              type="neutral"
              icon="receipt_long"
            />
            <FinanceCard
              label="Cargas Wallet (Hoy)"
              value={`$${(metrics.topupsToday || 0).toFixed(2)}`}
              trend="Fondos Ingresados"
              type="positive"
              icon="account_balance_wallet"
            />
            <FinanceCard
              label="Pasivo: Saldo en Billeteras"
              value={`$${(metrics.totalLiability || 0).toFixed(2)}`}
              trend="Dinero en cuentas sin consumir"
              type="neutral"
              icon="savings"
            />
          </div>

          <div className="lg:col-span-12 bg-white dark:bg-[#141714] rounded-3xl border border-gray-200 dark:border-white/5 p-6 shadow-xl dark:shadow-soft mb-8">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-lg font-black italic uppercase tracking-tighter text-[#37352F] dark:text-white leading-none">FLUJO DE OPERACIONES</h3>
                <p className="text-[9px] font-black text-[#9B9A97] dark:text-[#71766F] uppercase tracking-[0.2em] mt-1">ANÁLISIS DE INGRESOS POR CANAL</p>
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
              <Suspense fallback={
                <div className="h-full w-full flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-[#71766F]">
                  Cargando gráfico...
                </div>
              }>
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
                      <>
                        <Area type="monotone" dataKey="wallet_sales" stroke="#8b5cf6" strokeWidth={3} fillOpacity={0.2} fill="#8b5cf6" name="Consumo Wallet" />
                        <Area type="monotone" dataKey="cash_topups" stroke="#4ade80" strokeWidth={2} strokeDasharray="5 5" fill="transparent" name="Cargas Efectivo" />
                        <Area type="monotone" dataKey="transfer_topups" stroke="#facc15" strokeWidth={2} strokeDasharray="5 5" fill="transparent" name="Cargas Transfer" />
                      </>
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </Suspense>
            </div>
          </div>

          {/* FIXED EXPENSES SECTION */}
          <div className="lg:col-span-12 bg-white dark:bg-[#141714] rounded-3xl border border-gray-200 dark:border-white/5 p-6 shadow-xl dark:shadow-soft mb-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-black italic uppercase text-[#37352F] dark:text-white">GASTOS FIJOS / RECURRENTES</h3>
                <p className="text-[9px] font-bold text-[#9B9A97] dark:text-white/40 uppercase">ALQUILER, LUZ, SERVICIOS, SUELDOS</p>
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
          <div className="lg:col-span-4 bg-white dark:bg-[#141714] border border-gray-200 dark:border-white/5 p-6 rounded-3xl shadow-xl dark:shadow-soft">
            <h3 className="text-lg font-black italic uppercase text-[#37352F] dark:text-white mb-4">PRODUCTOS TOP</h3>
            <div className="space-y-3">
              {topProducts.length > 0 ? (
                topProducts.map((prod, idx) => (
                  <div key={`top-product-${prod.name}-${idx}`} className="flex justify-between items-center p-3 rounded-xl bg-white/5 border border-white/5">
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

/* Operational Insights Component (Summary of Closures) */
const OperationalInsights: React.FC<{ dateRange: { start: string | Date; end: string | Date } }> = ({ dateRange }) => {
  const [stats, setStats] = useState({
    totalRevenue: 0,
    orderCount: 0,
    totalDiscrepancy: 0,
    sessionsCount: 0,
    avgTicket: 0
  });
  const [loading, setLoading] = useState(true);
  const { profile } = useAuth();

  useEffect(() => {
    const fetchStats = async () => {
      if (!profile?.store_id) return;
      setLoading(true);
      try {
        const start = new Date(dateRange.start).toISOString();
        const end = new Date(dateRange.end).toISOString();

        // 1. Fetch Closures for Discrepancy
        const { data: closures } = await supabase
          .from('cash_closures')
          .select('real_cash, expected_cash')
          .eq('store_id', profile.store_id)
          .gte('created_at', start)
          .lte('created_at', end);

        // 2. Fetch Orders for total revenue and count in the period
        const { data: orders } = await supabase
          .from('orders')
          .select('total_amount')
          .eq('store_id', profile.store_id)
          .gte('created_at', start)
          .lte('created_at', end)
          .not('status', 'eq', 'cancelled');

        const totalRevenue = (orders || []).reduce((acc, o) => acc + (o.total_amount || 0), 0);
        const orderCount = orders?.length || 0;
        const totalDiscrepancy = (closures || []).reduce((acc, c) => acc + (Number(c.real_cash) - Number(c.expected_cash)), 0);
        const sessionsCount = closures?.length || 0;
        const avgTicket = orderCount > 0 ? totalRevenue / orderCount : 0;

        setStats({
          totalRevenue,
          orderCount,
          totalDiscrepancy,
          sessionsCount,
          avgTicket
        });
      } catch (err) {
        console.error('Error fetching operational insights:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [dateRange, profile?.store_id]);

  if (loading) return null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white/5 border border-white/5 p-5 rounded-3xl">
        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block mb-2">Pedidos Totales</span>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-black text-white">{stats.orderCount}</span>
          <span className="text-[10px] font-bold text-white/20 uppercase mb-1">Items</span>
        </div>
      </div>
      <div className="bg-white/5 border border-white/5 p-5 rounded-3xl">
        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block mb-2">Ticket Promedio</span>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-black text-white">${stats.avgTicket.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
        </div>
      </div>
      <div className="bg-white/5 border border-white/5 p-5 rounded-3xl">
        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block mb-2">Facturación Periodo</span>
        <div className="flex items-end gap-2">
          <span className="text-2xl font-black text-white">${stats.totalRevenue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
        </div>
      </div>
      <div className={`border p-5 rounded-3xl ${stats.totalDiscrepancy === 0 ? 'bg-white/5 border-white/5' : stats.totalDiscrepancy > 0 ? 'bg-neon/10 border-neon/30' : 'bg-red-500/10 border-red-500/30'}`}>
        <span className="text-[10px] font-black text-white/40 uppercase tracking-widest block mb-1">Diferencia / Variación</span>
        <div className="flex items-end gap-2">
          <span className={`text-2xl font-black ${stats.totalDiscrepancy >= 0 ? 'text-neon' : 'text-red-500'}`}>
            {stats.totalDiscrepancy > 0 ? '+' : ''}${stats.totalDiscrepancy.toLocaleString('es-AR')}
          </span>
          <span className="text-[10px] font-bold text-white/20 uppercase mb-1">Acumulado</span>
        </div>
      </div>
    </div>
  );
};

const FinanceCashManager: React.FC<{
  dateRange: { start: string | Date; end: string | Date };
  onUpdate?: () => void;
}> = ({ dateRange, onUpdate }) => {
  const { zones, activeSessions, loading, openSession, closeSession, refreshData } = useCashShift();
  const { profile } = useAuth();

  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [isClosing, setIsClosing] = useState<string | null>(null); // sessionId being closed
  const [expectedBySession, setExpectedBySession] = useState<Record<string, number>>({});
  const [loadingExpected, setLoadingExpected] = useState(false);
  const [closeResult, setCloseResult] = useState<any | null>(null);
  const [dispatchStations, setDispatchStations] = useState<any[]>([]);
  const [actionSession, setActionSession] = useState<any | null>(null);
  const [actionType, setActionType] = useState<'withdrawal' | 'adjustment' | null>(null);
  const [timelineSession, setTimelineSession] = useState<any | null>(null);

  // Fetch expected cash for all active sessions
  const fetchExpectedTotals = async () => {
    if (activeSessions.length === 0) return;
    setLoadingExpected(true);
    const nextExpected: Record<string, number> = {};

    await Promise.all(activeSessions.map(async (session) => {
      const { data, error } = await (supabase as any).rpc('get_session_expected_cash', { query_session_id: session.id });
      if (!error && data !== null && data !== undefined) {
        nextExpected[session.id] = Number(data) || 0;
      }
    }));

    setExpectedBySession(nextExpected);
    setLoadingExpected(false);
  };

  useEffect(() => {
    fetchExpectedTotals();
    // Auto refresh every 45 seconds
    const interval = setInterval(fetchExpectedTotals, 45000);
    return () => clearInterval(interval);
  }, [activeSessions.length]); // Re-fetch if session list changes

  useEffect(() => {
    const fetchStations = async () => {
      if (!profile?.store_id) return;
      try {
        const { data, error } = await supabase
          .from('dispatch_stations')
          .select('id, name')
          .eq('store_id', profile.store_id)
          .eq('is_visible', true)
          .order('sort_order');

        if (error) throw error;
        setDispatchStations(data || []);
      } catch (err) {
        console.error('Error fetching dispatch stations:', err);
        setDispatchStations([]);
      }
    };

    fetchStations();
  }, [profile?.store_id]);

  const globalTotal = useMemo(() => {
    return (Object.values(expectedBySession) as number[]).reduce((acc, curr) => acc + (curr || 0), 0);
  }, [expectedBySession]);

  const handleAction = async () => {
    try {
      if (isClosing) {
        const expected = expectedBySession[isClosing] || 0;
        await closeSession(isClosing, Number(amount), expected, "Cierre manual");
        setIsClosing(null);
        if (onUpdate) onUpdate();
      } else if (selectedZone) {
        await openSession(selectedZone, Number(amount));
        setSelectedZone(null);
        if (onUpdate) onUpdate();
      }
      setAmount('');
      refreshData();
    } catch (err: any) {
      console.error('Action failed:', err);
      window.alert(`Error: ${err.message || 'No se pudo procesar la acción'}`);
    }
  };

  if (loading) return <div className="text-white opacity-40 animate-pulse uppercase font-black text-[10px] tracking-widest text-center py-20">Cargando datos operativos...</div>;

  return (
    <div className="space-y-10 animate-in slide-in-from-bottom-4 duration-500">

      {/* GLOBAL SUMMARY HEADER */}
      <div className="bg-[#141714] border border-neon/20 p-8 rounded-3xl shadow-neon-soft flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex gap-10 items-center">
          <div>
            <h2 className="text-xs font-black text-neon uppercase tracking-[0.3em] mb-1">Total Efectivo Actual</h2>
            <p className="text-4xl font-black italic-black text-white leading-none">${globalTotal.toLocaleString('es-AR')}</p>
          </div>
          <div className="h-12 w-px bg-white/10 hidden md:block" />
          <div className="space-y-1">
            <span className="text-[9px] font-black text-white/40 uppercase tracking-widest block">Sesiones Activas</span>
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-neon animate-pulse"></span>
              <span className="text-sm font-black text-white uppercase">{activeSessions.length} ABIERTAS</span>
            </div>
          </div>
        </div>
        <button
          onClick={fetchExpectedTotals}
          disabled={loadingExpected}
          className="size-14 rounded-2xl bg-neon text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-neon-soft disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-2xl ${loadingExpected ? 'animate-spin' : ''}`}>sync</span>
        </button>
      </div>

      {/* OPERATIONAL INSIGHTS (SUMMARY OF CLOSED SESSIONS) */}
      <OperationalInsights dateRange={dateRange} />

      {/* 1. ZONES GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {zones.map(zone => {
          const sessionsForZone = activeSessions.filter(s => s.zone_id === zone.id);
          const isActive = sessionsForZone.length > 0;
          const hasLiveOrders = sessionsForZone.some(s => (s.live_order_count || 0) > 0);

          let statusColor = 'border-black/5 dark:border-white/5 bg-white dark:bg-surface-dark opacity-60';
          let statusDot = 'bg-red-500';

          if (isActive) {
            if (hasLiveOrders) {
              statusColor = 'bg-[#1a0505] border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)] animate-pulse-slow';
              statusDot = 'bg-red-500 animate-ping';
            } else {
              statusColor = 'bg-[#051a05] border-neon/50 shadow-[0_0_20px_rgba(74,222,128,0.1)]';
              statusDot = 'bg-neon animate-pulse';
            }
          }

          return (
            <div key={zone.id} className={`p-6 rounded-3xl border transition-all relative overflow-hidden group ${statusColor}`}>
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-black uppercase italic-black tracking-tight dark:text-white mb-1">{zone.name}</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{zone.type}</span>
                    {isActive && (
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${hasLiveOrders ? 'bg-red-500 text-white' : 'bg-neon/10 text-neon'}`}>
                        {hasLiveOrders ? 'Ocupado' : 'Abierto'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="relative">
                  <div className={`size-3 rounded-full ${isActive ? (hasLiveOrders ? 'bg-red-500' : 'bg-neon') : 'bg-bg-dark'}`}></div>
                  {isActive && <div className={`absolute inset-0 size-3 rounded-full ${statusDot} opacity-75`}></div>}
                </div>
              </div>

              {isActive ? (
                <div className="space-y-6">
                  {sessionsForZone.map((session, index) => {
                    const liveOrderCount = session?.live_order_count || 0;
                    const hasSessionLiveOrders = liveOrderCount > 0;
                    const expectedTotal = expectedBySession[session.id] || session.start_amount || 0;
                    const totalSales = session?.events_summary?.total_sales || 0;
                    const totalWithdrawals = session?.events_summary?.total_withdrawals || 0;
                    const totalAdjustments = session?.events_summary?.total_adjustments || 0;

                    return (
                      <div key={session.id} className={`space-y-6 ${index > 0 ? 'pt-6 border-t border-white/5' : ''}`}>
                        {session?.dispatch_station_name && (
                          <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest block">
                            {session.dispatch_station_name}
                          </span>
                        )}

                        {/* ADVANCED STATS GRID */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                            <span className="text-[8px] text-white/30 font-black uppercase tracking-[0.2em] block mb-1">Efectivo (Caja)</span>
                            <p className="text-xl font-black text-neon shadow-neon-soft font-mono">
                              ${expectedTotal.toLocaleString('es-AR')}
                            </p>
                          </div>
                          <div className="bg-white/5 rounded-2xl p-3 border border-white/5">
                            <span className="text-[8px] text-white/30 font-black uppercase tracking-[0.2em] block mb-1">Facturación Total</span>
                            <p className="text-xl font-black text-white font-mono">
                              ${totalSales.toLocaleString('es-AR')}
                            </p>
                          </div>
                        </div>

                        {/* MINI BREAKDOWN */}
                        <div className="bg-black/20 rounded-2xl p-4 border border-white/5 space-y-2">
                          <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                            <span className="text-white/40">Pedidos Activos</span>
                            <span className="text-white">{liveOrderCount}</span>
                          </div>

                          <div className="pt-2 border-t border-white/5 space-y-2">
                            <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                              <span className="text-white/40">Fondo Inicial</span>
                              <span className="text-white">${Number(session.start_amount || 0).toLocaleString('es-AR')}</span>
                            </div>
                            <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                              <span className="text-white/40">Ventas Totales</span>
                              <span className="text-white">${totalSales.toLocaleString('es-AR')}</span>
                            </div>
                            {session?.events_summary?.total_cancellations ? (
                              <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                                <span className="text-white/40">Anulaciones</span>
                                <span className="text-red-500">-${Math.abs(session.events_summary.total_cancellations).toLocaleString('es-AR')}</span>
                              </div>
                            ) : null}
                            <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                              <span className="text-white/40">Retiros</span>
                              <span className="text-red-500">-${Math.abs(totalWithdrawals).toLocaleString('es-AR')}</span>
                            </div>
                            <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                              <span className="text-white/40">Ajustes</span>
                              <span className={totalAdjustments >= 0 ? 'text-neon' : 'text-red-500'}>
                                {totalAdjustments >= 0 ? '+' : '-'}${Math.abs(totalAdjustments).toLocaleString('es-AR')}
                              </span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-white/5 flex justify-between items-center text-[9px] font-black uppercase tracking-wider">
                            <span className="text-white/40">Esperado en Caja</span>
                            <span className="text-neon">${expectedTotal.toLocaleString('es-AR')}</span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center pb-4 border-b border-white/5 px-1">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-1">Operador</span>
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-sm text-neon">verified_user</span>
                              <span className="text-xs font-bold text-white uppercase">{session?.opener?.full_name || 'Staff'}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-white/40 font-bold uppercase tracking-widest mb-1">Tiempo</span>
                            <SessionTimer openedAt={session.opened_at} />
                          </div>
                        </div>

                        {hasSessionLiveOrders && (
                          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between animate-pulse">
                            <div className="flex items-center gap-3">
                              <span className="material-symbols-outlined text-red-500">notifications_active</span>
                              <span className="text-xs font-black text-red-500 uppercase tracking-widest">Pedidos Activos</span>
                            </div>
                            <span className="text-xl font-black text-white">{liveOrderCount}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => { setActionType('withdrawal'); setActionSession(session); }}
                            className="py-3 rounded-xl bg-white/5 hover:bg-red-500/10 text-white/60 hover:text-red-400 border border-white/5 hover:border-red-500/30 text-[9px] font-black uppercase tracking-widest transition-all"
                          >
                            Retiro
                          </button>
                          <button
                            onClick={() => { setActionType('adjustment'); setActionSession(session); }}
                            className="py-3 rounded-xl bg-white/5 hover:bg-blue-500/10 text-white/60 hover:text-blue-400 border border-white/5 hover:border-blue-500/30 text-[9px] font-black uppercase tracking-widest transition-all"
                          >
                            Ajuste
                          </button>
                          <button
                            onClick={() => setTimelineSession(session)}
                            className="py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white border border-white/5 hover:border-white/20 text-[9px] font-black uppercase tracking-widest transition-all"
                          >
                            Timeline
                          </button>
                          <button
                            onClick={() => { setIsClosing(session.id); setCloseResult(null); }}
                            className="py-3 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-500 border border-white/5 hover:border-red-500/30 text-[9px] font-black uppercase tracking-widest transition-all"
                          >
                            Cerrar Caja
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={() => { setSelectedZone(zone.id); setCloseResult(null); }}
                    className="w-full py-3 rounded-2xl bg-white/5 hover:bg-neon/10 text-white/50 hover:text-white border border-white/5 hover:border-neon/30 text-[9px] font-black uppercase tracking-widest transition-all"
                  >
                    Abrir Otra Caja
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setSelectedZone(zone.id); setCloseResult(null); }}
                  className="w-full mt-4 py-4 rounded-2xl bg-black/[0.02] dark:bg-white/5 border border-black/10 dark:border-white/10 text-[10px] font-black uppercase tracking-widest text-text-secondary hover:text-white hover:bg-neon/10 hover:border-neon/30 transition-all"
                >
                  Abrir Turno
                </button>
              )}
            </div>
          );
        })}
      </div>

      {(selectedZone || isClosing) && (
        <CashShiftModal
          isClosing={!!isClosing}
          sessionId={isClosing}
          zoneId={selectedZone}
          closeResult={closeResult}
          dispatchStations={dispatchStations}
          onClose={() => {
            setSelectedZone(null);
            setIsClosing(null);
            setCloseResult(null);
          }}
          onConfirm={async (amount, expected, notes, dispatchStationId) => {
            if (isClosing) {
              const result = await closeSession(isClosing, amount, expected || 0, notes);
              setCloseResult(result);
              if (onUpdate) onUpdate();
            } else if (selectedZone) {
              await openSession(selectedZone, amount, dispatchStationId || null);
              setSelectedZone(null);
              if (onUpdate) onUpdate();
            }
            refreshData();
          }}
        />
      )}

      {actionType && actionSession && (
        <CashActionModal
          type={actionType}
          session={actionSession}
          onClose={() => { setActionType(null); setActionSession(null); }}
          onConfirm={async (payload) => {
            if (!profile?.id) throw new Error('No user context');
            if (payload.type === 'withdrawal') {
              await supabase.rpc('register_cash_withdrawal' as any, {
                p_cash_session_id: payload.sessionId,
                p_amount: payload.amount,
                p_description: payload.description,
                p_performed_by: profile.id
              });
            } else {
              await supabase.rpc('register_cash_adjustment' as any, {
                p_cash_session_id: payload.sessionId,
                p_amount: payload.amount,
                p_description: payload.description,
                p_performed_by: profile.id
              });
            }
            setActionType(null);
            setActionSession(null);
            refreshData();
            fetchExpectedTotals();
          }}
        />
      )}

      {timelineSession && (
        <CashEventTimelineModal
          session={timelineSession}
          onClose={() => setTimelineSession(null)}
        />
      )}

      <CashSessionHistory />
    </div>
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
  closeResult?: any | null;
  dispatchStations?: { id: string; name: string }[];
  onClose: () => void;
  onConfirm: (amount: number, expected?: number, notes?: string, dispatchStationId?: string | null) => void | Promise<void>;
}> = ({ isClosing, sessionId, zoneId, closeResult, dispatchStations = [], onClose, onConfirm }) => {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [eventSummary, setEventSummary] = useState<any | null>(null);
  const [loadingExpected, setLoadingExpected] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isClosing && sessionId) {
      const fetchExpected = async () => {
        setLoadingExpected(true);
        const { data, error } = await (supabase as any).rpc('get_cash_session_events', { p_session_id: sessionId });
        if (error) {
          console.error("Error fetching cash events:", error);
          setEventSummary(null);
        } else {
          setEventSummary((data as any)?.summary || null);
        }
        setLoadingExpected(false);
      };
      fetchExpected();
    }
  }, [isClosing, sessionId]);

  useEffect(() => {
    setAmount('');
    setNotes('');
    if (!isClosing) {
      setSelectedStation('');
    }
  }, [isClosing, sessionId, zoneId]);

  const realAmount = Number(amount) || 0;
  const expected = eventSummary?.net_cash || 0;
  const difference = realAmount - expected;
  const diffColor = difference === 0 ? 'text-white' : difference > 0 ? 'text-neon' : 'text-red-500';
  const showCloseSummary = isClosing && !!closeResult?.statistics;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in transition-all">
      <div className="bg-[#141414] border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-neon/10 blur-[80px] -mr-16 -mt-16 pointer-events-none" />

        <button onClick={onClose} className="absolute top-4 right-4 text-white/20 hover:text-white transition-colors">
          <span className="material-symbols-outlined">close</span>
        </button>

        <h3 className="text-xl font-black uppercase italic-black text-white mb-2 tracking-tight">
          {isClosing ? 'Arqueo de Caja' : 'Apertura de Turno'}
        </h3>
        <p className="text-[11px] text-white/50 mb-6 uppercase tracking-wider font-bold">
          {isClosing ? 'Verifique el efectivo físico contra el sistema.' : 'Ingrese el fondo inicial de la caja.'}
        </p>

        <div className="space-y-6">
          {/* Comparison Display (Only for Closing) */}
          {isClosing && !showCloseSummary && (
            <div className="space-y-4">
              {/* CASH BREAKDOWN */}
              <div className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-3">
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Fondo Inicial</span>
                  <span className="text-sm font-black text-white/80">${(eventSummary?.opening_amount || 0).toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Ventas Totales</span>
                  <span className="text-sm font-black text-white/80">${(eventSummary?.total_sales || 0).toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Anulaciones</span>
                  <span className="text-sm font-black text-red-500">-${Math.abs(eventSummary?.total_cancellations || 0).toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Retiros</span>
                  <span className="text-sm font-black text-red-500">-${Math.abs(eventSummary?.total_withdrawals || 0).toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Ajustes</span>
                  <span className={`text-sm font-black ${eventSummary?.total_adjustments >= 0 ? 'text-neon' : 'text-red-500'}`}>
                    {eventSummary?.total_adjustments >= 0 ? '+' : '-'}${Math.abs(eventSummary?.total_adjustments || 0).toLocaleString('es-AR')}
                  </span>
                </div>
                <div className="flex justify-between items-center border-b border-white/5 pb-2">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Topups</span>
                  <span className="text-sm font-black text-white/80">${(eventSummary?.total_topups || 0).toLocaleString('es-AR')}</span>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-2 pt-2">
                  <div>
                    <span className="text-[9px] font-bold text-neon uppercase tracking-widest block mb-1">Esperado en Caja</span>
                    {loadingExpected ? (
                      <span className="text-sm text-white/20 animate-pulse uppercase font-black">Calculando...</span>
                    ) : (
                      <span className="text-2xl font-black text-neon shadow-neon-soft font-mono">${expected.toLocaleString('es-AR')}</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest block mb-1">Diferencia</span>
                    <span className={`text-2xl font-black font-mono ${diffColor}`}>
                      {difference > 0 ? '+' : ''}${difference.toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showCloseSummary && (
            <div className="space-y-4">
              <div className="bg-white/5 p-5 rounded-2xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Pedidos</span>
                  <span className="text-sm font-black text-white/80">
                    {closeResult.statistics?.total_orders || 0} ({closeResult.statistics?.cancelled_orders || 0} anulados)
                  </span>
                </div>

                <div className="border-t border-white/5 pt-3 space-y-2">
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Ventas por Metodo</span>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(closeResult.statistics?.by_payment_method || {}).map(([method, total]: [string, any]) => (
                      <div key={method} className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl">
                        <span className="text-[9px] font-bold text-white/40 uppercase">{method}</span>
                        <span className="text-[10px] font-black text-white">${Number(total || 0).toLocaleString('es-AR')}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-white/5 pt-3 space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                    <span className="text-white/40">Fondo Inicial</span>
                    <span className="text-white">${Number(closeResult.statistics?.start_amount || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                    <span className="text-white/40">Ventas Cash</span>
                    <span className="text-white">${Number(closeResult.statistics?.by_payment_method?.cash || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                    <span className="text-white/40">Topups Cash</span>
                    <span className="text-white">${Number(closeResult.statistics?.cash_topups || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                    <span className="text-white/40">Retiros</span>
                    <span className="text-red-500">${Number(closeResult.statistics?.withdrawals || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                    <span className="text-white/40">Ajustes</span>
                    <span className={Number(closeResult.statistics?.adjustments || 0) >= 0 ? 'text-neon' : 'text-red-500'}>
                      {Number(closeResult.statistics?.adjustments || 0) >= 0 ? '+' : '-'}${Math.abs(Number(closeResult.statistics?.adjustments || 0)).toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="border-t border-white/5 pt-2 flex justify-between text-[11px] font-black uppercase tracking-widest">
                    <span className="text-white/40">Esperado</span>
                    <span className="text-white">${Number(closeResult.statistics?.expected_cash || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                    <span className="text-white/40">Real</span>
                    <span className="text-white">${Number(closeResult.statistics?.real_cash || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                    <span className="text-white/40">Diferencia</span>
                    <span className={Number(closeResult.statistics?.difference || 0) >= 0 ? 'text-neon' : 'text-red-500'}>
                      {Number(closeResult.statistics?.difference || 0) >= 0 ? '+' : '-'}${Math.abs(Number(closeResult.statistics?.difference || 0)).toLocaleString('es-AR')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {!showCloseSummary && (
            <>
              <div className="relative group">
                <label className="text-[9px] font-black text-neon uppercase tracking-[0.2em] block mb-2">
                  Contaje {isClosing ? 'Real (Físico)' : 'Inicial'}
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-white/20 group-focus-within:text-neon transition-colors">$</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-4 py-6 text-white font-black outline-none focus:border-neon/50 focus:bg-neon/5 text-4xl placeholder:text-white/5 transition-all font-mono"
                    placeholder="0"
                    autoFocus
                  />
                </div>
              </div>

              {!isClosing && dispatchStations.length > 0 && (
                <div>
                  <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] block mb-2 leading-none">Estacion de despacho (opcional)</label>
                  <select
                    value={selectedStation}
                    onChange={(e) => setSelectedStation(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white text-xs font-bold outline-none focus:border-white/20 transition-all"
                  >
                    <option value="">Sin estacion especifica</option>
                    {dispatchStations.map((station) => (
                      <option key={station.id} value={station.id}>{station.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {isClosing && (
                <div>
                  <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] block mb-2 leading-none">Observaciones del Turno</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white text-xs font-bold outline-none focus:border-white/20 min-h-[100px] transition-all"
                    placeholder="Ej. Falta cambio, retiro parcial, merma encontrada..."
                  />
                </div>
              )}
            </>
          )}

          <button
            onClick={async () => {
              if (showCloseSummary) {
                onClose();
                return;
              }
              setIsSubmitting(true);
              try {
                await onConfirm(realAmount, expected, notes, selectedStation || null);
              } catch (err) {
                console.error('Cash shift action failed:', err);
              } finally {
                setIsSubmitting(false);
              }
            }}
            disabled={isSubmitting}
            className="w-full py-5 rounded-2xl bg-neon text-black font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-neon-soft group flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {showCloseSummary ? 'Listo' : isClosing ? 'Confirmar Cierre' : 'Confirmar Apertura'}
            <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const CashActionModal: React.FC<{
  type: 'withdrawal' | 'adjustment';
  session: any;
  onClose: () => void;
  onConfirm: (payload: { type: 'withdrawal' | 'adjustment'; sessionId: string; amount: number; description: string }) => Promise<void>;
}> = ({ type, session, onClose, onConfirm }) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [sign, setSign] = useState<'positive' | 'negative'>('positive');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const numericAmount = Math.abs(Number(amount) || 0);
  const signedAmount = type === 'adjustment'
    ? (sign === 'negative' ? -numericAmount : numericAmount)
    : numericAmount;

  const title = type === 'withdrawal' ? 'Retiro de Caja' : 'Ajuste de Caja';
  const confirmLabel = type === 'withdrawal' ? 'Confirmar Retiro' : 'Confirmar Ajuste';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in transition-all">
      <div className="bg-[#141414] border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl relative overflow-hidden">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/20 hover:text-white transition-colors">
          <span className="material-symbols-outlined">close</span>
        </button>

        <h3 className="text-xl font-black uppercase italic-black text-white mb-2 tracking-tight">{title}</h3>
        <p className="text-[11px] text-white/50 mb-6 uppercase tracking-wider font-bold">
          {session?.zone_name || 'Caja'} {session?.dispatch_station_name ? `· ${session.dispatch_station_name}` : ''}
        </p>

        <div className="space-y-6">
          {type === 'adjustment' && (
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSign('positive')}
                className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${sign === 'positive' ? 'bg-neon/10 text-neon border-neon/40' : 'bg-white/5 text-white/50 border-white/10 hover:border-white/30'}`}
              >
                Sobrante (+)
              </button>
              <button
                onClick={() => setSign('negative')}
                className={`py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${sign === 'negative' ? 'bg-red-500/10 text-red-400 border-red-500/40' : 'bg-white/5 text-white/50 border-white/10 hover:border-white/30'}`}
              >
                Faltante (-)
              </button>
            </div>
          )}

          <div className="relative group">
            <label className="text-[9px] font-black text-neon uppercase tracking-[0.2em] block mb-2">Monto</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-white/20 group-focus-within:text-neon transition-colors">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-4 py-6 text-white font-black outline-none focus:border-neon/50 focus:bg-neon/5 text-4xl placeholder:text-white/5 transition-all font-mono"
                placeholder="0"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] block mb-2 leading-none">Motivo</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white text-xs font-bold outline-none focus:border-white/20 min-h-[100px] transition-all"
              placeholder="Ej. Compra de hielo, pago proveedor, propina encontrada..."
            />
          </div>

          <button
            onClick={async () => {
              if (!numericAmount || !description.trim()) return;
              setIsSubmitting(true);
              try {
                await onConfirm({
                  type,
                  sessionId: session.id,
                  amount: signedAmount,
                  description: description.trim()
                });
              } catch (err) {
                console.error('Cash action failed:', err);
              } finally {
                setIsSubmitting(false);
              }
            }}
            disabled={isSubmitting || !numericAmount || !description.trim()}
            className="w-full py-5 rounded-2xl bg-neon text-black font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-neon-soft group flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {confirmLabel}
            <span className="material-symbols-outlined text-lg group-hover:translate-x-1 transition-transform">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
};

const CashEventTimelineModal: React.FC<{
  session: any;
  onClose: () => void;
}> = ({ session, onClose }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [summary, setSummary] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      try {
        const { data, error } = await (supabase as any).rpc('get_cash_session_events', {
          p_session_id: session.id
        });
        if (error) throw error;
        setEvents((data as any)?.events || []);
        setSummary((data as any)?.summary || null);
      } catch (err) {
        console.error('Error fetching cash session events:', err);
        setEvents([]);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [session.id]);

  const iconMap: Record<string, string> = {
    opening: 'lock_open',
    sale: 'point_of_sale',
    cancellation: 'cancel',
    withdrawal: 'output',
    adjustment: 'sync_alt',
    topup: 'account_balance_wallet'
  };

  const colorMap: Record<string, string> = {
    opening: 'text-neon',
    sale: 'text-neon',
    cancellation: 'text-red-500',
    withdrawal: 'text-orange-400',
    adjustment: 'text-blue-400',
    topup: 'text-purple-400'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in transition-all">
      <div className="bg-[#141414] border border-white/10 p-8 rounded-3xl w-full max-w-2xl shadow-2xl relative overflow-hidden">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/20 hover:text-white transition-colors">
          <span className="material-symbols-outlined">close</span>
        </button>

        <h3 className="text-xl font-black uppercase italic-black text-white mb-2 tracking-tight">
          Historial de Caja
        </h3>
        <p className="text-[11px] text-white/50 mb-6 uppercase tracking-wider font-bold">
          {session?.zone_name || 'Caja'} {session?.dispatch_station_name ? `· ${session.dispatch_station_name}` : ''}
        </p>

        {summary && (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
            <div className="grid grid-cols-2 gap-3 text-[10px] font-black uppercase tracking-widest">
              <div className="flex justify-between">
                <span className="text-white/40">Ventas</span>
                <span className="text-white">${Number(summary.total_sales || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Anulaciones</span>
                <span className="text-red-500">-${Math.abs(Number(summary.total_cancellations || 0)).toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Retiros</span>
                <span className="text-red-500">-${Math.abs(Number(summary.total_withdrawals || 0)).toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Ajustes</span>
                <span className={Number(summary.total_adjustments || 0) >= 0 ? 'text-neon' : 'text-red-500'}>
                  {Number(summary.total_adjustments || 0) >= 0 ? '+' : '-'}${Math.abs(Number(summary.total_adjustments || 0)).toLocaleString('es-AR')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Topups</span>
                <span className="text-white">${Number(summary.total_topups || 0).toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/40">Efectivo neto</span>
                <span className="text-white">${Number(summary.net_cash || 0).toLocaleString('es-AR')}</span>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-white/40 text-xs uppercase tracking-widest font-black">Cargando eventos...</div>
        ) : (
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
            {events.length === 0 && (
              <div className="text-xs text-white/30 uppercase tracking-widest">Sin eventos registrados</div>
            )}
            {events.map((event: any) => {
              const icon = iconMap[event.event_type] || 'receipt_long';
              const color = colorMap[event.event_type] || 'text-white';
              const amount = Number(event.amount || 0);
              const time = event.created_at ? new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

              return (
                <div key={event.id || `${event.event_type}-${event.created_at}`} className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                  <span className={`material-symbols-outlined ${color}`}>{icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/40">
                      <span>{time}</span>
                      <span>{event.event_type}</span>
                    </div>
                    <div className="text-xs font-bold text-white">{event.description || 'Movimiento de caja'}</div>
                  </div>
                  <div className={`text-sm font-black ${amount >= 0 ? 'text-neon' : 'text-red-500'}`}>
                    {amount >= 0 ? '+' : '-'}${Math.abs(amount).toLocaleString('es-AR')}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const CashSessionHistory: React.FC = () => {
  const { profile } = useAuth();

  // Data
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Filters
  const [datePreset, setDatePreset] = useState<'hoy' | '7d' | '30d' | 'todo'>('30d');
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');

  // Zones for filter pills
  const [zones, setZones] = useState<{ id: string; name: string }[]>([]);

  // Detail modals
  const [selectedClosure, setSelectedClosure] = useState<any | null>(null);
  const [detailSummary, setDetailSummary] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [timelineSession, setTimelineSession] = useState<any | null>(null);

  const getDateRange = (): { start: string | null; end: string | null } => {
    const now = new Date();
    switch (datePreset) {
      case 'hoy': {
        const s = new Date(); s.setHours(0, 0, 0, 0);
        return { start: s.toISOString(), end: now.toISOString() };
      }
      case '7d': {
        const s = new Date(); s.setDate(now.getDate() - 7); s.setHours(0, 0, 0, 0);
        return { start: s.toISOString(), end: now.toISOString() };
      }
      case '30d': {
        const s = new Date(); s.setDate(now.getDate() - 30); s.setHours(0, 0, 0, 0);
        return { start: s.toISOString(), end: now.toISOString() };
      }
      case 'todo':
        return { start: null, end: null };
    }
  };

  const fetchSessions = async (loadMore = false) => {
    if (!profile?.store_id) return;
    loadMore ? setLoadingMore(true) : setLoading(true);

    const currentPage = loadMore ? page + 1 : 1;
    const rangeStart = (currentPage - 1) * PAGE_SIZE;
    const rangeEnd = rangeStart + PAGE_SIZE - 1;

    try {
      let query = (supabase as any)
        .from('cash_sessions_summary')
        .select('*', { count: 'exact' })
        .eq('store_id', profile.store_id)
        .order('opened_at', { ascending: false })
        .range(rangeStart, rangeEnd);

      const { start, end } = getDateRange();
      if (start) query = query.gte('opened_at', start);
      if (end) query = query.lte('opened_at', end);
      if (zoneFilter) query = query.eq('zone_id', zoneFilter);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error, count } = await query;
      if (error) throw error;

      if (loadMore) {
        setSessions(prev => [...prev, ...(data || [])]);
        setPage(currentPage);
      } else {
        setSessions(data || []);
        setPage(1);
      }

      setTotalCount(count || 0);
      setHasMore((data?.length || 0) === PAGE_SIZE);
    } catch (err) {
      console.error('Error loading session history:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Fetch zones for filter pills
  useEffect(() => {
    const fetchZones = async () => {
      if (!profile?.store_id) return;
      const { data } = await (supabase as any)
        .from('venue_zones')
        .select('id, name')
        .eq('store_id', profile.store_id);
      setZones(data || []);
    };
    fetchZones();
  }, [profile?.store_id]);

  // Refetch on filter change
  useEffect(() => {
    fetchSessions(false);
  }, [profile?.store_id, datePreset, zoneFilter, statusFilter]);

  const handleRowClick = async (record: any) => {
    if (record.status === 'open') {
      setTimelineSession(record);
      return;
    }
    setSelectedClosure(record);
    setDetailLoading(true);
    setDetailSummary(null);
    try {
      const { data, error } = await (supabase as any)
        .from('cash_closures_detailed')
        .select('*')
        .eq('session_id', record.id)
        .maybeSingle();
      if (!error && data) setDetailSummary(data);
    } catch (err) {
      console.error('Error fetching closure detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const exportCsv = () => {
    if (sessions.length === 0) return;
    const headers = ['Fecha', 'Zona', 'Estacion', 'Estado', 'Apertura', 'Cierre', 'Operador Apertura', 'Operador Cierre', 'Fondo Inicial', 'Esperado', 'Real', 'Diferencia', 'Duracion (hs)', 'Notas'];
    const rows = sessions.map(r => [
      r.opened_at ? new Date(r.opened_at).toLocaleDateString() : '',
      r.zone_name || '',
      r.dispatch_station_name || '',
      r.status === 'open' ? 'Abierta' : 'Cerrada',
      r.opened_at ? new Date(r.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      r.closed_at ? new Date(r.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      r.opened_by_name || '',
      r.closed_by_name || '',
      r.start_amount || 0,
      r.expected_cash || 0,
      r.real_cash || 0,
      r.difference ?? ((r.real_cash || 0) - (r.expected_cash || 0)),
      r.duration_hours || '',
      (r.closing_notes || '').replace(/"/g, '""')
    ]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sesiones_caja_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Summary calculations
  const closedSessions = sessions.filter(s => s.status === 'closed');
  const totalDiff = closedSessions.reduce((sum, r) => sum + (r.difference ?? ((r.real_cash || 0) - (r.expected_cash || 0))), 0);

  const formatDuration = (hours: number | null) => {
    if (!hours) return '-';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const datePresets = [
    { key: 'hoy' as const, label: 'Hoy' },
    { key: '7d' as const, label: '7 Días' },
    { key: '30d' as const, label: '30 Días' },
    { key: 'todo' as const, label: 'Todo' }
  ];

  const statusOptions = [
    { key: 'all' as const, label: 'Todas' },
    { key: 'open' as const, label: 'Abiertas' },
    { key: 'closed' as const, label: 'Cerradas' }
  ];

  return (
    <div className="bg-white dark:bg-surface-dark rounded-3xl subtle-border shadow-soft overflow-hidden">
      {/* HEADER */}
      <div className="p-6 border-b border-white/5 bg-black/20">
        <div className="flex justify-between items-start mb-5">
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.2em] dark:text-white mb-1">Historial de Sesiones de Caja</h3>
            <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">Auditoría Financiera Completa</span>
          </div>
          <button
            onClick={exportCsv}
            disabled={sessions.length === 0}
            className="px-4 py-2 rounded-xl bg-white/5 text-[9px] font-black uppercase tracking-widest hover:bg-white/10 transition-colors text-white border border-white/5 hover:border-white/10 disabled:opacity-30 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Exportar CSV
          </button>
        </div>

        {/* FILTER BAR */}
        <div className="flex flex-col gap-3">
          {/* Date + Status row */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-black/20 p-1 rounded-xl">
              {datePresets.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setDatePreset(key)}
                  className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    datePreset === key
                      ? 'bg-neon/10 text-neon border border-neon/20'
                      : 'text-white/40 hover:text-white/60 border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="h-5 w-px bg-white/10 hidden md:block" />

            <div className="flex bg-black/20 p-1 rounded-xl">
              {statusOptions.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    statusFilter === key
                      ? 'bg-neon/10 text-neon border border-neon/20'
                      : 'text-white/40 hover:text-white/60 border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Zone pills */}
          {zones.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setZoneFilter(null)}
                className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${
                  !zoneFilter ? 'bg-neon/10 text-neon border-neon/20' : 'bg-white/5 text-white/40 border-white/5 hover:text-white/60'
                }`}
              >
                Todas las zonas
              </button>
              {zones.map(zone => (
                <button
                  key={zone.id}
                  onClick={() => setZoneFilter(zone.id)}
                  className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${
                    zoneFilter === zone.id ? 'bg-neon/10 text-neon border-neon/20' : 'bg-white/5 text-white/40 border-white/5 hover:text-white/60'
                  }`}
                >
                  {zone.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* TABLE */}
      {loading ? (
        <div className="p-8 text-center text-xs uppercase tracking-widest opacity-50 text-white animate-pulse">Cargando historial...</div>
      ) : sessions.length === 0 ? (
        <div className="p-12 text-center">
          <div className="flex flex-col items-center gap-3 opacity-50">
            <span className="material-symbols-outlined text-4xl text-white/30">inbox</span>
            <p className="text-xs font-bold uppercase tracking-widest text-white/50">No hay sesiones en este periodo</p>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-black/40 text-[9px] font-black uppercase tracking-widest text-white/40">
                <tr>
                  <th className="px-5 py-4">Estado</th>
                  <th className="px-5 py-4">Fecha / Hora</th>
                  <th className="px-5 py-4">Zona / Caja</th>
                  <th className="px-5 py-4">Duración</th>
                  <th className="px-5 py-4">Responsables</th>
                  <th className="px-5 py-4 text-right">Sistema (Esp)</th>
                  <th className="px-5 py-4 text-right">Real (Físico)</th>
                  <th className="px-5 py-4 text-right">Diferencia</th>
                  <th className="px-5 py-4">Notas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-[11px] font-medium text-white/70">
                {sessions.map((record) => {
                  const isOpen = record.status === 'open';
                  const diff = record.difference ?? ((record.real_cash || 0) - (record.expected_cash || 0));
                  const isPositive = diff >= 0;
                  const isPerfect = diff === 0;

                  return (
                    <tr
                      key={record.id}
                      className="hover:bg-white/5 transition-colors group cursor-pointer"
                      onClick={() => handleRowClick(record)}
                    >
                      {/* Status */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`size-2 rounded-full ${isOpen ? 'bg-neon animate-pulse' : 'bg-white/20'}`} />
                          <span className={`text-[9px] font-black uppercase tracking-widest ${isOpen ? 'text-neon' : 'text-white/40'}`}>
                            {isOpen ? 'Abierta' : 'Cerrada'}
                          </span>
                        </div>
                      </td>
                      {/* Fecha */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="text-white font-bold">
                            {new Date(record.opened_at || record.created_at).toLocaleDateString()}
                          </span>
                          <span className="text-[9px] opacity-50">
                            {new Date(record.opened_at || record.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </td>
                      {/* Zona */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-white">{record.zone_name || 'Zona Eliminada'}</span>
                          {record.dispatch_station_name && (
                            <span className="text-[9px] text-white/40 uppercase tracking-widest">{record.dispatch_station_name}</span>
                          )}
                        </div>
                      </td>
                      {/* Duración */}
                      <td className="px-5 py-4">
                        <span className="text-[10px] font-bold text-white/50 font-mono">
                          {isOpen ? (
                            <span className="text-neon/60">En curso</span>
                          ) : (
                            formatDuration(record.duration_hours)
                          )}
                        </span>
                      </td>
                      {/* Responsables */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[10px] text-neon">lock_open</span>
                            <span className="text-[10px]">{record.opened_by_name?.split(' ')[0] || 'Staff'}</span>
                          </div>
                          {!isOpen && (
                            <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                              <span className="material-symbols-outlined text-[10px] text-red-400">lock</span>
                              <span className="text-[10px]">{record.closed_by_name?.split(' ')[0] || 'Auto'}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      {/* Sistema */}
                      <td className="px-5 py-4 text-right font-mono text-white/50">
                        {isOpen
                          ? <span className="text-neon/60 italic text-[9px]">En curso</span>
                          : `$${(record.expected_cash || 0).toLocaleString('es-AR')}`
                        }
                      </td>
                      {/* Real */}
                      <td className="px-5 py-4 text-right font-mono font-bold text-white">
                        {isOpen
                          ? <span className="text-neon/60 italic text-[9px]">En curso</span>
                          : `$${(record.real_cash || 0).toLocaleString('es-AR')}`
                        }
                      </td>
                      {/* Diferencia */}
                      <td className="px-5 py-4 text-right">
                        {isOpen ? (
                          <span className="text-[9px] text-white/20">-</span>
                        ) : (
                          <span className={`font-mono font-black px-2 py-1 rounded-md text-[10px] ${isPerfect ? 'bg-white/5 text-white/50' : isPositive ? 'bg-neon/10 text-neon' : 'bg-red-500/10 text-red-500'}`}>
                            {diff > 0 ? '+' : ''}${diff?.toLocaleString('es-AR')}
                          </span>
                        )}
                      </td>
                      {/* Notas */}
                      <td className="px-5 py-4 max-w-[200px] truncate opacity-50 italic">
                        {record.closing_notes || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* SUMMARY FOOTER */}
              <tfoot className="bg-black/30 border-t border-white/10">
                <tr>
                  <td className="px-5 py-4 text-[9px] font-black uppercase tracking-widest text-white/60" colSpan={5}>
                    {totalCount} sesiones · {sessions.filter(s => s.status === 'open').length} abiertas · {closedSessions.length} cerradas
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-[10px] font-bold text-white/40">
                    ${closedSessions.reduce((sum, r) => sum + (r.expected_cash || 0), 0).toLocaleString('es-AR')}
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-[10px] font-bold text-white/40">
                    ${closedSessions.reduce((sum, r) => sum + (r.real_cash || 0), 0).toLocaleString('es-AR')}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className={`font-mono font-black text-[10px] px-2 py-1 rounded-md ${totalDiff === 0 ? 'bg-white/5 text-white/50' : totalDiff > 0 ? 'bg-neon/10 text-neon' : 'bg-red-500/10 text-red-500'}`}>
                      {totalDiff > 0 ? '+' : ''}${totalDiff.toLocaleString('es-AR')}
                    </span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* PAGINATION */}
          {hasMore && (
            <div className="p-6 flex justify-center border-t border-white/5">
              <button
                onClick={() => fetchSessions(true)}
                disabled={loadingMore}
                className="px-8 py-3 rounded-2xl bg-white/5 hover:bg-neon/10 text-white/50 hover:text-neon border border-white/5 hover:border-neon/30 text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
              >
                {loadingMore ? 'Cargando...' : `Cargar Más (${sessions.length} de ${totalCount})`}
              </button>
            </div>
          )}
        </>
      )}

      {/* DETAIL MODALS */}
      {selectedClosure && (
        <CashClosureDetailModal
          record={selectedClosure}
          summary={detailSummary}
          loading={detailLoading}
          onClose={() => {
            setSelectedClosure(null);
            setDetailSummary(null);
          }}
        />
      )}

      {timelineSession && (
        <CashEventTimelineModal
          session={timelineSession}
          onClose={() => setTimelineSession(null)}
        />
      )}
    </div>
  );
};

const CashClosureDetailModal: React.FC<{
  record: any;
  summary: any | null;
  loading: boolean;
  onClose: () => void;
}> = ({ record, summary, loading, onClose }) => {
  const diff = record.difference ?? (record.real_cash - record.expected_cash);
  const diffColor = diff === 0 ? 'text-white' : diff > 0 ? 'text-neon' : 'text-red-500';
  const zoneName = record.zone_name || 'Zona Eliminada';
  const openerName = record.opened_by_name || 'Staff';
  const closerName = record.closed_by_name || 'Auto';
  const openedAt = record.opened_at ? new Date(record.opened_at) : null;
  const closedAt = record.closed_at ? new Date(record.closed_at) : null;
  const dispatchStation = record.dispatch_station_name || summary?.default_dispatch_station || 'No asignada';
  const paymentBreakdown = summary
    ? [
        { label: 'Efectivo', total: summary.total_cash_sales },
        { label: 'Wallet', total: summary.total_wallet_sales },
        { label: 'MercadoPago', total: summary.total_mp_sales },
        { label: 'Tarjeta', total: summary.total_card_sales }
      ].filter((entry) => Number(entry.total || 0) > 0)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in transition-all">
      <div className="bg-[#141414] border border-white/10 p-8 rounded-3xl w-full max-w-3xl shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 bg-neon/10 blur-[90px] -mr-16 -mt-16 pointer-events-none" />

        <button onClick={onClose} className="absolute top-4 right-4 text-white/20 hover:text-white transition-colors">
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-xl font-black uppercase italic-black text-white tracking-tight">Detalle de Cierre</h3>
            <p className="text-[10px] text-white/40 uppercase tracking-widest">{zoneName}</p>
            <p className="text-[9px] text-white/30 uppercase tracking-[0.2em] mt-1">Estación: {dispatchStation}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-white/40 uppercase tracking-widest">Fecha</p>
            <p className="text-sm font-black text-white">
              {new Date(record.closed_at || record.opened_at || record.created_at).toLocaleDateString()} {new Date(record.closed_at || record.opened_at || record.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] text-white/40 uppercase tracking-widest mb-1">Fondo Inicial</p>
            <p className="text-2xl font-black text-white">${(record.start_amount || 0).toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] text-white/40 uppercase tracking-widest mb-1">Sistema (Esperado)</p>
            <p className="text-2xl font-black text-white">${(record.expected_cash || 0).toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] text-white/40 uppercase tracking-widest mb-1">Real (Fisico)</p>
            <p className="text-2xl font-black text-white">${(record.real_cash || 0).toLocaleString('es-AR')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] text-white/40 uppercase tracking-widest mb-1">Diferencia</p>
            <p className={`text-2xl font-black ${diffColor}`}>{diff > 0 ? '+' : ''}${diff.toLocaleString('es-AR')}</p>
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] text-white/40 uppercase tracking-widest mb-1">Apertura</p>
            <p className="text-sm font-black text-white">
              {openedAt ? openedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
            </p>
            <p className="text-[9px] text-white/40">{openerName}</p>
          </div>
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] text-white/40 uppercase tracking-widest mb-1">Cierre</p>
            <p className="text-sm font-black text-white">
              {closedAt ? closedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
            </p>
            <p className="text-[9px] text-white/40">{closerName}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] text-white/40 uppercase tracking-widest mb-2">Resumen del Turno</p>
            {loading ? (
              <p className="text-xs text-white/30 uppercase tracking-widest animate-pulse">Cargando resumen...</p>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold uppercase">
                  <span className="text-white/40">Pedidos</span>
                  <span className="text-white">{summary?.total_orders || 0}</span>
                </div>
                <div className="flex justify-between text-[10px] font-bold uppercase">
                  <span className="text-white/40">Facturacion</span>
                  <span className="text-white">${(summary?.total_sales || 0).toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between text-[10px] font-bold uppercase">
                  <span className="text-white/40">Ventas Efectivo</span>
                  <span className="text-white">${(summary?.total_cash_sales || 0).toLocaleString('es-AR')}</span>
                </div>
                <div className="flex justify-between text-[10px] font-bold uppercase">
                  <span className="text-white/40">Cargas Wallet</span>
                  <span className="text-white">${(summary?.total_topups || 0).toLocaleString('es-AR')}</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
            <p className="text-[9px] text-white/40 uppercase tracking-widest mb-2">Pagos por Metodo</p>
            {loading ? (
              <p className="text-xs text-white/30 uppercase tracking-widest animate-pulse">Cargando metodos...</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {paymentBreakdown.length > 0 ? (
                  paymentBreakdown.map((entry) => (
                    <div key={entry.label} className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded-lg">
                      <span className="text-[8px] font-black uppercase text-white/40">{entry.label}</span>
                      <span className="text-[9px] font-black text-neon">${Number(entry.total || 0).toLocaleString('es-AR')}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-[10px] text-white/30 uppercase tracking-widest">Sin datos</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
          <p className="text-[9px] text-white/40 uppercase tracking-widest mb-2">Notas</p>
          <p className="text-xs text-white/70">{record.closing_notes || 'Sin observaciones.'}</p>
        </div>
      </div>
    </div>
  );
};

export default Finance;
