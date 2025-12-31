import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastSystem';
import type { InventoryItem, StorageLocation } from '../types';

interface StockAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: InventoryItem;
    onSuccess: () => void;
    type: 'WASTE' | 'ADJUSTMENT' | 'PURCHASE';
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
    isOpen,
    onClose,
    item,
    onSuccess,
    type
}) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState<StorageLocation[]>([]);
    const [stockLevels, setStockLevels] = useState<Record<string, number>>({});

    const [locationId, setLocationId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [reason, setReason] = useState('');
    const [notes, setNotes] = useState('');

    const reasons = {
        WASTE: ['Vencimiento', 'Rotura/Daño', 'Preparación fallida', 'Robo/Faltante', 'Pérdida operativa', 'Otro'],
        PURCHASE: ['Reposición de Stock', 'Carga inicial', 'Compra de emergencia', 'Otro'],
        ADJUSTMENT: ['Corrección de carga', 'Auditoria semanal', 'Ajuste manual', 'Otro']
    };

    useEffect(() => {
        if (isOpen) {
            fetchLocationsAndStock();
            // Reset form
            setQuantity('');
            setReason('');
            setNotes('');
            setLocationId('');
        }
    }, [isOpen, item.id]);

    const fetchLocationsAndStock = async () => {
        setLoading(true);
        try {
            const { data: locs } = await supabase.from('storage_locations').select('*').order('name');
            setLocations(locs || []);

            const { data: levels } = await supabase.from('item_stock_levels').select('location_id, quantity').eq('inventory_item_id', item.id);
            const levelsMap: Record<string, number> = {};
            levels?.forEach((l: any) => { levelsMap[l.location_id] = Number(l.quantity); });
            setStockLevels(levelsMap);

            if (locs && locs.length > 0) {
                const def = locs.find(l => l.is_default) || locs[0];
                setLocationId(def.id);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        if (!locationId || !quantity || !reason) {
            addToast('Faltan campos obligatorios', 'error');
            return;
        }

        setLoading(true);
        try {
            const parsedQty = parseFloat(quantity);
            const { data: { user } } = await supabase.auth.getUser();

            const { data, error } = await supabase.rpc('transfer_stock', {
                p_item_id: item.id,
                p_from_location_id: type === 'PURCHASE' ? null : locationId,
                p_to_location_id: type === 'PURCHASE' ? locationId : (type === 'ADJUSTMENT' ? locationId : null),
                p_quantity: parsedQty,
                p_user_id: user?.id || '',
                p_notes: notes,
                p_movement_type: type,
                p_reason: reason
            });

            if (error) throw error;
            const result = data as any;
            if (result?.success === false) throw new Error(result.error);

            addToast(`✓ Movimiento registrado: ${type}`, 'success');
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Adjustment failed:', err);
            addToast(err.message || 'Error al registrar movimiento', 'error');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const title = type === 'WASTE' ? 'Registrar Pérdida' : type === 'PURCHASE' ? 'Registrar Compra' : 'Ajuste Manual';
    const accentColor = type === 'WASTE' ? 'text-red-500' : type === 'PURCHASE' ? 'text-neon' : 'text-orange-500';

    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="w-full max-w-md bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                <div className="p-6 border-b border-white/5 bg-gradient-to-r from-white/[0.03] to-transparent">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className={`material-symbols-outlined ${accentColor}`}>
                                {type === 'WASTE' ? 'delete_forever' : type === 'PURCHASE' ? 'shopping_cart' : 'tune'}
                            </span>
                            <h3 className="text-white font-black uppercase tracking-tight italic-black text-lg">{title}</h3>
                        </div>
                        <button onClick={onClose} className="text-white/20 hover:text-white transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mt-2">{item.name}</p>
                </div>

                <div className="p-6 space-y-5">
                    {/* Location Select */}
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Ubicación</label>
                        <select
                            value={locationId}
                            onChange={(e) => setLocationId(e.target.value)}
                            className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase tracking-widest outline-none focus:border-neon transition-all"
                        >
                            <option value="" disabled>Seleccionar Ubicación</option>
                            {locations.map(loc => (
                                <option key={loc.id} value={loc.id}>
                                    {loc.name} (Stock: {stockLevels[loc.id] || 0} {item.unit_type})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Quantity */}
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Cantidad</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    placeholder="0"
                                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-xs font-black text-white italic-black outline-none focus:border-neon transition-all"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/10 uppercase tracking-widest">{item.unit_type}</span>
                            </div>
                        </div>

                        {/* Reason */}
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Motivo</label>
                            <select
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase tracking-widest outline-none focus:border-neon transition-all"
                            >
                                <option value="" disabled>Motivo...</option>
                                {reasons[type].map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Observaciones</label>
                        <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="OPCIONAL..."
                            className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-[10px] font-bold text-white uppercase tracking-widest outline-none focus:border-neon transition-all"
                        />
                    </div>
                </div>

                <div className="p-6 bg-white/[0.02] border-t border-white/5">
                    <button
                        onClick={handleConfirm}
                        disabled={loading || !quantity || !reason || !locationId}
                        className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl shadow-neon/5 active:scale-95 disabled:opacity-50 ${type === 'WASTE' ? 'bg-red-500/10 text-red-500 border border-red-500/20' :
                            type === 'PURCHASE' ? 'bg-neon text-black' :
                                'bg-orange-500 text-black'
                            }`}
                    >
                        {loading ? 'PROCESANDO...' : 'CONFIRMAR MOVIMIENTO'}
                    </button>
                </div>
            </div>
        </div>
    );
};
