import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { sendEmailNotification } from '../lib/notifications';
import SmartInsights from '../components/SmartInsights';

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
  const [isBriefing, setIsBriefing] = useState(false);
  const [briefingText, setBriefingText] = useState<string | null>(null);

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

  const [metrics, setMetrics] = useState({
    revenue: 0,
    ordersCount: 0,
    avgTicket: 0,
    stockStatus: 'OPTIMAL' as 'OPTIMAL' | 'WARNING' | 'CRITICAL'
  });
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [chartData, setChartData] = useState(initialChartData);

  useEffect(() => {
    // ONBOARDING CHECK REDIRECT REMOVED
    // We shouldn't force redirect users away from Dashboard, it's confusing.
    // Instead we should show a banner or alert if they need to complete setup.

    const fetchDashboardData = async () => {
      if (!profile?.store_id) return;

      // Fetch Orders for Metrics
      const { data: orders } = await supabase
        .from('orders')
        .select('*')
        .eq('store_id', profile.store_id)
        .order('created_at', { ascending: false })
        .limit(50); // Limit for calc

      const totalRevenue = orders?.reduce((sum, order) => sum + (order.total_amount || 0), 0) || 0;
      const totalOrders = orders?.length || 0;
      const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      setMetrics({
        revenue: totalRevenue,
        ordersCount: totalOrders,
        avgTicket: avgTicket,
        stockStatus: 'OPTIMAL' // Placeholder logic, could fetch inventory later
      });

      // Recent Orders for List (mapped to UI format)
      const uiOrders = (orders || []).slice(0, 5).map(o => ({
        id: o.id.substring(0, 8), // Short ID
        customer: o.customer_name || 'Cliente',
        status: o.status || 'pending',
        items: [{ name: `Pedido #${o.id.substring(0, 4)}` }] // Placeholder item name
      }));
      setRecentOrders(uiOrders);
    };

    if (profile?.store_id) {
      // checkOnboarding(); // Removed
      fetchDashboardData();
    }
  }, [profile, navigate]);

  const handleGenerateBriefing = async () => {
    setIsBriefing(true);
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      if (!apiKey) {
        setBriefingText("Configuración de IA no detectada. Contacte a soporte.");
        return;
      }
      const ai = new GoogleGenerativeAI(apiKey);
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = "Analiza KPIs de cafetería: Facturación $" + metrics.revenue + ", " + metrics.ordersCount + " pedidos. Ticket $" + metrics.avgTicket + ". Dame un briefing táctico corto.";
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
    <div className="p-6 md:p-8 space-y-8 max-w-[1400px] mx-auto animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-neon font-bold text-[9px] uppercase tracking-[0.2em] opacity-80">
            <span className="size-1 rounded-full bg-neon"></span>
            OPERATIONAL HUB ALPHA
          </div>
          <h2 className="text-4xl italic-black tracking-tighter text-white uppercase leading-none">
            MANDO <span className="text-neon">CENTRAL</span>
          </h2>
          <div className="flex items-center gap-2.5 mt-2">
            <span className="text-[8px] font-black text-accent bg-accent/10 px-2 py-1 rounded border border-accent/20 uppercase tracking-[0.15em]">ELITE ACCESS</span>
            <p className="text-[#71766F] text-[10px] font-bold uppercase tracking-wider opacity-60">SQUAD #4829 • <span className="text-accent">MESA 05 ACTIVE</span></p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleTestEmail}
            className="bg-[#141714] border border-white/5 hover:border-neon px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-soft transition-colors group"
          >
            <span className="material-symbols-outlined text-white/40 group-hover:text-neon transition-colors text-xl">mark_email_read</span>
            <div className="flex flex-col text-left hidden sm:flex">
              <span className="text-[8px] font-black uppercase text-[#71766F] tracking-[0.15em] leading-none mb-1">DEBUG</span>
              <span className="text-[10px] font-black uppercase text-white tracking-widest leading-none">TEST EMAIL</span>
            </div>
          </button>

          <div className="bg-[#141714] border border-white/5 px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-soft">
            <span className="material-symbols-outlined text-neon text-xl animate-pulse">sensors</span>
            <div className="flex flex-col text-left">
              <span className="text-[8px] font-black uppercase text-[#71766F] tracking-[0.15em] leading-none mb-1">SISTEMA</span>
              <span className="text-[10px] font-black uppercase text-white tracking-widest leading-none">EN LÍNEA</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-3xl bg-[#141714] border border-white/5 shadow-2xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:opacity-[0.06] transition-opacity">
          <span className="material-symbols-outlined text-[80px]">military_tech</span>
        </div>
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
          <div className="space-y-2 max-w-2xl">
            <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-neon italic">SQUADAI TACTICAL BRIEFING</h3>
            <p className="text-sm font-bold text-white/80 leading-relaxed italic">
              {briefingText || "Solicita un reporte de inteligencia para optimizar la incursión operativa de hoy."}
            </p>
          </div>
          <button
            onClick={handleGenerateBriefing}
            disabled={isBriefing}
            className={`px-8 h-11 bg-neon text-black rounded-2xl font-black text-[9px] uppercase tracking-[0.2em] shadow-neon-soft transition-all active:scale-95 flex items-center gap-3 ${isBriefing ? 'animate-pulse' : 'hover:scale-105'}`}
          >
            <span className="material-symbols-outlined text-lg">{isBriefing ? 'sync' : 'auto_awesome'}</span>
            {isBriefing ? 'ANALIZANDO...' : 'GENERAR BRIEFING'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatusCard label="FACTURACIÓN" value={`$${metrics.revenue.toFixed(2)}`} status="ACTIVE" progress={metrics.revenue > 0 ? 50 : 0} icon="payments" color="text-accent" barColor="bg-accent" />
        <StatusCard label="PEDIDOS" value={metrics.ordersCount.toString()} status="READY" progress={metrics.ordersCount > 0 ? 50 : 0} icon="local_fire_department" color="text-neon" barColor="bg-neon" />
        <StatusCard label="TICKET PROM" value={`$${metrics.avgTicket.toFixed(2)}`} status="NORMAL" progress={metrics.avgTicket > 0 ? 50 : 0} icon="show_chart" color="text-accent" barColor="bg-accent" />
        <StatusCard label="STOCK" value={metrics.stockStatus} status="MONITORING" progress={100} icon="inventory_2" color="text-primary" barColor="bg-primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
        <div className="lg:col-span-8 bg-[#141714] rounded-3xl border border-white/5 p-6 shadow-soft">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-lg font-black italic uppercase tracking-tighter text-white leading-none">FLUJO DE OPERACIONES</h3>
              <p className="text-[9px] font-black text-[#71766F] uppercase tracking-[0.2em] mt-1">TIEMPO DE RESPUESTA OPERATIVO</p>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-1.5 rounded-lg bg-neon/10 text-neon font-black text-[8px] uppercase border border-neon/20 shadow-neon-soft">REAL TIME</button>
              <button className="px-4 py-1.5 rounded-lg text-[8px] font-black uppercase text-[#71766F] border border-white/5">HISTORY</button>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="neonGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4ADE80" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#4ADE80" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.02)" strokeDasharray="5 5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#71766F', fontWeight: 800 }} />
                <YAxis hide />
                <Tooltip contentStyle={{ backgroundColor: '#141714', borderRadius: '0.75rem', border: '1px solid rgba(255,255,255,0.05)', color: '#fff', fontSize: '10px' }} />
                <Area type="monotone" dataKey="value" stroke="#4ADE80" strokeWidth={2} fillOpacity={1} fill="url(#neonGradient)" dot={{ r: 3, fill: '#4ADE80', strokeWidth: 1, stroke: '#141714' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <SmartInsights storeId={profile?.store_id} />

          <div className="bg-[#141714] rounded-3xl border border-white/5 p-5 shadow-soft flex flex-col h-[400px]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white italic">MONITOR DESPACHO</h3>
              <span className="text-[8px] font-black text-neon bg-neon/5 px-2 py-0.5 rounded border border-neon/20 tracking-widest animate-pulse">LIVE</span>
            </div>
            <div className="space-y-2.5 flex-1 overflow-y-auto custom-scrollbar">
              {recentOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full opacity-30">
                  <span className="material-symbols-outlined text-3xl mb-2">inbox</span>
                  <p className="text-[8px] font-black uppercase tracking-widest">Sin Pedidos Recientes</p>
                </div>
              ) : (
                recentOrders.map(order => (
                  <div key={order.id} className="p-3.5 rounded-xl bg-white/[0.01] border border-white/5 flex items-center justify-between group cursor-pointer hover:border-neon/30 transition-all">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-white/[0.05] border border-white/5 flex items-center justify-center font-black text-[9px] group-hover:text-neon group-hover:border-neon/20 transition-all">
                        #{order.id}
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase italic tracking-tight text-white leading-tight">{order.items[0].name}</p>
                        <p className="text-[8px] font-bold text-[#71766F] uppercase mt-0.5 opacity-60 tracking-wider leading-none">{order.customer}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[8px] font-black text-neon uppercase tracking-widest mb-1 leading-none">{order.status.toUpperCase()}</p>
                      <div className="w-10 h-0.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-neon shadow-neon-soft" style={{ width: '100%' }}></div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <button className="w-full mt-6 h-10 bg-white/[0.02] border border-white/5 text-white/60 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] hover:bg-neon hover:text-black transition-all shrink-0">
              FULL MONITOR VIEW
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatusCard: React.FC<{ label: string, value: string, status: string, progress: number, icon: string, isWarning?: boolean, color: string, barColor: string }> = ({ label, value, status, progress, icon, isWarning, color, barColor }) => (
  <div className={`bg-[#141714] p-5 rounded-2xl border border-white/5 space-y-5 transition-all hover:-translate-y-1 group shadow-soft relative overflow-hidden`}>
    <div className="flex justify-between items-start">
      <div className={`size-10 rounded-xl flex items-center justify-center bg-white/[0.02] border border-white/5 ${color} group-hover:scale-105 transition-transform`}>
        <span className="material-symbols-outlined text-xl">{icon}</span>
      </div>
      <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${color}`}>
        {status}
      </span>
    </div>

    <div>
      <p className="text-[8px] font-black text-[#71766F] uppercase tracking-[0.2em] mb-1 leading-none">{label}</p>
      <h3 className={`text-2xl font-black italic tracking-tighter text-white leading-none`}>{value}</h3>
    </div>

    <div className="space-y-2">
      <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full transition-all duration-1000 ${barColor} shadow-neon-soft`} style={{ width: `${progress}%` }}></div>
      </div>
      <div className="flex justify-between text-[7px] font-black uppercase tracking-[0.3em] text-[#71766F] opacity-40 leading-none">
        <span>CURRENT</span>
        <span>TARGET</span>
      </div>
    </div>
  </div>
);

export default Dashboard;
