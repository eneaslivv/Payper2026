import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface AuditLog {
    id: string;
    action_type: string;
    quantity_delta: number | null;
    package_delta: number | null;
    unit: string;
    reason: string;
    supplier_id: string | null;
    supplier?: { name: string };
    location_from: string | null;
    location_to: string | null;
    user_id: string | null;
    user?: { full_name: string };
    source_ui: string;
    invoice_ref: string | null;
    unit_cost: number | null;
    old_value: any;
    new_value: any;
    created_at: string;
}

interface InventoryAuditLogProps {
    itemId: string;
    className?: string;
}

const ACTION_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
    purchase: { icon: 'shopping_cart', color: 'text-neon', label: 'COMPRA' },
    loss: { icon: 'delete_forever', color: 'text-red-500', label: 'PÉRDIDA' },
    adjustment: { icon: 'tune', color: 'text-orange-500', label: 'AJUSTE' },
    edit_item: { icon: 'edit', color: 'text-blue-500', label: 'EDICIÓN' },
    transfer: { icon: 'swap_horiz', color: 'text-purple-500', label: 'TRANSFER' },
    recount: { icon: 'inventory_2', color: 'text-cyan-500', label: 'RECONTEO' },
    sale: { icon: 'point_of_sale', color: 'text-yellow-500', label: 'VENTA' },
    open_package: { icon: 'package_2', color: 'text-amber-500', label: 'APERTURA' },
    use_open: { icon: 'water_drop', color: 'text-sky-500', label: 'USO' },
};

