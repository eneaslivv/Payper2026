import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { Clock, ShoppingBag, ChevronRight, AlertCircle, Bell, User, RefreshCw, UserRound, Receipt, HelpCircle, Check } from 'lucide-react';

interface LiveOrder {
    id: string;
    table_number: string;
    total_amount: number;
    status: string;
    created_at: string;
    items_count: number;
    client_name?: string;
}

interface LiveNotification {
    id: string;
    type: string;
    message: string;
    created_at: string;
    node_id?: string;
    order_id?: string;
}

interface LiveActivityPanelProps {
    storeId: string;
    zones: { id: string; name: string }[];
    activeZoneId: string;
    onSelectTable?: (tableNumber: string) => void;
}

const LiveActivityPanel: React.FC<LiveActivityPanelProps> = ({
    storeId,
    zones,
    activeZoneId,
    onSelectTable
}) => {
    const [orders, setOrders] = useState<LiveOrder[]>([]);
    const [notifications, setNotifications] = useState<LiveNotification[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterZone, setFilterZone] = useState<string>('all');
    const [activeTab, setActiveTab] = useState<'orders' | 'alerts'>('alerts');

    // Fetch active orders
    const fetchOrders = async () => {
        if (!storeId) return;
        try {
            const { data, error } = await supabase
                .from('orders')
                .select(`
          id,
          table_number,
          total_amount,
          status,
          created_at,
          clients(name)
        `)
                .eq('store_id', storeId)
                .in('status', ['pending', 'preparing', 'ready'])
                .is('archived_at', null)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            if (data) {
                setOrders(data.map((o: any) => ({
                    id: o.id,
                    table_number: o.table_number || 'Sin mesa',
                    total_amount: o.total_amount || 0,
                    status: o.status,
                    created_at: o.created_at,
                    items_count: 0,
                    client_name: o.clients?.name
                })));
            }
        } catch (err) {
            console.error('Error fetching live orders:', err);
        } finally {
            setLoading(false);
        }
    };

    // Fetch notifications (waiter calls, bill requests, etc.)
    const fetchNotifications = async () => {
        if (!storeId) return;
        try {
            const { data, error } = await supabase
                .from('venue_notifications' as any)
                .select('*')
                .eq('store_id', storeId)
                .eq('is_read', false)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            if (data) {
                setNotifications(data.map((n: any) => ({
                    id: n.id,
                    type: n.type,
                    message: n.message,
                    created_at: n.created_at,
                    node_id: n.node_id,
                    order_id: n.order_id
                })));
            }
        } catch (err) {
            console.error('Error fetching notifications:', err);
        }
    };

    // Mark notification as read
    const dismissNotification = async (id: string) => {
        try {
            await supabase
                .from('venue_notifications' as any)
                .update({ is_read: true })
                .eq('id', id);
            setNotifications(prev => prev.filter(n => n.id !== id));
        } catch (err) {
            console.error('Error dismissing notification:', err);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchNotifications();
    }, [storeId]);

    // Realtime subscriptions
    useEffect(() => {
        if (!storeId) return;

        const ordersChannel = supabase
            .channel('live-orders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `store_id=eq.${storeId}` }, () => fetchOrders())
            .subscribe();

        const notifChannel = supabase
            .channel('live-notifications')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'venue_notifications', filter: `store_id=eq.${storeId}` }, () => fetchNotifications())
            .subscribe();

        return () => {
            supabase.removeChannel(ordersChannel);
            supabase.removeChannel(notifChannel);
        };
    }, [storeId]);

    // Time ago helper
    const timeAgo = (dateString: string) => {
        const now = new Date();
        const date = new Date(dateString);
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'ahora';
        if (diffMins < 60) return `${diffMins}m`;
        const diffHours = Math.floor(diffMins / 60);
        return `${diffHours}h`;
    };

    // Notification type helper
    const getNotificationInfo = (type: string) => {
        switch (type) {
            case 'CALL_WAITER':
                return { icon: UserRound, color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/30', label: 'LLAMADO MOZO' };
            case 'REQUEST_CHECK':
                return { icon: Receipt, color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30', label: 'PEDIR CUENTA' };
            case 'HELP':
                return { icon: HelpCircle, color: 'text-purple-400', bg: 'bg-purple-500/20', border: 'border-purple-500/30', label: 'AYUDA' };
            default:
                return { icon: Bell, color: 'text-zinc-400', bg: 'bg-zinc-500/20', border: 'border-zinc-500/30', label: type };
        }
    };

    // Status badge
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'pending':
                return { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'PENDIENTE' };
            case 'preparing':
            case 'in_progress':
                return { color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', label: 'PREPARANDO' };
            case 'ready':
                return { color: 'bg-green-500/20 text-green-400 border-green-500/30', label: 'LISTO' };
            default:
                return { color: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30', label: status.toUpperCase() };
        }
    };

    // Counts
    const pendingCount = orders.filter(o => o.status === 'pending').length;
    const preparingCount = orders.filter(o => ['preparing', 'in_progress'].includes(o.status)).length;
    const alertsCount = notifications.length;

    return (
        <div className="h-full flex flex-col bg-[#0a0a0a]">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-[#36e27b] rounded-full animate-pulse" />
                        <h3 className="text-xs font-black uppercase tracking-widest text-white">Actividad en Vivo</h3>
                    </div>
                    <button
                        onClick={fetchOrders}
                        className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-500 hover:text-white transition-colors"
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-2.5">
                        <div className="flex items-center gap-2">
                            <AlertCircle size={14} className="text-yellow-500" />
                            <span className="text-[9px] font-bold text-yellow-500/70 uppercase tracking-widest">Pendientes</span>
                        </div>
                        <p className="text-xl font-black text-yellow-400 mt-1">{pendingCount}</p>
                    </div>
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-2.5">
                        <div className="flex items-center gap-2">
                            <Clock size={14} className="text-blue-400" />
                            <span className="text-[9px] font-bold text-blue-400/70 uppercase tracking-widest">Preparando</span>
                        </div>
                        <p className="text-xl font-black text-blue-400 mt-1">{preparingCount}</p>
                    </div>
                </div>

                {/* Alerts Banner - Show if there are urgent notifications */}
                {alertsCount > 0 && (
                    <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 animate-pulse">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Bell size={16} className="text-red-400" />
                                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">{alertsCount} Llamado{alertsCount > 1 ? 's' : ''} Urgente{alertsCount > 1 ? 's' : ''}</span>
                            </div>
                            <button
                                onClick={() => setActiveTab('alerts')}
                                className="text-[8px] font-black text-red-400 uppercase tracking-widest hover:text-white transition-colors"
                            >
                                Ver →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Tab Switcher */}
            <div className="px-4 py-2 border-b border-zinc-900 flex gap-2">
                <button
                    onClick={() => setActiveTab('alerts')}
                    className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'alerts'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : 'bg-zinc-900 text-zinc-500 hover:text-white border border-zinc-800'
                        }`}
                >
                    <Bell size={12} />
                    Alertas {alertsCount > 0 && <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[7px]">{alertsCount}</span>}
                </button>
                <button
                    onClick={() => setActiveTab('orders')}
                    className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'orders'
                        ? 'bg-[#36e27b]/20 text-[#36e27b] border border-[#36e27b]/30'
                        : 'bg-zinc-900 text-zinc-500 hover:text-white border border-zinc-800'
                        }`}
                >
                    <ShoppingBag size={12} />
                    Pedidos {orders.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-zinc-700 text-white text-[7px]">{orders.length}</span>}
                </button>
            </div>

            {/* Zone Filter - Only for orders tab */}
            {activeTab === 'orders' && (
                <div className="px-4 py-2 border-b border-zinc-900 flex gap-2 overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => setFilterZone('all')}
                        className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all shrink-0 ${filterZone === 'all'
                            ? 'bg-[#36e27b] text-black'
                            : 'bg-zinc-900 text-zinc-500 hover:text-white border border-zinc-800'
                            }`}
                    >
                        Todas las salas
                    </button>
                    {zones.map(zone => (
                        <button
                            key={zone.id}
                            onClick={() => setFilterZone(zone.id)}
                            className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest transition-all shrink-0 ${filterZone === zone.id
                                ? 'bg-[#36e27b] text-black'
                                : 'bg-zinc-900 text-zinc-500 hover:text-white border border-zinc-800'
                                }`}
                        >
                            {zone.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full opacity-30">
                        <RefreshCw size={24} className="animate-spin text-zinc-500 mb-2" />
                        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Cargando...</p>
                    </div>
                ) : activeTab === 'alerts' ? (
                    // ALERTS TAB
                    notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full opacity-30 text-center p-6">
                            <Bell size={32} className="text-zinc-600 mb-3" />
                            <h4 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-1">Sin Alertas</h4>
                            <p className="text-[10px] text-zinc-600 max-w-[200px]">
                                Los llamados de mozo, cuenta y ayuda aparecerán aquí
                            </p>
                        </div>
                    ) : (
                        notifications.map(notif => {
                            const info = getNotificationInfo(notif.type);
                            const IconComponent = info.icon;
                            return (
                                <div
                                    key={notif.id}
                                    className={`w-full ${info.bg} border ${info.border} rounded-xl p-3 transition-all animate-in slide-in-from-top-2`}
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-8 h-8 rounded-lg ${info.bg} border ${info.border} flex items-center justify-center`}>
                                                <IconComponent size={14} className={info.color} />
                                            </div>
                                            <div>
                                                <h4 className={`text-[11px] font-black uppercase tracking-tight ${info.color}`}>{info.label}</h4>
                                                <p className="text-[8px] text-zinc-400 font-bold">
                                                    hace {timeAgo(notif.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => dismissNotification(notif.id)}
                                            className="p-1.5 rounded-lg bg-black/20 border border-white/10 text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
                                            title="Marcar como atendido"
                                        >
                                            <Check size={12} />
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-white/80 font-medium pl-10">
                                        {notif.message}
                                    </p>
                                </div>
                            );
                        })
                    )
                ) : (
                    // ORDERS TAB
                    orders.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full opacity-30 text-center p-6">
                            <ShoppingBag size={32} className="text-zinc-600 mb-3" />
                            <h4 className="text-sm font-black text-zinc-500 uppercase tracking-widest mb-1">Sin Pedidos Activos</h4>
                            <p className="text-[10px] text-zinc-600 max-w-[200px]">
                                Los pedidos en curso aparecerán aquí en tiempo real
                            </p>
                        </div>
                    ) : (
                        orders.map(order => {
                            const badge = getStatusBadge(order.status);
                            return (
                                <button
                                    key={order.id}
                                    onClick={() => onSelectTable?.(order.table_number)}
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-3 hover:border-[#36e27b]/30 transition-all group text-left"
                                >
                                    <div className="flex items-start justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                                                <ShoppingBag size={14} className="text-zinc-500 group-hover:text-[#36e27b] transition-colors" />
                                            </div>
                                            <div>
                                                <h4 className="text-[11px] font-black text-white uppercase tracking-tight">{order.table_number}</h4>
                                                <p className="text-[8px] text-zinc-600 font-bold">
                                                    {order.client_name || 'Invitado'} • hace {timeAgo(order.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                        <ChevronRight size={14} className="text-zinc-700 group-hover:text-[#36e27b] transition-colors" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase border ${badge.color}`}>
                                            {badge.label}
                                        </span>
                                        <span className="text-sm font-black text-[#36e27b]">${order.total_amount.toLocaleString()}</span>
                                    </div>
                                </button>
                            );
                        })
                    )
                )}
            </div>

            {/* Footer - Real-time indicator */}
            <div className="p-3 border-t border-zinc-900 bg-zinc-950/50">
                <div className="flex items-center justify-center gap-2">
                    <div className="w-1.5 h-1.5 bg-[#36e27b] rounded-full animate-pulse" />
                    <span className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest">Actualización en tiempo real</span>
                </div>
            </div>
        </div>
    );
};

export default LiveActivityPanel;
