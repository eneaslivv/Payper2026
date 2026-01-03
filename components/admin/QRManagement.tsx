import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../components/ToastSystem';
import {
    QrCode, Plus, Search, MoreVertical, Eye, Edit2, RefreshCw,
    Trash2, ToggleLeft, ToggleRight, Clock, ScanLine, X, Check, Loader2
} from 'lucide-react';

interface QRCode {
    id: string;
    store_id: string;
    qr_type: 'table' | 'bar' | 'pickup' | 'generic';
    code_hash: string;
    table_id: string | null;
    bar_id: string | null;
    location_id: string | null;
    label: string;
    is_active: boolean;
    scan_count: number;
    last_scanned_at: string | null;
    created_at: string;
    // Joined data
    table_label?: string;
    bar_label?: string;
}

type QRFilter = 'all' | 'table' | 'bar' | 'pickup' | 'generic' | 'active' | 'inactive';

const QRManagement: React.FC = () => {
    const { profile } = useAuth();
    const { addToast } = useToast();

    const [qrCodes, setQrCodes] = useState<QRCode[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<QRFilter>('all');
    const [selectedQR, setSelectedQR] = useState<QRCode | null>(null);
    const [showMenu, setShowMenu] = useState<string | null>(null);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Edit Modal State
    const [editModal, setEditModal] = useState<{ qr: QRCode; newLabel: string } | null>(null);

    useEffect(() => {
        if (profile?.store_id) {
            fetchQRCodes();
        }
    }, [profile?.store_id]);

    const fetchQRCodes = async () => {
        if (!profile?.store_id) return;
        setLoading(true);

        try {
            const { data, error } = await supabase
                .from('qr_codes' as any)
                .select(`
                    *,
                    table:venue_nodes!table_id (label),
                    bar:venue_nodes!bar_id (label)
                `)
                .eq('store_id', profile.store_id)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const mapped = (data || []).map((qr: any) => ({
                ...qr,
                table_label: qr.table?.label,
                bar_label: qr.bar?.label
            }));

            setQrCodes(mapped);
        } catch (e: any) {
            console.error('Error fetching QR codes:', e);
            addToast('Error', 'error', 'No se pudieron cargar los códigos QR');
        } finally {
            setLoading(false);
        }
    };

    const filteredQRs = qrCodes.filter(qr => {
        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            if (!qr.label.toLowerCase().includes(query) &&
                !qr.code_hash.toLowerCase().includes(query)) {
                return false;
            }
        }

        // Type filter
        switch (filter) {
            case 'table': return qr.qr_type === 'table';
            case 'bar': return qr.qr_type === 'bar';
            case 'pickup': return qr.qr_type === 'pickup';
            case 'generic': return qr.qr_type === 'generic';
            case 'active': return qr.is_active;
            case 'inactive': return !qr.is_active;
            default: return true;
        }
    });

    const handleToggleActive = async (qr: QRCode) => {
        setActionLoading(qr.id);
        try {
            const { error } = await supabase
                .from('qr_codes' as any)
                .update({ is_active: !qr.is_active })
                .eq('id', qr.id);

            if (error) throw error;

            setQrCodes(prev => prev.map(q =>
                q.id === qr.id ? { ...q, is_active: !qr.is_active } : q
            ));
            addToast(qr.is_active ? 'QR Desactivado' : 'QR Activado', 'success');
        } catch (e) {
            addToast('Error', 'error', 'No se pudo actualizar el estado');
        } finally {
            setActionLoading(null);
            setShowMenu(null);
        }
    };

    const handleRegenerate = async (qr: QRCode) => {
        setActionLoading(qr.id);
        try {
            // Generate new hash
            const rawString = `${qr.store_id}-${qr.table_id || qr.bar_id || 'gen'}-${Date.now()}`;
            const newHash = btoa(rawString).replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);

            // Create new QR with reference to old one
            const { error } = await supabase
                .from('qr_codes' as any)
                .insert({
                    store_id: qr.store_id,
                    qr_type: qr.qr_type,
                    code_hash: newHash,
                    table_id: qr.table_id,
                    bar_id: qr.bar_id,
                    location_id: qr.location_id,
                    label: qr.label,
                    is_active: true,
                    regenerated_from: qr.id
                });

            if (error) throw error;

            // Deactivate old QR
            await supabase
                .from('qr_codes' as any)
                .update({ is_active: false })
                .eq('id', qr.id);

            addToast('QR Regenerado', 'success', 'Se creó un nuevo código QR');
            fetchQRCodes();
        } catch (e) {
            addToast('Error', 'error', 'No se pudo regenerar el QR');
        } finally {
            setActionLoading(null);
            setShowMenu(null);
        }
    };

    const handleDelete = async (qr: QRCode) => {
        if (!confirm(`¿Eliminar QR "${qr.label}"? Esta acción no se puede deshacer.`)) return;

        setActionLoading(qr.id);
        try {
            // Check for active sessions first
            const { data: sessions } = await supabase
                .from('client_sessions' as any)
                .select('id')
                .eq('qr_id', qr.id)
                .eq('is_active', true)
                .limit(1);

            if (sessions && sessions.length > 0) {
                addToast('No se puede eliminar', 'error', 'Hay sesiones activas usando este QR');
                return;
            }

            const { error } = await supabase
                .from('qr_codes' as any)
                .delete()
                .eq('id', qr.id);

            if (error) throw error;

            setQrCodes(prev => prev.filter(q => q.id !== qr.id));
            addToast('QR Eliminado', 'success');
        } catch (e) {
            addToast('Error', 'error', 'No se pudo eliminar el QR');
        } finally {
            setActionLoading(null);
            setShowMenu(null);
        }
    };

    const handleUpdateLabel = async () => {
        if (!editModal) return;
        setActionLoading(editModal.qr.id);

        try {
            const { error } = await supabase
                .from('qr_codes' as any)
                .update({ label: editModal.newLabel })
                .eq('id', editModal.qr.id);

            if (error) throw error;

            setQrCodes(prev => prev.map(q =>
                q.id === editModal.qr.id ? { ...q, label: editModal.newLabel } : q
            ));
            addToast('Etiqueta actualizada', 'success');
            setEditModal(null);
        } catch (e) {
            addToast('Error', 'error', 'No se pudo actualizar la etiqueta');
        } finally {
            setActionLoading(null);
        }
    };

    const getTypeIcon = (type: QRCode['qr_type']) => {
        switch (type) {
            case 'table': return '🍽️';
            case 'bar': return '🍺';
            case 'pickup': return '📦';
            default: return '📱';
        }
    };

    const getTypeBadge = (type: QRCode['qr_type']) => {
        const styles: Record<string, string> = {
            table: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            bar: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
            pickup: 'bg-green-500/10 text-green-400 border-green-500/20',
            generic: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
        };
        const labels: Record<string, string> = {
            table: 'Mesa',
            bar: 'Barra',
            pickup: 'Retiro',
            generic: 'Genérico'
        };
        return (
            <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider rounded-lg border ${styles[type]}`}>
                {labels[type]}
            </span>
        );
    };

    const formatDate = (date: string | null) => {
        if (!date) return 'Nunca';
        return new Date(date).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-white">Códigos QR</h1>
                    <p className="text-zinc-500 text-sm">Gestiona los QRs de tu tienda</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={fetchQRCodes}
                        className="p-3 bg-zinc-900 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-all"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Buscar por etiqueta o código..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-sm placeholder:text-zinc-600 focus:border-zinc-700 outline-none"
                    />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2 flex-wrap">
                    {(['all', 'table', 'bar', 'pickup', 'active', 'inactive'] as QRFilter[]).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all ${filter === f
                                    ? 'bg-white text-black'
                                    : 'bg-zinc-900 text-zinc-400 hover:text-white'
                                }`}
                        >
                            {f === 'all' ? 'Todos' :
                                f === 'table' ? 'Mesas' :
                                    f === 'bar' ? 'Barras' :
                                        f === 'pickup' ? 'Retiro' :
                                            f === 'active' ? 'Activos' : 'Inactivos'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Total QRs</p>
                    <p className="text-2xl font-black text-white">{qrCodes.length}</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Activos</p>
                    <p className="text-2xl font-black text-green-400">{qrCodes.filter(q => q.is_active).length}</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Escaneos Totales</p>
                    <p className="text-2xl font-black text-white">{qrCodes.reduce((sum, q) => sum + (q.scan_count || 0), 0)}</p>
                </div>
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
                    <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Mesas</p>
                    <p className="text-2xl font-black text-blue-400">{qrCodes.filter(q => q.qr_type === 'table').length}</p>
                </div>
            </div>

            {/* QR List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 size={32} className="animate-spin text-zinc-500" />
                </div>
            ) : filteredQRs.length === 0 ? (
                <div className="text-center py-20">
                    <QrCode size={48} className="mx-auto text-zinc-700 mb-4" />
                    <p className="text-zinc-500">No hay códigos QR</p>
                </div>
            ) : (
                <div className="grid gap-3">
                    {filteredQRs.map((qr) => (
                        <div
                            key={qr.id}
                            className={`bg-zinc-900/50 border rounded-2xl p-4 flex items-center gap-4 transition-all hover:border-zinc-700 ${qr.is_active ? 'border-zinc-800' : 'border-zinc-800/50 opacity-60'
                                }`}
                        >
                            {/* Icon */}
                            <div className="w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-2xl shrink-0">
                                {getTypeIcon(qr.qr_type)}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <p className="font-bold text-white truncate">{qr.label}</p>
                                    {getTypeBadge(qr.qr_type)}
                                    {!qr.is_active && (
                                        <span className="px-2 py-1 text-[10px] font-bold uppercase bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20">
                                            Inactivo
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-4 text-xs text-zinc-500">
                                    <span className="flex items-center gap-1">
                                        <ScanLine size={12} />
                                        {qr.scan_count || 0} escaneos
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock size={12} />
                                        {formatDate(qr.last_scanned_at)}
                                    </span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowMenu(showMenu === qr.id ? null : qr.id)}
                                    className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                                >
                                    <MoreVertical size={18} />
                                </button>

                                {showMenu === qr.id && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setShowMenu(null)}
                                        />
                                        <div className="absolute right-0 top-full mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                                            <button
                                                onClick={() => {
                                                    setEditModal({ qr, newLabel: qr.label });
                                                    setShowMenu(null);
                                                }}
                                                className="w-full px-4 py-3 flex items-center gap-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all"
                                            >
                                                <Edit2 size={14} />
                                                Editar etiqueta
                                            </button>
                                            <button
                                                onClick={() => handleToggleActive(qr)}
                                                disabled={actionLoading === qr.id}
                                                className="w-full px-4 py-3 flex items-center gap-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all"
                                            >
                                                {qr.is_active ? <ToggleLeft size={14} /> : <ToggleRight size={14} />}
                                                {qr.is_active ? 'Desactivar' : 'Activar'}
                                            </button>
                                            <button
                                                onClick={() => handleRegenerate(qr)}
                                                disabled={actionLoading === qr.id}
                                                className="w-full px-4 py-3 flex items-center gap-3 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition-all"
                                            >
                                                <RefreshCw size={14} />
                                                Regenerar código
                                            </button>
                                            <button
                                                onClick={() => handleDelete(qr)}
                                                disabled={actionLoading === qr.id}
                                                className="w-full px-4 py-3 flex items-center gap-3 text-sm text-rose-400 hover:bg-rose-500/10 transition-all"
                                            >
                                                <Trash2 size={14} />
                                                Eliminar
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Edit Modal */}
            {editModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
                    <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                        <div className="p-6 border-b border-zinc-800">
                            <h3 className="text-lg font-bold text-white">Editar Etiqueta</h3>
                        </div>
                        <div className="p-6">
                            <input
                                type="text"
                                value={editModal.newLabel}
                                onChange={(e) => setEditModal({ ...editModal, newLabel: e.target.value })}
                                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-600 focus:border-zinc-600 outline-none"
                                placeholder="Etiqueta del QR"
                                autoFocus
                            />
                        </div>
                        <div className="p-6 pt-0 flex gap-3">
                            <button
                                onClick={() => setEditModal(null)}
                                className="flex-1 py-3 bg-zinc-800 text-zinc-400 font-bold rounded-xl hover:bg-zinc-700 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleUpdateLabel}
                                disabled={actionLoading !== null}
                                className="flex-1 py-3 bg-white text-black font-bold rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50"
                            >
                                {actionLoading ? <Loader2 size={18} className="animate-spin mx-auto" /> : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default QRManagement;
