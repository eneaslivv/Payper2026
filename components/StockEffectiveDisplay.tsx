import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface OpenPackage {
    id: string;
    package_capacity: number;
    remaining: number;
    percentage_remaining: number;
    unit: string;
    opened_at: string;
    location_id?: string;
}

interface StockDisplayProps {
    itemId: string;
    closedStock: number;
    packageSize: number;
    contentUnit: string;
    className?: string;
    compact?: boolean;
}

export const StockEffectiveDisplay: React.FC<StockDisplayProps> = ({
    itemId,
    closedStock,
    packageSize,
    contentUnit,
    className = '',
    compact = false
}) => {
    const [openPackages, setOpenPackages] = useState<OpenPackage[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (itemId) fetchOpenPackages();
    }, [itemId]);

    const fetchOpenPackages = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('open_packages' as any)
                .select('*')
                .eq('inventory_item_id', itemId)
                .eq('is_active', true)
                .order('opened_at', { ascending: false });

            if (error) throw error;
            setOpenPackages(data || []);
        } catch (err) {
            console.error('Error fetching open packages:', err);
        } finally {
            setLoading(false);
        }
    };

    // Calcular stock efectivo
    const openCount = openPackages.length;
    const openRemaining = openPackages.reduce((sum, pkg) => sum + pkg.remaining, 0);
    const openAsUnits = packageSize > 0 ? openRemaining / packageSize : 0;
    const effectiveStock = closedStock + openAsUnits;

    // Colores según nivel
    const getStockColor = (value: number, min: number = 2) => {
        if (value <= 0) return 'text-red-500';
        if (value < min) return 'text-orange-500';
        return 'text-neon';
    };

    const getBarColor = (percentage: number) => {
        if (percentage <= 20) return 'bg-red-500';
        if (percentage <= 50) return 'bg-orange-500';
        return 'bg-neon';
    };

    if (compact) {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                <span className={`text-xl font-black italic-black ${getStockColor(effectiveStock)}`}>
                    {effectiveStock.toFixed(1)}
                </span>
                <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
                    env
                </span>
                {openCount > 0 && (
                    <span className="text-[8px] font-bold text-amber-500/60 uppercase tracking-widest">
                        ({openCount} abierto{openCount > 1 ? 's' : ''})
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Stock Efectivo Total */}
            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-neon text-sm">inventory_2</span>
                        <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Stock Efectivo</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className={`text-2xl font-black italic-black ${getStockColor(effectiveStock)}`}>
                            {effectiveStock.toFixed(1)}
                        </span>
                        <span className="text-[10px] font-bold text-white/20 uppercase">envases</span>
                    </div>
                </div>
            </div>

            {/* Desglose */}
            <div className="grid grid-cols-2 gap-3">
                {/* Cerrados */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-xs text-white/20">package_2</span>
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">Cerrados</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-lg font-black italic-black text-white">{closedStock}</span>
                        <span className="text-[9px] font-bold text-white/20">env</span>
                    </div>
                    <p className="text-[8px] text-white/20 mt-1">
                        {closedStock * packageSize} {contentUnit} total
                    </p>
                </div>

                {/* Abiertos */}
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="material-symbols-outlined text-xs text-amber-500/60">local_drink</span>
                        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest">Abiertos</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-lg font-black italic-black text-amber-500">{openCount}</span>
                        <span className="text-[9px] font-bold text-white/20">env</span>
                    </div>
                    <p className="text-[8px] text-white/20 mt-1">
                        {openRemaining.toFixed(0)} {contentUnit} restante
                    </p>
                </div>
            </div>

            {/* Envases Abiertos Detalle */}
            {openCount > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                        <span className="material-symbols-outlined text-xs text-white/10">visibility</span>
                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">
                            Detalle de Abiertos
                        </span>
                    </div>

                    <div className="space-y-2">
                        {openPackages.map((pkg, idx) => (
                            <div
                                key={pkg.id}
                                className="p-3 rounded-xl bg-black/50 border border-white/5 group hover:bg-white/[0.02] transition-all"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="size-5 rounded-full bg-white/5 flex items-center justify-center text-[9px] font-black text-white/40">
                                            {idx + 1}
                                        </span>
                                        <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                                            {pkg.package_capacity} {pkg.unit}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline gap-1">
                                        <span className={`text-sm font-black italic-black ${getStockColor(pkg.percentage_remaining, 30)}`}>
                                            {pkg.remaining.toFixed(0)}
                                        </span>
                                        <span className="text-[8px] font-bold text-white/20">{pkg.unit}</span>
                                    </div>
                                </div>

                                {/* Progress bar */}
                                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${getBarColor(pkg.percentage_remaining)}`}
                                        style={{ width: `${Math.min(100, pkg.percentage_remaining)}%` }}
                                    />
                                </div>

                                <div className="flex items-center justify-between mt-1.5">
                                    <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">
                                        {pkg.percentage_remaining.toFixed(0)}% restante
                                    </span>
                                    <span className="text-[7px] font-bold text-white/10 uppercase tracking-widest">
                                        {formatTimeAgo(pkg.opened_at)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {loading && (
                <div className="flex justify-center py-4">
                    <div className="size-6 border-2 border-white/10 border-t-neon rounded-full animate-spin" />
                </div>
            )}
        </div>
    );
};

// Helper
const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `${diffDays} días`;
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
};

export default StockEffectiveDisplay;
