import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastSystem';
import type { StorageLocation } from '../types';

interface LocationManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LocationManagerModal: React.FC<LocationManagerModalProps> = ({ isOpen, onClose }) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState<StorageLocation[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'manage' | 'history'>('manage');
    const [newLocName, setNewLocName] = useState('');
    const [newLocType, setNewLocType] = useState<'warehouse' | 'point_of_sale' | 'kitchen'>('point_of_sale');

    useEffect(() => {
        if (isOpen) {
            fetchLocations();
            fetchHistory();
        }
    }, [isOpen]);

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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[7000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-4xl bg-[#141714] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <h3 className="text-white font-black uppercase tracking-wider text-sm">Logística y Ubicaciones</h3>
                        <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                            <button
                                onClick={() => setActiveTab('manage')}
                                className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'manage' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                            >
                                Gestionar
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-white text-black' : 'text-white/40 hover:text-white'}`}
                            >
                                Historial
                            </button>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-white/40 hover:text-white transition-colors">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    {activeTab === 'manage' ? (
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* List Section */}
                            <div className="space-y-4">
                                <p className="text-[9px] font-black text-[#71766F] uppercase tracking-[0.2em]">Ubicaciones Existentes</p>
                                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                                    {locations.length === 0 && <p className="text-white/30 text-xs italic">No hay ubicaciones definidas.</p>}
                                    {locations.map(loc => (
                                        <div key={loc.id} className="flex justify-between items-center bg-white/[0.03] p-4 rounded-xl border border-white/5 group hover:bg-white/[0.05] transition-all">
                                            <div className="flex items-center gap-3">
                                                <span className="material-symbols-outlined text-white/20 group-hover:text-neon transition-colors">
                                                    {loc.type === 'point_of_sale' ? 'storefront' : loc.type === 'warehouse' ? 'inventory_2' : 'kitchen'}
                                                </span>
                                                <div>
                                                    <p className="text-white text-[11px] font-black uppercase italic-black tracking-tight">{loc.name}</p>
                                                    <p className="text-[#71766F] text-[9px] uppercase tracking-wider">{loc.type}</p>
                                                </div>
                                            </div>
                                            {loc.is_default && <span className="text-[8px] font-black bg-neon/10 text-neon px-2 py-0.5 rounded border border-neon/20 uppercase">PREDETERMINADA</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Create Section */}
                            <div className="space-y-6">
                                <div className="p-6 bg-white/[0.02] border border-white/5 rounded-2xl space-y-6">
                                    <p className="text-[9px] font-black text-[#71766F] uppercase tracking-[0.2em]">Agregar Nueva Ubicación</p>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1">Nombre</label>
                                            <input
                                                type="text"
                                                value={newLocName}
                                                onChange={e => setNewLocName(e.target.value)}
                                                placeholder="EJ. BARRA PRINCIPAL"
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase tracking-widest focus:border-neon outline-none transition-all"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-black text-white/30 uppercase tracking-widest ml-1">Tipo de Punto</label>
                                            <div className="flex gap-2">
                                                {['point_of_sale', 'warehouse', 'kitchen'].map(type => (
                                                    <button
                                                        key={type}
                                                        onClick={() => setNewLocType(type as any)}
                                                        className={`flex-1 py-2.5 rounded-lg text-[9px] font-black uppercase tracking-widest border border-white/10 transition-all ${newLocType === type ? 'bg-white text-black border-white shadow-lg' : 'bg-transparent text-white/40 hover:bg-white/5'}`}
                                                    >
                                                        {type === 'point_of_sale' ? 'Barra' : type === 'warehouse' ? 'Depósito' : 'Cocina'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <button
                                            onClick={handleCreate}
                                            disabled={loading || !newLocName}
                                            className="w-full bg-neon text-black py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 shadow-xl shadow-neon/10"
                                        >
                                            {loading ? 'Guardando...' : 'Crear Ubicación'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-0">
                            <table className="w-full text-left">
                                <thead className="sticky top-0 bg-[#0A0C0A] z-10">
                                    <tr className="border-b border-white/[0.04]">
                                        <th className="px-6 py-4 text-[9px] font-black text-white/40 uppercase tracking-widest">Fecha/Hora</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-white/40 uppercase tracking-widest">Producto</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-white/40 uppercase tracking-widest">Cant.</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-white/40 uppercase tracking-widest">Flujo</th>
                                        <th className="px-6 py-4 text-[9px] font-black text-white/40 uppercase tracking-widest">Usuario</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/[0.02]">
                                    {history.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-20 text-center text-[10px] text-white/20 uppercase tracking-widest italic">No hay movimientos registrados</td>
                                        </tr>
                                    ) : (
                                        history.map(tr => (
                                            <tr key={tr.id} className="hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <p className="text-[10px] text-white font-bold italic-black">
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
                                                    <span className="text-[13px] font-black text-white leading-none italic-black">
                                                        {tr.quantity} <span className="text-white/30 text-[8px] uppercase">{tr.inventory_items?.unit_type}</span>
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-black text-white/30 uppercase bg-white/5 px-2 py-0.5 rounded border border-white/5">{tr.from?.name || 'STOCK'}</span>
                                                        <span className="material-symbols-outlined text-[10px] text-white/10 group-hover:text-neon transition-colors">arrow_forward</span>
                                                        <span className="text-[9px] font-black text-neon uppercase italic bg-neon/5 px-2 py-0.5 rounded border border-neon/10">{tr.to?.name || 'DESTINO'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-tight">{tr.user?.full_name?.split(' ')[0] || 'ADMIN'}</span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
