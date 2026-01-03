import React, { useMemo } from 'react';
import { InventoryItem, Category } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';

interface InventoryReportsProps {
    items: InventoryItem[];
    categories: Category[];
}

export const InventoryReports: React.FC<InventoryReportsProps> = ({ items, categories }) => {

    const metrics = useMemo(() => {
        let totalValue = 0;
        let lowStockCount = 0;
        let totalItems = items.length;
        let valueByCategory: Record<string, number> = {};
        let countByCategory: Record<string, number> = {};

        items.forEach(item => {
            const stock = item.current_stock || 0;
            const cost = item.cost || 0;
            const val = stock * cost;

            totalValue += val;
            if (stock <= (item.min_stock || 0)) lowStockCount++;

            const catName = categories.find(c => c.id === item.category)?.name || 'Sin Categoría';
            valueByCategory[catName] = (valueByCategory[catName] || 0) + val;
            countByCategory[catName] = (countByCategory[catName] || 0) + 1;
        });

        return {
            totalValue,
            lowStockCount,
            totalItems,
            valueByCategory: Object.entries(valueByCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
            countByCategory: Object.entries(countByCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
        };
    }, [items, categories]);

    const COLORS = ['#00F0FF', '#7000FF', '#FF003C', '#FFD600', '#00FF94', '#FFFFFF'];

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* KPI CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Total Value */}
                <div className="bg-[#141714] border border-white/5 p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span className="material-symbols-outlined text-6xl text-neon">payments</span>
                    </div>
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Valor Total de Inventario</p>
                    <h3 className="text-3xl font-black text-white tracking-tighter italic-black">{formatCurrency(metrics.totalValue)}</h3>
                    <p className="text-[10px] text-white/30 mt-2">Costo calculado sobre stock actual</p>
                </div>

                {/* Low Stock */}
                <div className="bg-[#141714] border border-white/5 p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span className="material-symbols-outlined text-6xl text-red-500">warning</span>
                    </div>
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Alertas de Stock</p>
                    <h3 className="text-3xl font-black text-red-500 tracking-tighter italic-black">{metrics.lowStockCount}</h3>
                    <p className="text-[10px] text-white/30 mt-2">Items por debajo del mínimo</p>
                </div>

                {/* Total Items */}
                <div className="bg-[#141714] border border-white/5 p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <span className="material-symbols-outlined text-6xl text-white">inventory_2</span>
                    </div>
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-1">Items Totales</p>
                    <h3 className="text-3xl font-black text-white tracking-tighter italic-black">{metrics.totalItems}</h3>
                    <p className="text-[10px] text-white/30 mt-2">Productos registrados</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Chart: Value by Category */}
                <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6">
                    <h4 className="text-xs font-black text-white/50 uppercase tracking-widest mb-6">Valor por Categoría</h4>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={metrics.valueByCategory} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10, fill: '#666', fontWeight: 700 }} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                    formatter={(value: number) => formatCurrency(value)}
                                />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                                    {metrics.valueByCategory.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Chart: Items by Category */}
                <div className="bg-[#0a0a0a] border border-white/5 rounded-3xl p-6">
                    <h4 className="text-xs font-black text-white/50 uppercase tracking-widest mb-6">Distribución de Items</h4>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={metrics.countByCategory}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {metrics.countByCategory.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="none" />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#000', border: '1px solid #333', borderRadius: '8px' }}
                                    itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};
