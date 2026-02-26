import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../components/ToastSystem';
import { Plus, Trash2, Edit3, Eye, EyeOff, Check, X, GripVertical, MapPin, DollarSign } from 'lucide-react';

interface DispatchStation {
    id: string;
    name: string;
    is_visible: boolean;
    sort_order: number;
    storage_location_id: string | null;
    storage_location?: { id: string; name: string } | null;
}

interface StorageLocation {
    id: string;
    name: string;
}

interface ActiveSession {
    id: string;
    dispatch_station_id: string;
    zone_name?: string;
    opened_at: string;
}

const StationManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { profile } = useAuth();
    const { addToast } = useToast();
    const [stations, setStations] = useState<DispatchStation[]>([]);
    const [locations, setLocations] = useState<StorageLocation[]>([]);
    const [sessionsByStation, setSessionsByStation] = useState<Record<string, ActiveSession[]>>({});
    const [loading, setLoading] = useState(true);
    const [newStationName, setNewStationName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingLocationId, setEditingLocationId] = useState<string | null>(null);

    // Fetch stations with joined location
    const fetchStations = async () => {
        if (!profile?.store_id) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('dispatch_stations' as any)
            .select('*, storage_location:storage_locations(id, name)')
            .eq('store_id', profile.store_id)
            .order('sort_order', { ascending: true });

        if (!error && data) setStations(data as any);
        setLoading(false);
    };

    // Fetch storage locations for dropdown
    const fetchLocations = async () => {
        if (!profile?.store_id) return;
        const { data } = await supabase
            .from('storage_locations')
            .select('id, name')
            .eq('store_id', profile.store_id)
            .order('name');
        if (data) setLocations(data);
    };

    // Fetch active cash sessions linked to stations
    const fetchSessions = async () => {
        if (!profile?.store_id) return;
        const { data } = await (supabase as any)
            .rpc('get_active_cash_sessions', { p_store_id: profile.store_id });
        if (data) {
            const byStation: Record<string, ActiveSession[]> = {};
            (data as any[]).forEach((s: any) => {
                if (s.dispatch_station_id) {
                    if (!byStation[s.dispatch_station_id]) byStation[s.dispatch_station_id] = [];
                    byStation[s.dispatch_station_id].push({
                        id: s.id,
                        dispatch_station_id: s.dispatch_station_id,
                        zone_name: s.zone_name,
                        opened_at: s.opened_at,
                    });
                }
            });
            setSessionsByStation(byStation);
        }
    };

    useEffect(() => {
        fetchStations();
        fetchLocations();
        fetchSessions();
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
            addToast('Estacion creada', 'success');
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
        setEditingLocationId(station.storage_location_id);
    };

    // Save edit
    const saveEdit = async () => {
        if (!editingId || !editingName.trim()) return;
        const { error } = await supabase
            .from('dispatch_stations' as any)
            .update({
                name: editingName.trim(),
                storage_location_id: editingLocationId || null
            })
            .eq('id', editingId);

        if (!error) {
            addToast('Estacion actualizada', 'success');
            setEditingId(null);
            fetchStations();
        }
    };

    // Quick-assign location without entering full edit mode
    const handleLocationChange = async (stationId: string, locationId: string | null) => {
        const { error } = await supabase
            .from('dispatch_stations' as any)
            .update({ storage_location_id: locationId || null })
            .eq('id', stationId);

        if (error) {
            addToast('Error al vincular ubicacion', 'error', error.message);
        } else {
            addToast('Ubicacion vinculada', 'success');
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
            addToast('Estacion eliminada', 'info');
            fetchStations();
        }
    };

    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-[#0a0a0a] border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-black text-white uppercase tracking-widest">Estaciones</h3>
                        <p className="text-[9px] text-zinc-600 uppercase tracking-widest mt-1">Despacho, ubicacion de stock y caja</p>
                    </div>
                    <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                    {/* Create New */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={newStationName}
                            onChange={(e) => setNewStationName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                            placeholder="Nueva estacion..."
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
                        <div className="space-y-3">
                            {stations.map((station) => {
                                const sessions = sessionsByStation[station.id] || [];
                                const hasSession = sessions.length > 0;
                                const isEditing = editingId === station.id;

                                return (
                                    <div
                                        key={station.id}
                                        className={`rounded-xl border transition-all ${station.is_visible
                                            ? 'bg-zinc-900/50 border-zinc-800'
                                            : 'bg-zinc-950 border-zinc-900 opacity-50'
                                        }`}
                                    >
                                        {/* Main row */}
                                        <div className="flex items-center gap-3 p-3">
                                            <GripVertical size={16} className="text-zinc-600 cursor-grab shrink-0" />

                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    value={editingName}
                                                    onChange={(e) => setEditingName(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                                    className="flex-1 bg-black border border-[#36e27b]/50 rounded-lg px-3 py-1 text-white outline-none text-sm"
                                                    autoFocus
                                                />
                                            ) : (
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-white font-bold text-sm">{station.name}</span>
                                                </div>
                                            )}

                                            <div className="flex items-center gap-1 shrink-0">
                                                {isEditing ? (
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
                                                            className={`p-2 rounded-lg transition-colors ${station.is_visible ? 'text-[#36e27b] hover:bg-[#36e27b]/10' : 'text-zinc-600 hover:bg-zinc-800'}`}
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

                                        {/* Location + Session row */}
                                        <div className="px-3 pb-3 flex flex-wrap items-center gap-2 ml-7">
                                            {/* Location badge/selector */}
                                            {isEditing ? (
                                                <select
                                                    value={editingLocationId || ''}
                                                    onChange={(e) => setEditingLocationId(e.target.value || null)}
                                                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-[11px] text-white outline-none focus:border-[#36e27b]/50"
                                                >
                                                    <option value="">Sin ubicacion</option>
                                                    {locations.map(loc => (
                                                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        // Show inline location picker
                                                        startEdit(station);
                                                    }}
                                                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                                                        station.storage_location_id
                                                            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 hover:border-indigo-500/40'
                                                            : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50 hover:border-zinc-600'
                                                    }`}
                                                    title="Asignar ubicacion de stock"
                                                >
                                                    <MapPin size={11} />
                                                    {station.storage_location?.name || 'Sin ubicacion'}
                                                </button>
                                            )}

                                            {/* Session indicator */}
                                            {hasSession ? (
                                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#36e27b]/10 border border-[#36e27b]/20 text-[10px] font-bold text-[#36e27b] uppercase tracking-wider">
                                                    <DollarSign size={11} />
                                                    Caja abierta
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/30 border border-zinc-700/30 text-[10px] font-bold text-zinc-600 uppercase tracking-wider">
                                                    <DollarSign size={11} />
                                                    Sin caja
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-800 bg-zinc-900/30">
                    <p className="text-[9px] text-zinc-500 text-center uppercase tracking-widest">
                        Vincular una ubicacion permite descontar stock del punto correcto
                    </p>
                </div>
            </div>
        </div>
    );
};

export default StationManager;
