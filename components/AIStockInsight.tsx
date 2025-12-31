import React from 'react';

/**
 * AIStockInsight Component
 * 
 * Future-proof placeholder for AI-driven inventory insights.
 * Currently mocks a "smart" analysis of stock levels vs consumption trends.
 */
interface AIStockInsightProps {
    currentStock: number;
    minStock: number;
    consumptionRate?: string; // e.g. "High", "Low"
}

export const AIStockInsight: React.FC<AIStockInsightProps> = ({ currentStock, minStock, consumptionRate = 'Normal' }) => {
    // Simple logic to mimic AI "concern"
    const isCritical = currentStock <= minStock;
    const isWarning = currentStock <= minStock * 1.5;

    if (!isWarning) return null;

    return (
        <div className={`mt-4 p-3 rounded-xl border flex items-start gap-3 backdrop-blur-sm ${isCritical
                ? 'bg-red-500/10 border-red-500/20'
                : 'bg-yellow-500/10 border-yellow-500/20'
            }`}>
            <div className={`p-2 rounded-full ${isCritical ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                <span className="material-symbols-outlined text-lg">psychology</span>
            </div>

            <div>
                <h4 className={`text-[10px] font-black uppercase tracking-widest mb-1 ${isCritical ? 'text-red-400' : 'text-yellow-400'}`}>
                    AI Insight: {isCritical ? 'Reposición Urgente' : 'Alerta de Consumo'}
                </h4>
                <p className="text-xs text-white/70 leading-relaxed font-medium">
                    {isCritical
                        ? `El stock actual (${currentStock}) está por debajo del mínimo crítico (${minStock}). Se proyecta quiebre de stock en < 24h basado en el consumo histórico.`
                        : `Patrón de consumo ${consumptionRate.toLowerCase()} detectado. Considera reabastecer antes del fin de semana para evitar quiebres.`}
                </p>
            </div>
        </div>
    );
};
