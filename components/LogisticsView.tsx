import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastSystem';
import type { StorageLocation } from '../types';

export const LogisticsView: React.FC = () => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState<StorageLocation[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [newLocName, setNewLocName] = useState('');
    const [newLocType, setNewLocType] = useState<'warehouse' | 'point_of_sale' | 'kitchen'>('point_of_sale');

    useEffect(() => {
        fetchLocations();
        fetchHistory();
    }, []);

    const fetchLocations = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('storage_locations')
            .select('*')
            .order('created_at', { ascending: true });

        if (error) {
            console.error(error);
            addToast('Error al cargar ubicaciones', 'error');
        } else {
            setLocations(data || []);
        }
        setLoading(false);
    };

    const fetchHistory = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase.from('profiles').select('store_id').eq('id', user.id).single();
        if (!profile?.store_id) return;

        const { data, error } = await supabase
            .from('stock_transfers' as any)
            .select(`
                *,
                inventory_items (name, unit_type),
                from:from_location_id (name),
                to:to_location_id (name),
                user:user_id (full_name)
            `)
            .eq('store_id', profile.store_id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) console.error(error);
        else setHistory(data || []);
    };

    const handleCreate = async () => {
        if (!newLocName.trim()) return;
        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase.from('profiles').select('store_id').eq('id', user.id).single();
        if (!profile?.store_id) {
            addToast('Error: No store associated', 'error');
            setLoading(false);
            return;
        }

        const { error } = await supabase.from('storage_locations').insert({
            store_id: profile.store_id,
            name: newLocName,
            type: newLocType,
            is_default: locations.length === 0
        });

        if (error) {
            console.error(error);
            addToast('Error al crear ubicación', 'error');
        } else {
            addToast('Ubicación creada', 'success');
            setNewLocName('');
            fetchLocations();
        }
        setLoading(false);
    };

    return (
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
            {/* TOP SECTION: MANAGEMENT GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* 1. List of Locations */}
                <div className="lg:col-span-2 bg-[#141714] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                            <div className="size-8 rounded-lg bg-neon/10 flex items-center justify-center border border-neon/20">
                                <span className="material-symbols-outlined text-neon text-sm">location_on</span>
                            </div>
                            <h3 className="text-white font-black uppercase tracking-wider text-xs">Puntos de Almacenamiento</h3>
                        </div>
                        <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{locations.length} Registradas</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                        {locations.length === 0 && (
                            <div className="col-span-full py-10 flex flex-col items-center justify-center opacity-20 bg-white/5 rounded-xl border border-dashed border-white/20">
                                <span className="material-symbols-outlined text-3xl mb-2">inventory_2</span>
                                <p className="text-[10px] uppercase font-black tracking-widest">Sin ubicaciones definidas</p>
                            </div>
                        )}
                        {locations.map(loc => (
                            <div key={loc.id} className="flex justify-between items-center bg-white/[0.03] p-4 rounded-xl border border-white/5 group hover:bg-white/[0.05] hover:border-white/10 transition-all">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-white/20 group-hover:text-neon transition-colors">
                                        {loc.type === 'point_of_sale' ? 'storefront' : loc.type === 'warehouse' ? 'inventory_2' : 'kitchen'}
                                    </span>
                                    <div>
                                        <p className="text-white text-[11px] font-black uppercase italic-black tracking-tight leading-none mb-1">{loc.name}</p>
                                        <p className="text-[#71766F] text-[9px] uppercase tracking-wider font-bold">{loc.type.replace('_', ' ')}</p>
                                    </div>
                                </div>
                                {loc.is_default && (
                                    <span className="text-[7px] font-black bg-neon text-black px-1.5 py-0.5 rounded uppercase tracking-tighter">BASE</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 2. Create Section */}
                <div className="bg-[#141714] border border-white/10 rounded-2xl p-6 shadow-2xl space-y-6">
                    <div className="flex items-center gap-3">
                        <div className="size-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/10">
                            <span className="material-symbols-outlined text-white/60 text-sm">add_location</span>
                        </div>
                        <h3 className="text-white font-black uppercase tracking-wider text-xs">Nueva Ubicación</h3>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1">Nombre Descriptivo</label>
                            <input
                                type="text"
                                value={newLocName}
                                onChange={e => setNewLocName(e.target.value)}
                                placeholder="EJ. BARRA PRINCIPAL"
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase tracking-widest focus:border-neon outline-none transition-all placeholder:text-white/5"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1">Tipo de Nodo</label>
                            <div className="flex gap-2">
                                {['point_of_sale', 'warehouse', 'kitchen'].map(type => (
                                    <button
                                        key={type}
                                        onClick={() => setNewLocType(type as any)}
                                        className={`flex-1 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/10 transition-all ${newLocType === type ? 'bg-white text-black border-white shadow-lg' : 'bg-transparent text-white/40 hover:bg-white/5'}`}
                                    >
                                        {type === 'point_of_sale' ? 'Venta' : type === 'warehouse' ? 'Depo' : 'Cocina'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button
                            onClick={handleCreate}
                            disabled={loading || !newLocName}
                            className="w-full bg-neon text-black py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 shadow-xl shadow-neon/10"
                        >
                            {loading ? 'Guardando...' : 'Registrar Punto'}
                        </button>
                    </div>
                </div>
            </div>

            {/* BOTTOM SECTION: GLOBAL MOVEMENTS HISTORY */}
            <div className="bg-[#141714] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-white/5 bg-white/[0.01] flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                        <span className="material-symbols-outlined text-orange-500 text-sm">history</span>
                    </div>
                    <h3 className="text-white font-black uppercase tracking-wider text-xs">Historial de Movimientos Globales</h3>
                </div>

                <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/20 border-b border-white/[0.02]">
                                <th className="px-6 py-4 text-[9px] font-black text-white/30 uppercase tracking-widest">Cronología</th>
                                <th className="px-6 py-4 text-[9px] font-black text-white/30 uppercase tracking-widest">Ítem Operativo</th>
                                <th className="px-6 py-4 text-[9px] font-black text-white/30 uppercase tracking-widest">Cantidad</th>
                                <th className="px-6 py-4 text-[9px] font-black text-white/30 uppercase tracking-widest">Flujo Logístico</th>
                                <th className="px-6 py-4 text-[9px] font-black text-white/30 uppercase tracking-widest text-right">Usuario</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.01]">
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-[10px] text-white/10 uppercase tracking-widest font-black italic">Sin actividad registrada en la Matrix</td>
                                </tr>
                            ) : (
                                history.map(tr => (
                                    <tr key={tr.id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <p className="text-[10px] text-white font-black italic-black leading-none mb-1">
                                                {new Date(tr.created_at).toLocaleDateString()}
                                            </p>
                                            <p className="text-[9px] text-white/20 uppercase tracking-tighter">
                                                {new Date(tr.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-[10px] font-black text-white uppercase italic-black tracking-tight">{tr.inventory_items?.name}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[13px] font-black text-white leading-none italic-black bg-white/5 px-2 py-1 rounded">
                                                {tr.quantity} <span className="text-white/30 text-[8px] uppercase">{tr.inventory_items?.unit_type}</span>
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[8px] font-black text-white/40 uppercase bg-white/5 px-2 py-1 rounded border border-white/5 truncate max-w-[100px]">{tr.from?.name || 'STOCK'}</span>
                                                <span className="material-symbols-outlined text-[12px] text-neon/40 animate-pulse">keyboard_double_arrow_right</span>
                                                <span className="text-[8px] font-black text-neon uppercase italic bg-neon/10 px-2 py-1 rounded border border-neon/20 truncate max-w-[100px]">{tr.to?.name || 'DESTINO'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-[9px] font-black text-white/20 uppercase tracking-tight bg-white/5 px-2 py-1 rounded">{tr.user?.full_name?.split(' ')[0] || 'ADMIN'}</span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
