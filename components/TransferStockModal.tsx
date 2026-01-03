import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastSystem';

interface TransferStockModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    preselectedItemId?: string;
    preselectedItemIds?: string[];
    preselectedFromLocation?: string;
}

export const TransferStockModal: React.FC<TransferStockModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    preselectedItemId,
    preselectedItemIds,
    preselectedFromLocation
}) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState<any[]>([]);
    const [items, setItems] = useState<any[]>([]);
    const [stockByLocation, setStockByLocation] = useState<any[]>([]);

    const [selectedItem, setSelectedItem] = useState(preselectedItemId || '');
    const [fromLocation, setFromLocation] = useState(preselectedFromLocation || '');
    const [toLocation, setToLocation] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [bulkQuantities, setBulkQuantities] = useState<Record<string, number>>({});
    const [reason, setReason] = useState('');

    const [availableStock, setAvailableStock] = useState(0);
    const isBulk = (preselectedItemIds?.length || 0) > 0;

    useEffect(() => {
        if (isOpen) {
            fetchLocations();
            fetchItems();
            if (preselectedItemId) setSelectedItem(preselectedItemId);
            if (preselectedFromLocation) setFromLocation(preselectedFromLocation);
            if (isBulk && preselectedItemIds) {
                const initialQuantities: Record<string, number> = {};
                preselectedItemIds.forEach(id => {
                    initialQuantities[id] = 1;
                });
                setBulkQuantities(initialQuantities);
            }
        }
    }, [isOpen, preselectedItemId, preselectedFromLocation, preselectedItemIds]);

    useEffect(() => {
        if (selectedItem && fromLocation) {
            const stock = stockByLocation.find(s => s.item_id === selectedItem && s.location_id === fromLocation);
            setAvailableStock(stock?.closed_units || 0);
        }
    }, [selectedItem, fromLocation, stockByLocation]);

    const fetchLocations = async () => {
        const { data } = await supabase.from('storage_locations').select('*').order('name');
        setLocations(data || []);
    };

    const fetchItems = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase.from('profiles').select('store_id').eq('id', user.id).single();
        if (!profile?.store_id) return;

        const { data: itemsData } = await supabase
            .from('inventory_items')
            .select('id, name, unit_type')
            .eq('store_id', profile.store_id)
            .order('name');

        setItems(itemsData || []);

        // Fetch all stock by location using RPC to ensuring visibility
        const { data: stockData } = await (supabase.rpc as any)('get_store_stock', { p_store_id: profile.store_id });

        setStockByLocation(stockData || []);
    };

    const handleTransfer = async () => {
        if (!fromLocation || !toLocation || !reason.trim()) {
            addToast('Completá todos los campos obligatorios', 'warning');
            return;
        }

        if (fromLocation === toLocation) {
            addToast('Origen y destino no pueden ser iguales', 'error');
            return;
        }

        if (!isBulk && (!selectedItem || quantity > availableStock)) {
            addToast(`Stock insuficiente o producto no seleccionado. Disponible: ${availableStock}`, 'error');
            return;
        }

        setLoading(true);

        try {
            if (isBulk && preselectedItemIds) {
                const transfers = preselectedItemIds.map(async (itemId) => {
                    const qty = bulkQuantities[itemId] || 0;
                    if (qty <= 0) return; // Skip

                    // Check stock specifically for this item
                    const stock = stockByLocation.find(s => s.item_id === itemId && s.location_id === fromLocation);
                    const available = stock?.closed_units || 0;

                    if (qty > available) {
                        const itemName = items.find(i => i.id === itemId)?.name || 'Producto';
                        throw new Error(`Stock insuficiente para ${itemName} (Disp: ${available})`);
                    }

                    const { error } = await (supabase.rpc as any)('transfer_stock', {
                        p_from_location: fromLocation,
                        p_to_location: toLocation,
                        p_item_id: itemId,
                        p_quantity: qty,
                        p_reason: reason,
                        p_source_ui: 'locations'
                    });
                    if (error) throw error;
                });

                await Promise.all(transfers);
                addToast(`✓ ${preselectedItemIds.length} productos transferidos`, 'success');
            } else {
                const { error } = await (supabase.rpc as any)('transfer_stock', {
                    p_from_location: fromLocation,
                    p_to_location: toLocation,
                    p_item_id: selectedItem,
                    p_quantity: quantity,
                    p_reason: reason,
                    p_source_ui: 'locations'
                });

                if (error) throw error;
                addToast(`✓ ${quantity} unidades transferidas`, 'success');
            }

            onSuccess();
            onClose();
            resetForm();
        } catch (err: any) {
            console.error(err);
            addToast(err.message || 'Error al transferir', 'error');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setSelectedItem('');
        setFromLocation('');
        setToLocation('');
        setQuantity(1);
        setBulkQuantities({});
        setReason('');
    };

    if (!isOpen) return null;

    const selectedItemData = items.find(i => i.id === selectedItem);
    const fromLocationData = locations.find(l => l.id === fromLocation);
    const toLocationData = locations.find(l => l.id === toLocation);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-[#0D0F0D] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 slide-in-from-bottom-4">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-white/5">
                    <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                            <span className="material-symbols-outlined text-blue-500">swap_horiz</span>
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white uppercase tracking-tight">Transferir Stock</h2>
                            <p className="text-[10px] text-white/40">Mover entre ubicaciones</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5">
                    {/* Item Select OR Bulk List */}
                    {!isBulk ? (
                        <>
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Producto</label>
                                <select
                                    value={selectedItem}
                                    onChange={(e) => setSelectedItem(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:border-blue-500 outline-none transition-all"
                                >
                                    <option value="">Seleccionar producto...</option>
                                    {items.map(item => (
                                        <option key={item.id} value={item.id}>{item.name}</option>
                                    ))}
                                </select>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white/5 rounded-xl p-4 max-h-[200px] overflow-y-auto space-y-3">
                            <p className="text-[10px] uppercase font-black tracking-widest text-white/50 mb-2">
                                Productos Seleccionados ({preselectedItemIds?.length})
                            </p>
                            {preselectedItemIds?.map(itemId => {
                                const itemIdx = items.find(i => i.id === itemId);
                                const stock = stockByLocation.find(s => s.item_id === itemId && s.location_id === fromLocation);
                                const available = stock?.closed_units || 0;
                                const currentQty = bulkQuantities[itemId] || 1;

                                return (
                                    <div key={itemId} className="flex items-center justify-between gap-3 bg-black/20 p-2 rounded-lg">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-bold text-white truncate">{itemIdx?.name || 'Cargando...'}</p>
                                            <p className="text-[9px] text-white/40">Disp: {available} ENV</p>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setBulkQuantities(prev => ({ ...prev, [itemId]: Math.max(0, (prev[itemId] || 1) - 1) }))}
                                                className="size-6 bg-white/5 rounded hover:bg-white/10 text-white text-xs"
                                            >-</button>
                                            <input
                                                type="number"
                                                value={currentQty}
                                                onChange={(e) => setBulkQuantities(prev => ({ ...prev, [itemId]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                                className="w-10 bg-transparent text-center text-xs font-bold text-white outline-none"
                                            />
                                            <button
                                                onClick={() => setBulkQuantities(prev => ({ ...prev, [itemId]: Math.min(available, (prev[itemId] || 1) + 1) }))}
                                                className="size-6 bg-white/5 rounded hover:bg-white/10 text-white text-xs"
                                            >+</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* From/To Locations */}
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-end">
                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Origen</label>
                            <select
                                value={fromLocation}
                                onChange={(e) => setFromLocation(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-xs font-bold text-white focus:border-blue-500 outline-none"
                            >
                                <option value="">Origen...</option>
                                {locations.map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="pb-3">
                            <span className="material-symbols-outlined text-blue-500 text-xl">arrow_forward</span>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Destino</label>
                            <select
                                value={toLocation}
                                onChange={(e) => setToLocation(e.target.value)}
                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-xs font-bold text-white focus:border-blue-500 outline-none"
                            >
                                <option value="">Destino...</option>
                                {locations.filter(l => l.id !== fromLocation).map(loc => (
                                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Quantity (Single Only) */}
                    {!isBulk && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-[9px] font-black text-white/40 uppercase tracking-widest">Cantidad (Envases)</label>
                                {fromLocation && selectedItem && (
                                    <span className="text-[9px] font-bold text-neon">
                                        Disponible: {availableStock}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    className="size-12 rounded-xl bg-white/5 border border-white/10 text-white font-black text-lg hover:bg-white/10 transition-all"
                                >
                                    -
                                </button>
                                <input
                                    type="number"
                                    value={quantity}
                                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                    min={1}
                                    max={availableStock}
                                    className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-center text-xl font-black text-white focus:border-blue-500 outline-none"
                                />
                                <button
                                    onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                                    className="size-12 rounded-xl bg-white/5 border border-white/10 text-white font-black text-lg hover:bg-white/10 transition-all"
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Reason */}
                    <div className="space-y-2">
                        <label className="text-[9px] font-black text-white/40 uppercase tracking-widest flex items-center gap-1">
                            Motivo <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Ej: Reposición para turno noche"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white focus:border-blue-500 outline-none placeholder:text-white/20"
                        />
                    </div>

                    {/* Preview */}
                    {/* Preview (Shown in simple mode or if fully configured) */}
                    {!isBulk && selectedItem && fromLocation && toLocation && (
                        <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4">
                            <p className="text-[10px] text-blue-400 font-bold mb-2">Vista previa:</p>
                            <p className="text-white text-sm">
                                <span className="font-black">{quantity}</span> env. de <span className="font-black">{selectedItemData?.name}</span>
                            </p>
                            <p className="text-white/60 text-xs mt-1">
                                {fromLocationData?.name} → {toLocationData?.name}
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 pt-0 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-4 rounded-xl border border-white/10 text-white/60 text-[10px] font-black uppercase tracking-widest hover:bg-white/5 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleTransfer}
                        disabled={loading || (!isBulk && !selectedItem) || !fromLocation || !toLocation || !reason.trim() || (!isBulk && quantity > availableStock)}
                        className="flex-1 py-4 rounded-xl bg-blue-500 text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Transfiriendo...' : 'Confirmar Transferencia'}
                    </button>
                </div>
            </div>
        </div>
    );
};
