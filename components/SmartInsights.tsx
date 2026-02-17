import React, { useEffect, useState } from 'react';
import { generateInsights, OrderAnalysis } from '../lib/insights';

interface SmartInsightsProps {
    storeId?: string;
}

type InsightTab = 'PEAK' | 'PRODUCTS' | 'TABLES' | 'PREDICTION';

const SmartInsights: React.FC<SmartInsightsProps> = ({ storeId }) => {
    const [analysis, setAnalysis] = useState<OrderAnalysis | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<InsightTab>('PEAK');

    useEffect(() => {
        if (!storeId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const data = await generateInsights(storeId);
                setAnalysis(data);
            } catch (err) {
                console.error("Failed to load insights", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [storeId]);

    if (loading) {
        return (
            <div className="p-6 rounded-3xl bg-[#141714] border border-white/5 h-full min-h-[300px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="size-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[9px] font-black text-white/30 uppercase tracking-widest animate-pulse">Analizando Patrones de Venta...</p>
                </div>
            </div>
        );
    }

    if (!analysis || analysis.totalOrders === 0) {
        return (
            <div className="p-6 rounded-3xl bg-[#141714] border border-white/5 h-full min-h-[300px] opacity-50 flex items-center justify-center">
                <p className="text-[10px] text-white/40 uppercase tracking-widest">Recolectando Datos Operativos</p>
            </div>
        );
    }

    // Calculations for visualizations
    const maxHourCount = Math.max(...analysis.peakHours.map(h => h.count), 1);
    const maxProductQty = Math.max(...analysis.starProducts.map(p => p.quantity), 1);

    return (
        <div className="p-6 rounded-3xl bg-[#141714] border border-white/5 shadow-soft relative overflow-hidden flex flex-col h-full group min-h-[300px]">
            {/* HEADER */}
            <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-accent text-xl">psychology</span>
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white italic uppercase tracking-wider">SQUAD ANALYTICS</h3>
                        <p className="text-[8px] font-bold text-accent uppercase tracking-widest opacity-80">Inteligencia de Negocio</p>
                    </div>
                </div>
                {/* TABS */}
                <div className="flex bg-white/5 p-1 rounded-lg">
                    <TabButton active={activeTab === 'PEAK'} onClick={() => setActiveTab('PEAK')} icon="schedule" />
                    <TabButton active={activeTab === 'PRODUCTS'} onClick={() => setActiveTab('PRODUCTS')} icon="star" />
                    <TabButton active={activeTab === 'TABLES'} onClick={() => setActiveTab('TABLES')} icon="table_restaurant" />
                    <TabButton active={activeTab === 'PREDICTION'} onClick={() => setActiveTab('PREDICTION')} icon="trending_up" />
                </div>
            </div>

            {/* CONTENT AREA */}
            <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar pr-2">

                {/* PEAK HOURS VIEW */}
                {activeTab === 'PEAK' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex justify-between items-end mb-2">
                            <h4 className="text-[9px] font-black text-white/60 uppercase tracking-widest">Horas de Mayor Demanda</h4>
                            <span className="text-[9px] font-bold text-accent">Top: {analysis.peakHours[0]?.hour}:00hs</span>
                        </div>
                        <div className="flex items-end justify-between h-32 gap-1">
                            {analysis.peakHours.slice(0, 12).sort((a, b) => a.hour - b.hour).map((h) => {
                                const height = (h.count / maxHourCount) * 100;
                                return (
                                    <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group/bar">
                                        <div
                                            className="w-full bg-white/10 rounded-t-sm group-hover/bar:bg-accent transition-all relative"
                                            style={{ height: `${height}%` }}
                                        >
                                            <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[9px] py-0.5 px-1.5 rounded opacity-0 group-hover/bar:opacity-100 whitespace-nowrap z-20 pointer-events-none">
                                                {h.count} orders
                                            </div>
                                        </div>
                                        <span className="text-[8px] font-black text-white/30">{h.hour}h</span>
                                    </div>
                                )
                            })}
                        </div>
                        <div className="p-3 bg-white/[0.02] border border-white/5 rounded-xl mt-4">
                            <p className="text-[9px] text-zinc-400 leading-relaxed italic">
                                <span className="text-accent font-bold">INSIGHT:</span> Tu mayor volumen de ventas ocurre a las <span className="text-white font-bold">{analysis.peakHours[0]?.hour}:00hs</span>. Considera reforzar el personal en este horario.
                            </p>
                        </div>
                    </div>
                )}

                {/* TOP PRODUCTS VIEW */}
                {activeTab === 'PRODUCTS' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <h4 className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-4">Productos Estrella</h4>
                        {analysis.starProducts.slice(0, 5).map((prod, idx) => (
                            <div key={`star-product-${prod.name || idx}`} className="group/prod">
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-[10px] font-bold text-white uppercase tracking-tight truncate max-w-[180px]">{prod.name}</span>
                                    <span className="text-[9px] font-bold text-accent">{prod.quantity} u.</span>
                                </div>
                                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-accent/80 to-accent rounded-full shadow-[0_0_10px_rgba(54,226,123,0.3)] transition-all duration-1000"
                                        style={{ width: `${(prod.quantity / maxProductQty) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* TABLES PERFORMANCE VIEW */}
                {activeTab === 'TABLES' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <h4 className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-4">Rendimiento por Zona</h4>
                        {analysis.tablePerformance.length === 0 ? (
                            <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                                <p className="text-[9px] text-white/30 uppercase text-center">Sin datos de mesas registrados</p>
                            </div>
                        ) : (
                            analysis.tablePerformance.slice(0, 4).map((table, idx) => (
                                <div key={`table-performance-${table.tableName || idx}`} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                    <div className="flex items-center gap-3">
                                        <div className="size-8 rounded bg-white/5 flex items-center justify-center text-[10px] font-black text-white">
                                            {table.tableName.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-white uppercase">{table.tableName}</p>
                                            <p className="text-[8px] font-black text-white/40 uppercase">{table.orderCount} Pedidos</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black text-accent">${table.revenue.toFixed(0)}</p>
                                        <p className="text-[8px] font-bold text-emerald-500 uppercase">+12% vs LY</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* STOCK PREDICTION VIEW */}
                {activeTab === 'PREDICTION' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <h4 className="text-[9px] font-black text-white/60 uppercase tracking-widest mb-4">Forecasting de Demanda</h4>
                        {analysis.stockPredictions.length === 0 ? (
                            <div className="p-4 rounded-xl border border-white/5 bg-white/[0.02]">
                                <p className="text-[9px] text-white/30 uppercase text-center">Recopilando históricos...</p>
                            </div>
                        ) : (
                            analysis.stockPredictions.slice(0, 4).map((pred, idx) => (
                                <div key={`stock-prediction-${pred.productName || idx}`} className="p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group/pred relative overflow-hidden">
                                    <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${pred.riskLevel === 'HIGH' ? 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]' :
                                        pred.riskLevel === 'MEDIUM' ? 'bg-amber-500' : 'bg-emerald-500'
                                        }`}></div>

                                    <div className="flex justify-between items-start pl-2">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[11px] font-bold text-white uppercase tracking-tight">{pred.productName}</span>
                                                {pred.riskLevel === 'HIGH' && (
                                                    <span className="px-1.5 py-0.5 rounded-[4px] bg-red-500/20 text-red-500 border border-red-500/20 text-[7px] font-black uppercase tracking-widest animate-pulse">ALTO CONSUMO</span>
                                                )}
                                            </div>
                                            <p className="text-[9px] text-zinc-400">
                                                Se espera pico de demanda el <span className="text-white font-bold">{pred.predictedHighDemandDay}</span>.
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8px] font-black text-white/30 uppercase mb-0.5">VELOCIDAD</p>
                                            <p className="text-[10px] font-bold text-white">{pred.averageDailySales.toFixed(1)} <span className="text-[8px] text-white/40">/ día</span></p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* DECORATION */}
            <div className="absolute -bottom-10 -right-10 size-40 bg-accent/5 blur-3xl rounded-full pointer-events-none group-hover:bg-accent/10 transition-colors duration-700"></div>
        </div>
    );
};

const TabButton: React.FC<{ active: boolean, onClick: () => void, icon: string }> = ({ active, onClick, icon }) => (
    <button
        onClick={onClick}
        className={`size-7 rounded flex items-center justify-center transition-all ${active ? 'bg-white/10 text-white shadow-sm' : 'text-white/30 hover:text-white hover:bg-white/5'}`}
    >
        <span className="material-symbols-outlined text-base">{icon}</span>
    </button>
);

export default SmartInsights;
