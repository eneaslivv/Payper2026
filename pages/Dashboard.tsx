import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { sendEmailNotification } from '../lib/notifications';
import SmartInsights from '../components/SmartInsights';
import { useToast } from '../components/ToastSystem';

const AreaChart = React.lazy(() => import('recharts').then((mod) => ({ default: mod.AreaChart })));
const Area = React.lazy(() => import('recharts').then((mod) => ({ default: mod.Area })));
const XAxis = React.lazy(() => import('recharts').then((mod) => ({ default: mod.XAxis })));
const YAxis = React.lazy(() => import('recharts').then((mod) => ({ default: mod.YAxis })));
const CartesianGrid = React.lazy(() => import('recharts').then((mod) => ({ default: mod.CartesianGrid })));
const Tooltip = React.lazy(() => import('recharts').then((mod) => ({ default: mod.Tooltip })));
const ResponsiveContainer = React.lazy(() => import('recharts').then((mod) => ({ default: mod.ResponsiveContainer })));

// Empty initial data for chart
const initialChartData = [
  { name: '00:00', value: 0 },
  { name: '04:00', value: 0 },
  { name: '08:00', value: 0 },
  { name: '12:00', value: 0 },
  { name: '16:00', value: 0 },
  { name: '20:00', value: 0 },
];

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [isBriefing, setIsBriefing] = useState(false);
  const [briefingText, setBriefingText] = useState<string | null>(null);
  const hasStockErrorAlerted = useRef(false);

  // Track theme for chart colors
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));

  useEffect(() => {
    // Listen for theme changes from global toggle
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!profile?.store_id || hasStockErrorAlerted.current) return;

    const fetchStockErrors = async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('stock_deduction_errors' as any)
        .select('id, created_at')
        .eq('store_id', profile.store_id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.warn('[Dashboard] Stock deduction errors fetch failed:', error);
        return;
      }

      if (data && data.length > 0) {
        addToast(`${data.length} errores de stock en últimas 24h`, 'warning', 'Revisar deducciones');
      }

      hasStockErrorAlerted.current = true;
    };

    fetchStockErrors();
  }, [profile?.store_id, addToast]);

  const handleTestEmail = async () => {
    if (!profile?.email) return alert('No tienes email en tu perfil');
    const confirmed = confirm(`¿Enviar correo de prueba a ${profile.email}?`);
    if (!confirmed) return;

    alert('Enviando...');
    const result = await sendEmailNotification({
      to: profile.email,
      subject: 'Prueba de Sistema Payper',
      html: `
        <div style="font-family: sans-serif; color: #333;">
          <h1 style="color: #00ff9d;">Sistema Operativo</h1>
          <p>Esta es una prueba de integración con <strong>Resend</strong>.</p>
          <p>Si lees esto, las Edge Functions están funcionando correctamente.</p>
        </div>
      `
    });

    if (result.success) {
      alert('✅ Correo enviado con éxito. Revisa tu bandeja de entrada.');
    } else {
      alert('❌ Error al enviar: ' + result.error);
    }
  };

  /* LEGACY METRICS STATE (Kept for compatibility) */
  const [metrics, setMetrics] = useState({
    revenue: 0,
    ordersCount: 0,
    avgTicket: 0,
    stockStatus: 'OPTIMAL' as 'OPTIMAL' | 'WARNING' | 'CRITICAL'
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [chartData, setChartData] = useState(initialChartData);

  /* FINANCIAL STATE */
  const [financials, setFinancials] = useState<any>(null);
  const [isLoadingFinancials, setIsLoadingFinancials] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    end: new Date(new Date().setHours(23, 59, 59, 999)).toISOString()
  });

  const [dispatchStations, setDispatchStations] = useState<{ id: string; name: string }[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [stationStats, setStationStats] = useState<any>(null);
  const [stationLoading, setStationLoading] = useState(false);

  useEffect(() => {
    if (!profile?.store_id) return;
    (supabase as any)
      .from('dispatch_stations')
      .select('id, name, is_visible, sort_order')
      .eq('store_id', profile.store_id)
      .eq('is_visible', true)
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setDispatchStations((data || []).map((station: any) => ({ id: station.id, name: station.name })));
      });
  }, [profile?.store_id]);

  useEffect(() => {
    if (!profile?.store_id) return;

    const fetchStationStats = async () => {
      setStationLoading(true);
      try {
        let query = (supabase as any)
          .from('sales_by_dispatch_station')
          .select('dispatch_station, zone_name, total_orders, total_sales, cash_sales, card_sales, wallet_sales, mp_sales, sale_date, store_id')
          .eq('store_id', profile.store_id);

        if (selectedStation) {
          query = query.eq('dispatch_station', selectedStation);
        }

        if (dateRange?.start) {
          query = query.gte('sale_date', dateRange.start);
        }

        if (dateRange?.end) {
          query = query.lte('sale_date', dateRange.end);
        }

        const { data, error } = await query;
        if (error) throw error;

        const totals = (data || []).reduce((acc: any, row: any) => {
          acc.total_orders += Number(row.total_orders || 0);
          acc.total_sales += Number(row.total_sales || 0);
          acc.cash_sales += Number(row.cash_sales || 0);
          acc.card_sales += Number(row.card_sales || 0);
          acc.wallet_sales += Number(row.wallet_sales || 0);
          acc.mp_sales += Number(row.mp_sales || 0);
          return acc;
        }, { total_orders: 0, total_sales: 0, cash_sales: 0, card_sales: 0, wallet_sales: 0, mp_sales: 0 });

        if ((data || []).length === 0) {
          setStationStats(null);
          return;
        }

        setStationStats({
          dispatch_station: selectedStation || 'Todas',
          zone_name: data?.[0]?.zone_name || 'Sin zona',
          ...totals
        });
      } catch (err) {
        console.warn('[Dashboard] Station stats fetch failed:', err);
        setStationStats(null);
      } finally {
        setStationLoading(false);
      }
    };

    fetchStationStats();
  }, [profile?.store_id, selectedStation, dateRange]);



  // Fixed Expenses State




  /* LOAD DATA */
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!profile?.store_id) return;

      setIsLoadingFinancials(true);
      try {
        // 1. Fetch KPI Metrics
        const { data: finData, error } = await supabase.rpc('get_financial_metrics' as any, {
          p_start_date: dateRange.start,
          p_end_date: dateRange.end,
          p_store_id: profile.store_id
        });

        if (error) throw error;
        setFinancials(finData);

        // Update basic metrics
        if (finData) {
          setMetrics({
            revenue: finData.gross_revenue || 0,
            ordersCount: finData.total_orders || 0,
            avgTicket: finData.total_orders > 0 ? (finData.gross_revenue / finData.total_orders) : 0,
            stockStatus: 'OPTIMAL'
          });
        }



      } catch (err) {
        console.error("Financial fetch error:", err);
      } finally {
        setIsLoadingFinancials(false);
      }

      // 3. Fetch Recent Orders (Keep existing logic)
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('store_id', profile.store_id)
        .order('created_at', { ascending: false })
        .limit(10);

      const uiOrders = (orders || []).map((o: any) => ({
        id: o.id.substring(0, 8),
        customer: o.customer_name || 'Cliente',
        status: o.status || 'pending',
        items: [{ name: `Pedido #${o.order_number || o.id.substring(0, 4)}` }]
      }));
      setRecentOrders(uiOrders);
    };

    if (profile?.store_id) {
      fetchDashboardData();
    }
  }, [profile, dateRange, navigate]);

  const handleGenerateBriefing = async () => {
    setIsBriefing(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      if (!apiKey) {
        setBriefingText("Configuración de IA no detectada. Contacte a soporte.");
        return;
      }

      const prompt = `Analiza KPIs de cafetería hoy:
      - Ventas Brutas: $${financials?.gross_revenue || 0}
      - Flujo de Caja (Topups + Ventas Directas): $${financials?.net_cash_flow || 0}
      - Pedidos: ${financials?.total_orders || 0}
      - Gastos Variables (Mermas/Regalos): $${financials?.expenses?.variable_total || 0}
      - Ganancia Neta Est: $${financials?.profitability?.net_profit || 0}
      
      Dame un briefing táctico corto y motivador para el equipo.`;

      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      setBriefingText(response.text() || "Reporte interrumpido.");
    } catch (e) {
      console.error("AI Error:", e);
      setBriefingText("Error de enlace neuronal. No se pudo conectar con la IA.");
    } finally {
      setIsBriefing(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-5 max-w-[1400px] mx-auto animate-in fade-in duration-500 pb-20 bg-[#F8F9F7] dark:bg-transparent min-h-screen text-[#37352F] dark:text-white transition-colors duration-300">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-neon font-bold text-[9px] uppercase tracking-[0.2em] opacity-80">
            <span className="size-1 rounded-full bg-emerald-600 dark:bg-neon"></span>
            OPERATIONAL HUB ALPHA
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl italic-black tracking-tighter text-[#37352F] dark:text-white uppercase leading-none">
            MANDO <span className="text-emerald-600 dark:text-neon">CENTRAL</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-[8px] font-black text-amber-600 dark:text-accent bg-amber-100 dark:bg-accent/10 px-2 py-1 rounded border border-amber-200 dark:border-accent/20 uppercase tracking-[0.15em]">ELITE ACCESS</span>
            <p className="text-[#9B9A97] dark:text-[#71766F] text-[10px] font-bold uppercase tracking-wider opacity-60">SQUAD #4829 • <span className="text-amber-600 dark:text-accent">MESA 05 ACTIVE</span></p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            onClick={handleTestEmail}
            className="bg-white dark:bg-[#141714] border border-gray-200 dark:border-white/5 hover:border-emerald-500 dark:hover:border-neon px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl flex items-center gap-2 sm:gap-3 shadow-sm dark:shadow-soft transition-colors group"
          >
            <span className="material-symbols-outlined text-gray-400 dark:text-white/40 group-hover:text-emerald-600 dark:group-hover:text-neon transition-colors text-lg sm:text-xl">mark_email_read</span>
            <div className="flex flex-col text-left hidden sm:flex">
              <span className="text-[8px] font-black uppercase text-[#9B9A97] dark:text-[#71766F] tracking-[0.15em] leading-none mb-1">DEBUG</span>
              <span className="text-[10px] font-black uppercase text-[#37352F] dark:text-white tracking-widest leading-none">TEST EMAIL</span>
            </div>
          </button>

          <div className="bg-white dark:bg-[#141714] border border-gray-200 dark:border-white/5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl flex items-center gap-2 sm:gap-3 shadow-sm dark:shadow-soft">
            <span className="material-symbols-outlined text-emerald-600 dark:text-neon text-lg sm:text-xl animate-pulse">sensors</span>
            <div className="flex flex-col text-left">
              <span className="text-[8px] font-black uppercase text-[#9B9A97] dark:text-[#71766F] tracking-[0.15em] leading-none mb-1">SISTEMA</span>
              <span className="text-[10px] font-black uppercase text-[#37352F] dark:text-white tracking-widest leading-none">EN LÍNEA</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden group">
        {/* Animated gradient border */}
        <div className="absolute -inset-[1px] rounded-2xl sm:rounded-3xl bg-gradient-to-r from-emerald-500/40 via-emerald-300/20 to-emerald-500/40 dark:from-neon/50 dark:via-neon/10 dark:to-neon/50 opacity-60 group-hover:opacity-100 transition-opacity duration-700" style={{ backgroundSize: '200% 100%', animation: 'shimmer 3s ease-in-out infinite' }} />

        <div className="relative p-4 sm:p-6 bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-[#0D120D] dark:via-[#111611] dark:to-[#0A0F0A] rounded-2xl sm:rounded-3xl">

          {/* Scan line effect */}
          <div className="absolute inset-0 overflow-hidden rounded-2xl sm:rounded-3xl pointer-events-none">
            <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.03]" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 3px)', backgroundSize: '100% 4px' }} />
            <div className="absolute w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 dark:via-neon/40 to-transparent" style={{ animation: 'scanline 4s ease-in-out infinite' }} />
          </div>

          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-emerald-500/20 dark:border-neon/20 rounded-tl-2xl sm:rounded-tl-3xl" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-emerald-500/20 dark:border-neon/20 rounded-tr-2xl sm:rounded-tr-3xl" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-emerald-500/20 dark:border-neon/20 rounded-bl-2xl sm:rounded-bl-3xl" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-emerald-500/20 dark:border-neon/20 rounded-br-2xl sm:rounded-br-3xl" />

          {/* Background glyph */}
          <div className="absolute top-1/2 right-6 sm:right-10 -translate-y-1/2 opacity-[0.02] dark:opacity-[0.04] group-hover:opacity-[0.06] transition-opacity duration-700 pointer-events-none hidden sm:block">
            <span className="material-symbols-outlined text-[120px] text-emerald-900 dark:text-neon">radar</span>
          </div>

          {/* Content */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 relative z-10">
            <div className="space-y-3 max-w-2xl">
              {/* Status bar */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-neon animate-pulse shadow-[0_0_6px_rgba(74,222,128,0.5)] dark:shadow-[0_0_6px_var(--neon)]" />
                  <span className="text-[7px] font-black uppercase tracking-[0.5em] text-emerald-600/70 dark:text-neon/70">ACTIVO</span>
                </div>
                <div className="h-3 w-px bg-emerald-500/20 dark:bg-neon/20" />
                <span className="text-[7px] font-mono uppercase tracking-[0.3em] text-[#9B9A97] dark:text-[#71766F]">v2.0</span>
              </div>

              {/* Title */}
              <div className="space-y-1">
                <h3 className="text-[10px] sm:text-xs font-black uppercase tracking-[0.35em] text-emerald-600 dark:text-neon flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm opacity-70">neurology</span>
                  SQUADAI TACTICAL BRIEFING
                </h3>
                <p className="text-[11px] sm:text-xs font-medium text-[#37352F]/60 dark:text-white/50 leading-relaxed max-w-lg">
                  {briefingText || "Análisis de inteligencia operativa impulsado por IA. Genera un reporte táctico basado en tus métricas en tiempo real."}
                </p>
              </div>
            </div>

            {/* CTA Button */}
            <button
              onClick={handleGenerateBriefing}
              disabled={isBriefing}
              className={`relative px-6 sm:px-8 h-11 sm:h-12 rounded-xl sm:rounded-2xl font-black text-[8px] sm:text-[9px] uppercase tracking-[0.25em] transition-all active:scale-95 flex items-center gap-2.5 sm:gap-3 shrink-0 w-full sm:w-auto justify-center overflow-hidden ${
                isBriefing
                  ? 'bg-emerald-500/10 dark:bg-neon/10 text-emerald-600 dark:text-neon border border-emerald-500/30 dark:border-neon/30'
                  : 'bg-gradient-to-r from-emerald-500 to-emerald-600 dark:from-neon dark:to-emerald-400 text-white dark:text-black shadow-lg shadow-emerald-500/25 dark:shadow-neon/25 hover:shadow-xl hover:shadow-emerald-500/40 dark:hover:shadow-neon/40 hover:scale-[1.03]'
              }`}
            >
              {isBriefing && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-emerald-500/10 dark:via-neon/10 to-transparent" style={{ animation: 'shimmer 1.5s ease-in-out infinite', backgroundSize: '200% 100%' }} />
              )}
              <span className={`material-symbols-outlined text-base sm:text-lg relative z-10 ${isBriefing ? 'animate-spin' : ''}`}>
                {isBriefing ? 'progress_activity' : 'auto_awesome'}
              </span>
              <span className="relative z-10">{isBriefing ? 'PROCESANDO INTEL...' : 'GENERAR BRIEFING'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Keyframe animations for briefing card */}
      <style>{`
        @keyframes shimmer { 0%, 100% { background-position: 200% 0; } 50% { background-position: -200% 0; } }
        @keyframes scanline { 0% { top: -2px; } 100% { top: 100%; } }
      `}</style>

      {/* FINANCIAL OVERVIEW */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatusCard
          label="VENTAS TOTALES"
          value={`$${(financials?.gross_revenue || 0).toLocaleString()}`}
          status="REVENUE"
          progress={100}
          icon="payments"
          color="text-emerald-600 dark:text-neon"
          barColor="bg-emerald-500 dark:bg-neon"
        />
        <StatusCard
          label="FLUJO DE CAJA (REAL)"
          value={`$${(financials?.net_cash_flow || 0).toLocaleString()}`}
          status={financials?.net_cash_flow > 0 ? "POSITIVE" : "NEUTRAL"}
          progress={100}
          icon="account_balance_wallet"
          color="text-[#37352F] dark:text-white"
          barColor="bg-[#37352F] dark:bg-white"
        />
        <StatusCard
          label="GANANCIA NETA (EST)"
          value={`$${(financials?.profitability?.net_profit || 0).toLocaleString()}`}
          status={(financials?.profitability?.margin_percent || 0) + "% MARGIN"}
          progress={Math.min(Math.max(financials?.profitability?.margin_percent || 0, 0), 100)}
          icon="trending_up"
          color={(financials?.profitability?.net_profit || 0) >= 0 ? "text-amber-600 dark:text-accent" : "text-red-500"}
          barColor={(financials?.profitability?.net_profit || 0) >= 0 ? "bg-amber-500 dark:bg-accent" : "bg-red-500"}
        />
        <StatusCard
          label="GASTOS / MERMAS"
          value={`$${(financials?.expenses?.variable_total || 0).toLocaleString()}`}
          status="COSTS"
          progress={100}
          icon="delete_forever"
          color="text-orange-500"
          barColor="bg-orange-500"
        />
      </div>

      {/* DETAILED EXPENSE BREAKDOWN */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-[#141714] rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-white/5 p-4 sm:p-6 shadow-sm dark:shadow-soft hover:border-red-500/20 transition-colors">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500 dark:text-red-400 mb-3 sm:mb-4">PÉRDIDAS OPERATIVAS</h3>
          <div className="flex justify-between items-end">
            <span className="text-2xl sm:text-3xl font-black italic-black text-[#37352F] dark:text-white">$ {(financials?.expenses?.operational_loss || 0).toLocaleString()}</span>
            <span className="material-symbols-outlined text-3xl sm:text-4xl text-gray-200 dark:text-white/5">broken_image</span>
          </div>
          <p className="text-[9px] text-[#9B9A97] dark:text-white/40 font-bold uppercase mt-2">Vencidos, Rotos, Robos</p>
        </div>

        <div className="bg-white dark:bg-[#141714] rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-white/5 p-4 sm:p-6 shadow-sm dark:shadow-soft hover:border-amber-500/20 dark:hover:border-accent/20 transition-colors">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-600 dark:text-accent mb-3 sm:mb-4">INVERSIÓN MARKETING</h3>
          <div className="flex justify-between items-end">
            <span className="text-2xl sm:text-3xl font-black italic-black text-[#37352F] dark:text-white">$ {(financials?.expenses?.marketing || 0).toLocaleString()}</span>
            <span className="material-symbols-outlined text-3xl sm:text-4xl text-gray-200 dark:text-white/5">card_giftcard</span>
          </div>
          <p className="text-[9px] text-[#9B9A97] dark:text-white/40 font-bold uppercase mt-2">Regalos y Cortesías</p>
        </div>

        <div className="bg-white dark:bg-[#141714] rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-white/5 p-4 sm:p-6 shadow-sm dark:shadow-soft hover:border-purple-500/20 transition-colors">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-600 dark:text-purple-400 mb-3 sm:mb-4">CONSUMO INTERNO (PR)</h3>
          <div className="flex justify-between items-end">
            <span className="text-2xl sm:text-3xl font-black italic-black text-[#37352F] dark:text-white">$ {(financials?.expenses?.internal || 0).toLocaleString()}</span>
            <span className="material-symbols-outlined text-3xl sm:text-4xl text-gray-200 dark:text-white/5">group</span>
          </div>
          <p className="text-[9px] text-[#9B9A97] dark:text-white/40 font-bold uppercase mt-2">Consumo de Staff / Socios</p>
        </div>
      </div>



      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 pt-2">
        <div className="lg:col-span-8 bg-white dark:bg-[#141714] rounded-2xl sm:rounded-3xl border border-gray-200 dark:border-white/5 p-4 sm:p-6 shadow-sm dark:shadow-soft">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 sm:gap-0 mb-6 sm:mb-8">
            <div>
              <h3 className="text-base sm:text-lg font-black italic uppercase tracking-tighter text-[#37352F] dark:text-white leading-none">FLUJO DE OPERACIONES</h3>
              <p className="text-[9px] font-black text-[#9B9A97] dark:text-[#71766F] uppercase tracking-[0.2em] mt-1">TIEMPO DE RESPUESTA OPERATIVO</p>
            </div>
            <div className="flex gap-2">
              <button className="px-3 sm:px-4 py-1.5 rounded-lg bg-emerald-50 dark:bg-neon/10 text-emerald-600 dark:text-neon font-black text-[8px] uppercase border border-emerald-100 dark:border-neon/20 shadow-sm dark:shadow-neon-soft">REAL TIME</button>
              <button className="px-3 sm:px-4 py-1.5 rounded-lg text-[8px] font-black uppercase text-[#9B9A97] dark:text-[#71766F] border border-gray-200 dark:border-white/5">HISTORY</button>
            </div>
          </div>
          <div className="h-64 w-full">
            <Suspense fallback={
              <div className="h-full w-full flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-[#9B9A97] dark:text-[#71766F]">
                Cargando gráfico...
              </div>
            }>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="neonGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isDarkMode ? "#4ADE80" : "#059669"} stopOpacity={0.1} />
                      <stop offset="95%" stopColor={isDarkMode ? "#4ADE80" : "#059669"} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke={isDarkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.05)"} strokeDasharray="5 5" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: isDarkMode ? '#71766F' : '#9B9A97', fontWeight: 800 }} />
                  <YAxis hide />
                  <Tooltip contentStyle={{ backgroundColor: isDarkMode ? '#141714' : '#FFFFFF', borderRadius: '0.75rem', border: isDarkMode ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.1)', color: isDarkMode ? '#fff' : '#1A1D19', fontSize: '10px' }} />
                  <Area type="monotone" dataKey="value" stroke={isDarkMode ? "#4ADE80" : "#059669"} strokeWidth={2} fillOpacity={1} fill="url(#neonGradient)" dot={{ r: 3, fill: isDarkMode ? '#4ADE80' : '#059669', strokeWidth: 1, stroke: isDarkMode ? '#141714' : '#FFFFFF' }} />
                </AreaChart>
              </ResponsiveContainer>
            </Suspense>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <SmartInsights storeId={profile?.store_id} />

          <div className="bg-white dark:bg-[#141714] rounded-3xl border border-gray-200 dark:border-white/5 p-5 shadow-sm dark:shadow-soft flex flex-col h-[440px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-[#37352F] dark:text-white italic">MONITOR DESPACHO</h3>
              <div className="flex items-center gap-2">
                <select
                  value={selectedStation}
                  onChange={(e) => setSelectedStation(e.target.value)}
                  className="text-[8px] font-black uppercase tracking-widest bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/10 rounded-lg px-2 py-1 text-[#37352F] dark:text-white"
                >
                  <option value="">Todas</option>
                  {dispatchStations.map((station) => (
                    <option key={station.id} value={station.name}>{station.name}</option>
                  ))}
                </select>
                <span className="text-[8px] font-black text-emerald-600 dark:text-neon bg-emerald-50 dark:bg-neon/5 px-2 py-0.5 rounded border border-emerald-100 dark:border-neon/20 tracking-widest animate-pulse">LIVE</span>
              </div>
            </div>

            <div className="mb-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02] p-4">
              <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-[0.2em] text-[#9B9A97] dark:text-[#71766F]">
                <span>Estación</span>
                <span className="text-[#37352F] dark:text-white">{selectedStation || 'Todas'}</span>
              </div>
              {stationLoading ? (
                <p className="mt-3 text-[8px] font-black uppercase tracking-widest text-[#9B9A97] dark:text-[#71766F] animate-pulse">Cargando estadísticas...</p>
              ) : stationStats ? (
                <div className="mt-3 grid grid-cols-2 gap-3 text-[9px] font-black uppercase">
                  <div className="flex flex-col gap-1">
                    <span className="text-[#9B9A97] dark:text-[#71766F]">Pedidos</span>
                    <span className="text-[#37352F] dark:text-white">{stationStats.total_orders}</span>
                  </div>
                  <div className="flex flex-col gap-1 text-right">
                    <span className="text-[#9B9A97] dark:text-[#71766F]">Ventas</span>
                    <span className="text-[#37352F] dark:text-white">${stationStats.total_sales.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[#9B9A97] dark:text-[#71766F]">Efectivo</span>
                    <span className="text-emerald-600 dark:text-neon">${stationStats.cash_sales.toLocaleString()}</span>
                  </div>
                  <div className="flex flex-col gap-1 text-right">
                    <span className="text-[#9B9A97] dark:text-[#71766F]">Wallet/MP</span>
                    <span className="text-[#37352F] dark:text-white">${(stationStats.wallet_sales + stationStats.mp_sales).toLocaleString()}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-[8px] font-black uppercase tracking-widest text-[#9B9A97] dark:text-[#71766F]">Sin datos</p>
              )}
            </div>
            <div className="space-y-2.5 flex-1 overflow-y-auto custom-scrollbar">
              {recentOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-30">
                  <span className="material-symbols-outlined text-3xl mb-2 text-[#37352F] dark:text-white">inbox</span>
                  <p className="text-[8px] font-black uppercase tracking-widest text-[#37352F] dark:text-white">Sin Pedidos Recientes</p>
                </div>
              ) : (
                recentOrders.map(order => (
                  <div key={order.id} className="p-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.01] border border-gray-200 dark:border-white/5 flex items-center justify-between group cursor-pointer hover:border-emerald-500/30 dark:hover:border-neon/30 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-white dark:bg-white/[0.05] border border-gray-200 dark:border-white/5 flex items-center justify-center font-black text-[9px] text-[#37352F] dark:text-white group-hover:text-emerald-600 dark:group-hover:text-neon group-hover:border-emerald-100 dark:group-hover:border-neon/20 transition-all">
                        #{order.id}
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase italic tracking-tight text-[#37352F] dark:text-white leading-tight">{order.items[0].name}</p>
                        <p className="text-[8px] font-bold text-[#9B9A97] dark:text-[#71766F] uppercase mt-0.5 opacity-60 tracking-wider leading-none">{order.customer}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-emerald-600 dark:text-neon uppercase tracking-widest mb-1 leading-none">{order.status.toUpperCase()}</p>
                      <div className="w-10 h-0.5 bg-gray-200 dark:bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 dark:bg-neon shadow-sm dark:shadow-neon-soft" style={{ width: '100%' }}></div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button className="w-full mt-6 h-10 bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 text-[#9B9A97] dark:text-white/60 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] hover:bg-emerald-500 dark:hover:bg-neon hover:text-white dark:hover:text-black transition-all shrink-0">
              FULL MONITOR VIEW
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

const StatusCard: React.FC<{ label: string, value: string, status: string, progress: number, icon: string, isWarning?: boolean, color: string, barColor: string }> = ({ label, value, status, progress, icon, isWarning, color, barColor }) => (
  <div className={`bg-white dark:bg-[#141714] p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-white/5 space-y-3 sm:space-y-5 transition-all hover:-translate-y-1 group shadow-sm dark:shadow-soft relative overflow-hidden`}>
    <div className="flex justify-between items-start">
      <div className={`size-8 sm:size-10 rounded-lg sm:rounded-xl flex items-center justify-center bg-gray-50 dark:bg-white/[0.02] border border-gray-200 dark:border-white/5 ${color} group-hover:scale-105 transition-transform`}>
        <span className="material-symbols-outlined text-base sm:text-xl">{icon}</span>
      </div>
      <span className={`text-[7px] sm:text-[8px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] ${color}`}>
        {status}
      </span>
    </div>

    <div>
      <p className="text-[7px] sm:text-[8px] font-black text-[#9B9A97] dark:text-[#71766F] uppercase tracking-[0.15em] sm:tracking-[0.2em] mb-0.5 sm:mb-1 leading-none">{label}</p>
      <h3 className={`text-lg sm:text-2xl font-black italic tracking-tighter text-[#37352F] dark:text-white leading-none`}>{value}</h3>
    </div>

    <div className="space-y-1.5 sm:space-y-2">
      <div className="w-full h-0.5 sm:h-1 bg-gray-200 dark:bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full transition-all duration-1000 ${barColor} shadow-sm dark:shadow-neon-soft`} style={{ width: `${progress}%` }}></div>
      </div>
      <div className="flex justify-between text-[6px] sm:text-[7px] font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] text-[#9B9A97] dark:text-[#71766F] opacity-40 leading-none">
        <span>CURRENT</span>
        <span>TARGET</span>
      </div>
    </div>
  </div>
);

export default Dashboard;