export const InventoryAuditLog: React.FC<InventoryAuditLogProps> = ({ itemId, className = '' }) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        if (itemId) fetchLogs();
    }, [itemId]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('inventory_audit_logs' as any)
                .select(`
                    *,
                    supplier:inventory_suppliers(name),
                    user:profiles(full_name)
                `)
                .eq('item_id', itemId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            setLogs(data || []);
        } catch (err: any) {
            console.error('Error fetching audit logs:', err);
        } finally {
            setLoading(false);
        }
    };

    const filteredLogs = filter === 'all'
        ? logs
        : logs.filter(l => l.action_type === filter);

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Ahora';
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 7) return `${diffDays}d`;
        return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
    };

    const formatDelta = (delta: number | null, unit: string) => {
        if (delta === null) return null;
        const sign = delta >= 0 ? '+' : '';
        return `${sign}${delta} ${unit}`;
    };

    const getActionConfig = (type: string) => {
        return ACTION_CONFIG[type] || { icon: 'help', color: 'text-white/40', label: type };
    };

    return (
        <div className={`flex flex-col ${className}`}>
            {/* Filters */}
            <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
                <FilterChip
                    active={filter === 'all'}
                    onClick={() => setFilter('all')}
                    label="Todos"
                    count={logs.length}
                />
                {Object.entries(ACTION_CONFIG).map(([key, config]) => {
                    const count = logs.filter(l => l.action_type === key).length;
                    if (count === 0) return null;
                    return (
                        <FilterChip
                            key={key}
                            active={filter === key}
                            onClick={() => setFilter(key)}
                            label={config.label}
                            count={count}
                            color={config.color}
                        />
                    );
                })}
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="size-8 border-2 border-white/10 border-t-neon rounded-full animate-spin" />
                    </div>
                ) : filteredLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <span className="material-symbols-outlined text-4xl text-white/10 mb-4">history</span>
                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">
                            Sin registros de auditoría
                        </p>
                    </div>
                ) : (
                    <div className="relative">
                        {/* Timeline line */}
                        <div className="absolute left-5 top-0 bottom-0 w-px bg-white/5" />

                        {/* Log entries */}
                        {filteredLogs.map((log, idx) => {
                            const config = getActionConfig(log.action_type);
                            const isExpanded = expandedId === log.id;

                            return (
                                <div
                                    key={log.id}
                                    className="relative pl-12 pb-6 group"
                                >
                                    {/* Icon */}
                                    <div className={`absolute left-2 size-7 rounded-full bg-black border-2 border-white/10 flex items-center justify-center group-hover:border-white/20 transition-colors ${config.color}`}>
                                        <span className="material-symbols-outlined text-sm">{config.icon}</span>
                                    </div>

                                    {/* Content */}
                                    <div
                                        className={`bg-white/[0.02] border border-white/5 rounded-xl p-4 cursor-pointer hover:bg-white/[0.04] transition-all ${isExpanded ? 'bg-white/[0.04]' : ''}`}
                                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                                    >
                                        {/* Header */}
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex flex-col gap-1">
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${config.color}`}>
                                                    {config.label}
                                                </span>
                                                <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">
                                                    {log.reason}
                                                </span>
                                            </div>

                                            <div className="flex flex-col items-end gap-1">
                                                {/* Delta */}
                                                {(log.quantity_delta !== null || log.package_delta !== null) && (
                                                    <span className={`text-sm font-black italic-black ${(log.quantity_delta || 0) >= 0 ? 'text-neon' : 'text-red-500'
                                                        }`}>
                                                        {log.package_delta !== null && log.package_delta !== 0 && (
                                                            <span className="mr-1">
                                                                {log.package_delta >= 0 ? '+' : ''}{log.package_delta} env
                                                            </span>
                                                        )}
                                                        {log.quantity_delta !== null && (
                                                            <span>
                                                                {formatDelta(log.quantity_delta, log.unit || '')}
                                                            </span>
                                                        )}
                                                    </span>
                                                )}

                                                {/* Time */}
                                                <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">
                                                    {formatDate(log.created_at)}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Expanded details */}
                                        {isExpanded && (
                                            <div className="mt-4 pt-4 border-t border-white/5 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                {/* User */}
                                                {log.user?.full_name && (
                                                    <DetailRow
                                                        icon="person"
                                                        label="Usuario"
                                                        value={log.user.full_name}
                                                    />
                                                )}

                                                {/* Supplier */}
                                                {log.supplier?.name && (
                                                    <DetailRow
                                                        icon="storefront"
                                                        label="Proveedor"
                                                        value={log.supplier.name}
                                                    />
                                                )}

                                                {/* Invoice */}
                                                {log.invoice_ref && (
                                                    <DetailRow
                                                        icon="receipt"
                                                        label="Factura"
                                                        value={log.invoice_ref}
                                                    />
                                                )}

                                                {/* Unit cost */}
                                                {log.unit_cost && (
                                                    <DetailRow
                                                        icon="attach_money"
                                                        label="Costo Unit."
                                                        value={`$${log.unit_cost.toLocaleString('es-AR')}`}
                                                    />
                                                )}

                                                {/* Source UI */}
                                                <DetailRow
                                                    icon="touch_app"
                                                    label="Origen"
                                                    value={log.source_ui?.replace('_', ' ') || 'N/A'}
                                                />

                                                {/* Full timestamp */}
                                                <DetailRow
                                                    icon="schedule"
                                                    label="Fecha/Hora"
                                                    value={new Date(log.created_at).toLocaleString('es-AR')}
                                                />

                                                {/* Old/New values (for edits) */}
                                                {log.action_type === 'edit_item' && (log.old_value || log.new_value) && (
                                                    <div className="mt-3 p-3 bg-black/50 rounded-lg">
                                                        <p className="text-[8px] font-black text-white/20 uppercase tracking-widest mb-2">Cambios</p>
                                                        <div className="text-[9px] font-mono text-white/40 overflow-x-auto">
                                                            {log.old_value && (
                                                                <div className="text-red-500/60">- {JSON.stringify(log.old_value)}</div>
                                                            )}
                                                            {log.new_value && (
                                                                <div className="text-neon/60">+ {JSON.stringify(log.new_value)}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Expand indicator */}
                                        <div className="flex justify-center mt-2">
                                            <span className={`material-symbols-outlined text-[10px] text-white/10 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
                                                expand_more
                                            </span>
                                        </div>
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

// Helper components
const FilterChip: React.FC<{
    active: boolean;
    onClick: () => void;
    label: string;
    count: number;
    color?: string;
}> = ({ active, onClick, label, count, color = 'text-neon' }) => (
    <button
        onClick={onClick}
        className={`px-3 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${active
            ? `bg-white/10 ${color} border border-white/10`
            : 'bg-white/[0.02] text-white/30 border border-white/5 hover:text-white/50'
            }`}
    >
        {label} ({count})
    </button>
);

const DetailRow: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
    <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-xs text-white/20">{icon}</span>
        <span className="text-[8px] font-black text-white/30 uppercase tracking-widest w-16">{label}</span>
        <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">{value}</span>
    </div>
);

export default InventoryAuditLog;
