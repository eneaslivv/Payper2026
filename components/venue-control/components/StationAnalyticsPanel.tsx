import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { BarChart3, Package, QrCode, TrendingUp, Clock, Users } from 'lucide-react';

interface StationStats {
    name: string;
    ordersToday: number;
    ordersTotal: number;
    avgPrepTime?: number;
}

const StationAnalyticsPanel: React.FC = () => {
    const { profile } = useAuth();
    const [stations, setStations] = useState<StationStats[]>([]);
    const [loading, setLoading] = useState(true);
    const [totals, setTotals] = useState({ ordersToday: 0, ordersTotal: 0 });

    useEffect(() => {
        if (!profile?.store_id) return;
        fetchStationStats();

        // Refresh every 30 seconds
        const interval = setInterval(fetchStationStats, 30000);
        return () => clearInterval(interval);
    }, [profile?.store_id]);

    const fetchStationStats = async () => {
        if (!profile?.store_id) return;

        try {
            // Get dispatch stations
            const { data: stationsData } = await supabase
                .from('dispatch_stations' as any)
                .select('name')
                .eq('store_id', profile.store_id)
                .eq('is_visible', true);

            // Get today's date range
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);

            // Get all orders with dispatch_station
            const { data: ordersData } = await supabase
                .from('orders' as any)
                .select('dispatch_station, created_at')
                .eq('store_id', profile.store_id)
                .not('dispatch_station', 'is', null);

            // Calculate stats per station
            const stationNames = stationsData?.map((s: any) => s.name) || [];
            const stats: StationStats[] = stationNames.map(name => {
                const stationOrders = ordersData?.filter((o: any) => o.dispatch_station === name) || [];
                const todayOrders = stationOrders.filter((o: any) => new Date(o.created_at) >= todayStart);

                return {
                    name,
                    ordersToday: todayOrders.length,
                    ordersTotal: stationOrders.length,
                };
            });

            // Sort by today's orders (descending)
            stats.sort((a, b) => b.ordersToday - a.ordersToday);

            // Calculate totals
            const totalToday = stats.reduce((sum, s) => sum + s.ordersToday, 0);
            const totalAll = stats.reduce((sum, s) => sum + s.ordersTotal, 0);

            setStations(stats);
            setTotals({ ordersToday: totalToday, ordersTotal: totalAll });
        } catch (err) {
            console.error('Error fetching station stats:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="flex items-center gap-3 text-zinc-500">
                    <div className="w-5 h-5 border-2 border-zinc-700 border-t-[#36e27b] rounded-full animate-spin" />
                    <span className="text-xs font-bold uppercase tracking-widest">Cargando...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-6 overflow-y-auto">
            {/* HEADER */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#36e27b]/10 border border-[#36e27b]/20 flex items-center justify-center">
                    <BarChart3 className="w-5 h-5 text-[#36e27b]" />
                </div>
                <div>
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">Analytics</h2>
                    <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Por Estación</p>
                </div>
            </div>

            {/* TOTALS */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-[#36e27b]" />
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Hoy</span>
                    </div>
                    <p className="text-2xl font-black text-white">{totals.ordersToday}</p>
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider mt-1">Pedidos escaneados</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Package className="w-4 h-4 text-amber-400" />
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Total</span>
                    </div>
                    <p className="text-2xl font-black text-white">{totals.ordersTotal}</p>
                    <p className="text-[9px] text-zinc-600 uppercase tracking-wider mt-1">Histórico</p>
                </div>
            </div>

            {/* STATIONS LIST */}
            {stations.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40">
                    <QrCode className="w-12 h-12 text-zinc-600 mb-4" />
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Sin estaciones</p>
                    <p className="text-[10px] text-zinc-600 mt-2 max-w-[200px]">
                        Crea estaciones de despacho para ver métricas por barra
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest mb-3">
                        Rendimiento por Estación
                    </p>
                    {stations.map((station, idx) => {
                        const maxToday = Math.max(...stations.map(s => s.ordersToday), 1);
                        const barWidth = (station.ordersToday / maxToday) * 100;

                        return (
                            <div key={station.name} className="bg-zinc-900/30 border border-zinc-800/50 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-black text-zinc-600 w-5">#{idx + 1}</span>
                                        <span className="text-xs font-black text-white uppercase tracking-wide">{station.name}</span>
                                    </div>
                                    <span className="text-lg font-black text-[#36e27b]">{station.ordersToday}</span>
                                </div>

                                {/* Progress Bar */}
                                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-[#36e27b] to-[#2ecc71] rounded-full transition-all duration-500"
                                        style={{ width: `${barWidth}%` }}
                                    />
                                </div>

                                <div className="flex justify-between mt-2">
                                    <span className="text-[9px] text-zinc-600">HOY</span>
                                    <span className="text-[9px] text-zinc-600">Total: {station.ordersTotal}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default StationAnalyticsPanel;
