import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastSystem';
import type { InventoryItem, StorageLocation } from '../types';

interface StockTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: InventoryItem;
    onSuccess: () => void;
    /** Optional: Pre-select origin location (e.g., from Bar context) */
    sourceLocationId?: string;
    /** Callback to open initial stock wizard */
    onInitialStockClick?: () => void;
}

export const StockTransferModal: React.FC<StockTransferModalProps> = ({
    isOpen,
    onClose,
    item,
    onSuccess,
    sourceLocationId,
    onInitialStockClick
}) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState<StorageLocation[]>([]);
    const [stockLevels, setStockLevels] = useState<Record<string, number>>({});

    const [fromLocation, setFromLocation] = useState<string>('');
    const [toLocation, setToLocation] = useState<string>('');
    const [quantity, setQuantity] = useState<string>('');
    const [notes, setNotes] = useState('');

    // Derived State
    const currentSourceStock = useMemo(() => stockLevels[fromLocation] || 0, [stockLevels, fromLocation]);
    const parsedQuantity = useMemo(() => parseFloat(quantity) || 0, [quantity]);
    const quantityExceedsStock = parsedQuantity > currentSourceStock;

    // Smart Origin Detection (locations with stock)
    const locationsWithStock = useMemo(() =>
        locations.filter(l => (stockLevels[l.id] || 0) > 0),
        [locations, stockLevels]
    );

    const hasNoStockAtAll = locationsWithStock.length === 0;
    const isOriginLocked = locationsWithStock.length === 1;

    // Destination options (exclude origin)
    const destinationOptions = useMemo(() =>
        locations.filter(l => l.id !== fromLocation),
        [locations, fromLocation]
    );

    const isValidTransfer = fromLocation && toLocation && parsedQuantity > 0 && !quantityExceedsStock;

    // Unit display helper
    const unitLabel = useMemo(() => {
        const unit = item.unit_type?.toLowerCase() || 'unit';
        const labels: Record<string, string> = {
            gram: 'g', ml: 'ml', kg: 'kg', liter: 'L', unit: 'u', oz: 'oz'
        };
        return labels[unit] || unit;
    }, [item.unit_type]);

    const fetchLocationsAndStock = async () => {
        setLoading(true);
        try {
            const { data: locs, error: locError } = await supabase
                .from('storage_locations')
                .select('*')
                .order('name');

            if (locError) throw locError;
            setLocations(locs || []);

            const { data: levels, error: stockError } = await supabase
                .from('item_stock_levels')
                .select('location_id, quantity')
                .eq('inventory_item_id', item.id);

            if (stockError) throw stockError;

            const levelsMap: Record<string, number> = {};
            levels?.forEach((l: any) => {
                levelsMap[l.location_id] = Number(l.quantity);
            });
            setStockLevels(levelsMap);

            // Pre-selection Logic
            const validLocsWithStock = (locs || []).filter(l => (levelsMap[l.id] || 0) > 0);

            if (validLocsWithStock.length === 1) {
                setFromLocation(validLocsWithStock[0].id);
            } else if (sourceLocationId && levelsMap[sourceLocationId] > 0) {
                setFromLocation(sourceLocationId);
            } else if (validLocsWithStock.length > 1) {
                const best = [...validLocsWithStock].sort((a, b) => (levelsMap[b.id] || 0) - (levelsMap[a.id] || 0))[0];
                setFromLocation(best.id);
            } else if (hasNoStockAtAll && locs && locs.length > 0) {
                // If no stock anywhere, pick the default location
                const def = locs.find(l => l.is_default) || locs[0];
                setFromLocation(def.id);
            }

        } catch (err) {
            console.error('Error init transfer:', err);
            addToast('Error al cargar datos de ubicación', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleTransfer = async () => {
        if (!isValidTransfer) return;

        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('transfer_stock', {
                p_item_id: item.id,
                p_from_location_id: fromLocation,
                p_to_location_id: toLocation,
                p_quantity: parsedQuantity,
                p_user_id: (await supabase.auth.getUser()).data.user?.id || '',
                p_notes: notes
            });

            if (error) throw error;

            const response = data as { success: boolean, transfer_id?: string, error?: string };
            if (response && response.success === false) {
                throw new Error(response.error || 'Error en transferencia');
            }

            const fromName = locations.find(l => l.id === fromLocation)?.name || 'Origen';
            const toName = locations.find(l => l.id === toLocation)?.name || 'Destino';
            addToast(`✓ ${parsedQuantity} ${unitLabel} transferidos: ${fromName} → ${toName}`, 'success');

            onSuccess();
            onClose();

        } catch (err: any) {
            console.error('Transfer failed:', err);
            addToast(err.message || 'Error al procesar transferencia', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && item.id) {
            fetchLocationsAndStock();
        }
        if (!isOpen) {
            setQuantity('');
            setNotes('');
            setToLocation('');
            setFromLocation('');
        }
    }, [isOpen, item.id]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-lg bg-[#0a0a0a] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">

                {/* === PRODUCT CONTEXT HEADER === */}
                <div className="p-5 border-b border-white/5 bg-gradient-to-r from-[#141714] to-[#0d0d0d]">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-black/50 border border-white/5 flex items-center justify-center overflow-hidden">
                            {item.image_url ? (
                                <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="material-symbols-outlined text-2xl text-zinc-600">inventory_2</span>
                            )}
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className="text-white font-black text-lg truncate italic-black uppercase tracking-tight">{item.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-black text-neon uppercase tracking-[0.2em]">{item.item_type === 'ingredient' ? 'Insumo' : 'Producto'}</span>
                                <span className="text-[9px] text-zinc-500">•</span>
                                <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">{item.unit_type || 'u'}</span>
                            </div>
                        </div>

                        <button onClick={onClose} className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:text-white hover:bg-white/5 transition-colors">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                {/* === BODY === */}
                <div className="p-6 space-y-6 overflow-y-auto flex-1 no-scrollbar">

                    {/* STOCK SUMMARY (MINIMAL) */}
                    <div className="grid grid-cols-2 gap-3">
                        {locations.map(loc => {
                            const stock = stockLevels[loc.id] || 0;
                            return (
                                <div key={loc.id} className={`p-3 rounded-xl border transition-all ${stock > 0 ? 'bg-white/[0.03] border-white/10' : 'bg-black/20 border-white/5 opacity-50'}`}>
                                    <p className="text-[8px] font-black text-white/30 uppercase tracking-widest mb-1 truncate">{loc.name}</p>
                                    <p className={`text-xs font-black italic-black ${stock > 0 ? 'text-white' : 'text-white/20'}`}>{stock} <span className="text-[9px] font-bold uppercase ml-0.5">{unitLabel}</span></p>
                                </div>
                            );
                        })}
                    </div>

                    {/* SELECT ORIGIN */}
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-1">Desde (Origen)</label>
                        <select
                            value={fromLocation}
                            onChange={(e) => setFromLocation(e.target.value)}
                            className={`w-full bg-black border rounded-xl px-4 py-3.5 text-xs font-bold text-white uppercase tracking-widest outline-none transition-all ${isOriginLocked ? 'border-neon/30 text-neon cursor-default' : 'border-white/10 focus:border-neon cursor-pointer'}`}
                            disabled={isOriginLocked}
                        >
                            <option value="" disabled>Seleccionar Origen</option>
                            {locations.map(loc => (
                                <option key={loc.id} value={loc.id}>
                                    {loc.name} ({stockLevels[loc.id] || 0} {unitLabel})
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* SELECT DESTINATION */}
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-1">Hacia (Destino)</label>
                        <div className="flex gap-2 flex-wrap">
                            {destinationOptions.map(loc => (
                                <button
                                    key={loc.id}
                                    onClick={() => setToLocation(loc.id)}
                                    className={`px-4 py-2.5 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${toLocation === loc.id ? 'bg-neon text-black border-neon' : 'bg-black/40 text-white/40 border-white/5 hover:border-white/10'}`}
                                >
                                    {loc.name}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* QUANTITY AND NOTES */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-1">Cantidad</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(e.target.value)}
                                    placeholder="0"
                                    className={`w-full h-12 bg-black border rounded-xl px-4 text-sm font-black text-white italic-black outline-none transition-all ${quantityExceedsStock ? 'border-red-500/50 text-red-400' : 'border-white/10 focus:border-neon'}`}
                                />
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/20 uppercase tracking-widest">{unitLabel}</div>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-zinc-500 uppercase tracking-[0.2em] ml-1">Nota</label>
                            <input
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="OPCIONAL..."
                                className="w-full h-12 bg-black border border-white/10 rounded-xl px-4 text-[10px] font-bold text-white uppercase tracking-widest outline-none focus:border-neon transition-all"
                            />
                        </div>
                    </div>

                    {/* ERROR / INFO */}
                    {hasNoStockAtAll && (
                        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center justify-between">
                            <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">Sin stock disponible</p>
                            <button
                                onClick={() => { onClose(); onInitialStockClick?.(); }}
                                className="text-[8px] font-black text-white bg-white/10 px-3 py-1.5 rounded-lg hover:bg-white/20 transition-all uppercase"
                            >
                                Cargar Stock
                            </button>
                        </div>
                    )}
                </div>

                {/* === FOOTER === */}
                <div className="p-5 border-t border-white/5 bg-[#080808]">
                    <button
                        onClick={handleTransfer}
                        disabled={loading || !isValidTransfer}
                        className={`w-full h-14 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all ${isValidTransfer ? 'bg-neon text-black shadow-lg shadow-neon/10 active:scale-[0.98]' : 'bg-white/5 text-white/20 cursor-not-allowed'}`}
                    >
                        {loading ? 'Procesando...' : (
                            <>
                                <span className="material-symbols-outlined text-lg">swap_horiz</span>
                                Confirmar Transferencia
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
