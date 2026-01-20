import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastSystem';
import type { InventoryItem, StorageLocation } from '../types';

interface StockTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    item?: InventoryItem;
    onSuccess: () => void;
    /** Optional: Pre-select origin location */
    sourceLocationId?: string;
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

    // --- Local Item State (for when prop is missing) ---
    const [localItem, setLocalItem] = useState<InventoryItem | undefined>(item);
    const [allItems, setAllItems] = useState<InventoryItem[]>([]);

    // --- Derived State ---
    const parsedQuantity = parseFloat(quantity) || 0;
    const currentSourceStock = stockLevels[fromLocation] || 0;
    const quantityExceedsStock = parsedQuantity > currentSourceStock;
    const isValidTransfer = localItem && fromLocation && toLocation && parsedQuantity > 0 && !quantityExceedsStock;

    // Unit Label Helper
    const unitLabel = useMemo(() => {
        if (!localItem?.unit_type) return 'u';
        const map: Record<string, string> = { gram: 'g', ml: 'ml', liter: 'L', kilogram: 'kg', kg: 'kg' };
        return map[localItem.unit_type] || localItem.unit_type;
    }, [localItem]);

    // --- Fetch Data ---
    const fetchLocationsAndStock = async () => {
        setLoading(true);
        try {
            // 1. Get Locations
            const { data: locs, error: locError } = await supabase
                .from('storage_locations')
                .select('*')
                .order('name');
            if (locError) throw locError;

            const validLocs = locs || [];
            setLocations(validLocs);

            // 2. Get Stock Levels
            const { data: levels, error: stockError } = await supabase
                .from('item_stock_levels')
                .select('location_id, quantity')
                .eq('inventory_item_id', localItem!.id); // Use localItem
            if (stockError) throw stockError;

            const levelsMap: Record<string, number> = {};
            levels?.forEach((l: any) => { levelsMap[l.location_id] = Number(l.quantity); });
            setStockLevels(levelsMap);

            // 3. Smart Auto-Select Origin
            const resultLocs = validLocs.filter(l => (levelsMap[l.id] || 0) > 0);

            if (sourceLocationId && levelsMap[sourceLocationId] > 0) {
                setFromLocation(sourceLocationId);
            } else if (resultLocs.length === 1) {
                setFromLocation(resultLocs[0].id);
            } else if (resultLocs.length > 0) {
                // Default to one with most stock
                const best = resultLocs.sort((a, b) => (levelsMap[b.id] || 0) - (levelsMap[a.id] || 0))[0];
                setFromLocation(best.id);
            }

        } catch (err) {
            console.error('Error init transfer:', err);
            addToast('Error al cargar ubicaciones', 'error');
        } finally {
            setLoading(false);
        }
    };

    // --- Actions ---
    const handleTransfer = async () => {
        if (!isValidTransfer) return;
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('transfer_stock', {
                p_item_id: localItem!.id,
                p_from_location_id: fromLocation,
                p_to_location_id: toLocation,
                p_quantity: parsedQuantity,
                p_user_id: (await supabase.auth.getUser()).data.user?.id || null,
                p_notes: notes || '',
                p_movement_type: 'transfer',
                p_reason: 'Transferencia entre ubicaciones'
            });

            if (error) throw error;
            const res = data as any;
            if (res && res.success === false) throw new Error(res.error || 'Falló la transferencia');

            const fromName = locations.find(l => l.id === fromLocation)?.name || 'Origen';
            const toName = locations.find(l => l.id === toLocation)?.name || 'Destino';

            addToast(`Transferido: ${parsedQuantity} ${unitLabel} (${fromName} -> ${toName})`, 'success');
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error(err);
            addToast(err.message || 'Error en transferencia', 'error');
        } finally {
            setLoading(false);
        }
    };

    // --- Effects ---
    useEffect(() => {
        if (isOpen) {
            if (item) {
                setLocalItem(item);
                fetchLocationsAndStock();
            } else {
                // Fetch All Items for selection
                const fetchAllItems = async () => {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) return;
                    // Get store id (or use context if available, but safeguard here)
                    const { data: profile } = await supabase.from('profiles').select('store_id').eq('id', user.id).single();
                    if (profile?.store_id) {
                        const { data } = await supabase.from('inventory_items').select('*').eq('store_id', profile.store_id).order('name');
                        if (data) setAllItems(data);
                    }
                };
                fetchAllItems();
            }
        } else {
            // Reset state on close
            setQuantity('');
            setNotes('');
            setFromLocation('');
            setToLocation('');
            if (!item) setLocalItem(undefined);
        }
    }, [isOpen, item]);

    // Fetch stock when localItem changes (if manually selected)
    useEffect(() => {
        if (localItem && isOpen) {
            fetchLocationsAndStock();
        }
    }, [localItem, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
            />

            {/* Modal Content */}
            <div className="relative w-full max-w-md bg-[#09090b] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="p-6 border-b border-white/5 bg-[#121212]">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">
                            TRANSFERIR <span className="text-neon">STOCK</span>
                        </h2>
                        <button onClick={onClose} className="size-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-all">
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                    </div>

                    {/* Item Context */}
                    <div className="flex items-center gap-3 bg-black/40 p-3 rounded-xl border border-white/5">
                        {item ? (
                            <>
                                <div className="size-10 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                                    {item.image_url ?
                                        <img src={item.image_url} className="size-full object-cover rounded-lg" /> :
                                        <span className="material-symbols-outlined text-white/20">inventory_2</span>
                                    }
                                </div>
                                <div>
                                    <p className="text-sm font-bold text-white uppercase">{item.name}</p>
                                    <p className="text-[10px] text-white/40 uppercase tracking-wider">
                                        Total: {item.current_stock?.toFixed(2)} {unitLabel}
                                    </p>
                                </div>
                            </>
                        ) : (
                            <div className="w-full">
                                <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-1 block">Producto a Transferir</label>
                                <select
                                    value={localItem?.id || ''}
                                    onChange={(e) => {
                                        const selected = allItems.find(i => i.id === e.target.value);
                                        setLocalItem(selected);
                                    }}
                                    className="w-full bg-transparent text-sm font-bold text-white outline-none border-b border-white/10 py-1 focus:border-neon"
                                >
                                    <option value="">Seleccionar Producto...</option>
                                    {allItems.map(i => (
                                        <option key={i.id} value={i.id}>{i.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">

                    {/* Flow: Origin -> Dest */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Origin */}
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Desde</label>
                            <select
                                value={fromLocation}
                                onChange={e => setFromLocation(e.target.value)}
                                className="w-full h-12 bg-[#1a1a1a] border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-neon/50 appearance-none"
                            >
                                <option value="" disabled>Seleccionar...</option>
                                {locations.filter(l => (stockLevels[l.id] || 0) > 0).map(loc => (
                                    <option key={loc.id} value={loc.id}>
                                        {loc.name} ({stockLevels[loc.id]} {unitLabel})
                                    </option>
                                ))}
                            </select>
                            {fromLocation === '' && locations.every(l => (stockLevels[l.id] || 0) === 0) && (
                                <p className="text-[9px] text-red-400 font-bold ml-1">⚠ Sin stock disponible</p>
                            )}
                        </div>

                        {/* Destination */}
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Hacia</label>
                            <select
                                value={toLocation}
                                onChange={e => setToLocation(e.target.value)}
                                className="w-full h-12 bg-[#1a1a1a] border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-neon/50 appearance-none"
                            >
                                <option value="" disabled>Seleccionar...</option>
                                {locations.filter(l => l.id !== fromLocation).map(loc => (
                                    <option key={loc.id} value={loc.id}>
                                        {loc.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Quantity Input (Big) */}
                    <div className="space-y-3">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Cantidad a Transferir</label>
                        <div className="relative group">
                            <input
                                type="number"
                                value={quantity}
                                onChange={e => setQuantity(e.target.value)}
                                placeholder="0"
                                className={`w-full h-16 bg-transparent border-b-2 text-4xl font-black text-center outline-none transition-all placeholder:text-white/10 ${quantityExceedsStock ? 'border-red-500 text-red-500' : 'border-white/10 focus:border-neon text-white'}`}
                            />
                            <span className="absolute right-0 bottom-4 text-xs font-bold text-white/20 uppercase">{unitLabel}</span>
                        </div>
                        {quantityExceedsStock && (
                            <p className="text-center text-[10px] text-red-400 font-bold uppercase tracking-wider animate-pulse">
                                Excede stock disponible ({currentSourceStock} {unitLabel})
                            </p>
                        )}
                    </div>

                    {/* Notes (Optional) */}
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Notas (Opcional)</label>
                        <input
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-white/30 placeholder:text-white/20"
                            placeholder="Motivo de traslado..."
                        />
                    </div>

                </div>

                {/* Footer */}
                <div className="p-6 pt-0">
                    <button
                        onClick={handleTransfer}
                        disabled={!isValidTransfer || loading}
                        className="w-full py-4 rounded-xl bg-neon text-black font-black text-xs uppercase tracking-[0.2em] hover:bg-white hover:scale-[1.02] transition-all disabled:opacity-50 disabled:grayscale disabled:hover:scale-100 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                    >
                        {loading ? 'Procesando...' : 'Confirmar Transferencia'}
                    </button>
                    {fromLocation === '' && locations.every(l => (stockLevels[l.id] || 0) === 0) && (
                        <button
                            onClick={() => { onClose(); onInitialStockClick?.(); }}
                            className="w-full mt-3 py-3 rounded-xl border border-white/10 text-white/40 font-bold text-[10px] uppercase tracking-widest hover:text-white hover:border-white/30 transition-all"
                        >
                            Cargar Stock Inicial
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
};

