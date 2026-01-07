import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../components/ToastSystem';
import { Plus, Trash2, Edit3, Eye, EyeOff, Check, X, GripVertical } from 'lucide-react';

interface DispatchStation {
    id: string;
    name: string;
    is_visible: boolean;
    sort_order: number;
}

const StationManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { profile } = useAuth();
    const { addToast } = useToast();
    const [stations, setStations] = useState<DispatchStation[]>([]);
    const [loading, setLoading] = useState(true);
    const [newStationName, setNewStationName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');

    // Fetch stations
    const fetchStations = async () => {
        if (!profile?.store_id) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('dispatch_stations' as any)
            .select('*')
            .eq('store_id', profile.store_id)
            .order('sort_order', { ascending: true });

        if (!error && data) setStations(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchStations();
    }, [profile?.store_id]);

    // Create station
    const handleCreate = async () => {
        if (!newStationName.trim() || !profile?.store_id) return;
        const { error } = await supabase
            .from('dispatch_stations' as any)
            .insert({
                store_id: profile.store_id,
                name: newStationName.trim(),
                sort_order: stations.length
            });

        if (error) {
            addToast('Error', 'error', error.message);
        } else {
            addToast('Estación creada', 'success');
            setNewStationName('');
            fetchStations();
        }
    };

    // Toggle visibility
    const handleToggleVisibility = async (id: string, currentValue: boolean) => {
        const { error } = await supabase
            .from('dispatch_stations' as any)
            .update({ is_visible: !currentValue })
            .eq('id', id);

        if (!error) fetchStations();
    };

    // Start editing
    const startEdit = (station: DispatchStation) => {
        setEditingId(station.id);
        setEditingName(station.name);
    };

    // Save edit
    const saveEdit = async () => {
        if (!editingId || !editingName.trim()) return;
        const { error } = await supabase
            .from('dispatch_stations' as any)
            .update({ name: editingName.trim() })
            .eq('id', editingId);

        if (!error) {
            addToast('Estación actualizada', 'success');
            setEditingId(null);
            fetchStations();
        }
    };

    // Delete station
    const handleDelete = async (id: string) => {
        const { error } = await supabase
            .from('dispatch_stations' as any)
            .delete()
            .eq('id', id);

        if (!error) {
            addToast('Estación eliminada', 'info');
            fetchStations();
        }
    };

    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                    <h3 className="text-lg font-black text-white uppercase tracking-widest">Estaciones</h3>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                    {/* Create New */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newStationName}
                            onChange={(e) => setNewStationName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            placeholder="Nueva estación..."
                            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-[#36e27b]/50"
                        />
                        <button
                            onClick={handleCreate}
                            disabled={!newStationName.trim()}
                            className="px-4 py-3 bg-[#36e27b] text-black rounded-xl font-bold disabled:opacity-30 hover:bg-[#2bc968] transition-colors"
                        >
                            <Plus size={18} />
                        </button>
                    </div>

                    {/* Stations List */}
                    {loading ? (
                        <p className="text-center text-zinc-500 py-8">Cargando...</p>
                    ) : stations.length === 0 ? (
                        <p className="text-center text-zinc-500 py-8">No hay estaciones creadas</p>
                    ) : (
                        <div className="space-y-2">
                            {stations.map((station) => (
                                <div
                                    key={station.id}
                                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${station.is_visible
                                        ? 'bg-zinc-900/50 border-zinc-800'
                                        : 'bg-zinc-950 border-zinc-900 opacity-50'
                                        }`}
                                >
                                    <GripVertical size={16} className="text-zinc-600 cursor-grab" />

                                    {editingId === station.id ? (
                                        <input
                                            type="text"
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                            className="flex-1 bg-black border border-[#36e27b]/50 rounded-lg px-3 py-1 text-white outline-none"
                                            autoFocus
                                        />
                                    ) : (
                                        <span className="flex-1 text-white font-medium">{station.name}</span>
                                    )}

                                    <div className="flex items-center gap-1">
                                        {editingId === station.id ? (
                                            <>
                                                <button onClick={saveEdit} className="p-2 text-[#36e27b] hover:bg-[#36e27b]/10 rounded-lg">
                                                    <Check size={16} />
                                                </button>
                                                <button onClick={() => setEditingId(null)} className="p-2 text-zinc-500 hover:bg-zinc-800 rounded-lg">
                                                    <X size={16} />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => handleToggleVisibility(station.id, station.is_visible)}
                                                    className={`p-2 rounded-lg transition-colors ${station.is_visible ? 'text-[#36e27b] hover:bg-[#36e27b]/10' : 'text-zinc-600 hover:bg-zinc-800'
                                                        }`}
                                                    title={station.is_visible ? 'Ocultar' : 'Mostrar'}
                                                >
                                                    {station.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                                                </button>
                                                <button onClick={() => startEdit(station)} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg">
                                                    <Edit3 size={16} />
                                                </button>
                                                <button onClick={() => handleDelete(station.id)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg">
                                                    <Trash2 size={16} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
                    <p className="text-[9px] text-zinc-500 text-center uppercase tracking-widest">
                        Asigná estaciones a mesas para filtrar pedidos
                    </p>
                </div>
            </div>
        </div>
    );
};

export default StationManager;
