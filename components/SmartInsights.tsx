import React from 'react';
import { useSmartInsights, Insight } from '../hooks/useSmartInsights';

interface SmartInsightsProps {
    storeId?: string;
}

const SmartInsights: React.FC<SmartInsightsProps> = ({ storeId }) => {
    const { insights, loading } = useSmartInsights(storeId);

    if (loading) {
        return (
            <div className="p-6 rounded-3xl bg-[#141714] border border-white/5 h-full min-h-[200px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="size-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[9px] font-black text-white/30 uppercase tracking-widest animate-pulse">Analizando Patrones...</p>
                </div>
            </div>
        );
    }

    if (insights.length === 0) {
        return (
            <div className="p-6 rounded-3xl bg-[#141714] border border-white/5 h-full opacity-50 flex items-center justify-center">
                <p className="text-[10px] text-white/40 uppercase tracking-widest">Sin datos suficientes para análisis</p>
            </div>
        );
    }

    return (
        <div className="p-6 rounded-3xl bg-[#141714] border border-white/5 shadow-soft relative overflow-hidden flex flex-col h-full group">
            {/* HEADER */}
            <div className="flex items-center justify-between mb-6 relative z-10">
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-accent text-xl">psychology</span>
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-white italic uppercase tracking-wider">SQUAD AI INTEL</h3>
                        <p className="text-[8px] font-bold text-accent uppercase tracking-widest opacity-80">Insights Tácticos</p>
                    </div>
                </div>
                <div className="px-3 py-1 bg-white/5 rounded-lg border border-white/5">
                    <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">v2.4 MODEL</span>
                </div>
            </div>

            {/* CONTENT */}
            <div className="space-y-4 relative z-10 flex-1">
                {insights.map((insight, idx) => (
                    <div key={idx} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-accent/30 hover:bg-white/[0.04] transition-all group/item cursor-default">
                        <div className="flex gap-4">
                            <div className={`mt-1 size-2 rounded-full shrink-0 ${insight.type === 'trend' ? 'bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.5)]' :
                                    insight.type === 'alert' ? 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.5)]' :
                                        insight.type === 'opportunity' ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]' :
                                            'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]'
                                }`}></div>

                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-[10px] font-black text-white uppercase tracking-wider">{insight.title}</h4>
                                    <span className="material-symbols-outlined text-[10px] text-white/20 select-none opacity-0 group-hover/item:opacity-100 transition-opacity">{insight.icon}</span>
                                </div>
                                <p className="text-[10px] text-zinc-400 font-medium leading-relaxed">
                                    {insight.description}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* DECORATION */}
            <div className="absolute -bottom-10 -right-10 size-40 bg-accent/5 blur-3xl rounded-full pointer-events-none group-hover:bg-accent/10 transition-colors duration-700"></div>
        </div>
    );
};

export default SmartInsights;
