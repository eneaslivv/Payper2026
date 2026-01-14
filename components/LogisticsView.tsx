import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useToast } from './ToastSystem';
import { TransferStockModal } from './TransferStockModal';
import type { StorageLocation } from '../types';

interface LocationWithMetrics extends StorageLocation {
    metrics?: {
        total_items: number;
        total_closed_units: number;
        total_open_packages: number;
        total_effective_stock: number;
        estimated_value: number;
    };
}

interface LogisticsViewProps {
    preselectedLocationName?: string | null;
}

export const LogisticsView: React.FC<LogisticsViewProps> = ({ preselectedLocationName }) => {
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [locations, setLocations] = useState<LocationWithMetrics[]>([]);
    const [history, setHistory] = useState<any[]>([]);
    const [newLocName, setNewLocName] = useState('');
    const [newLocType, setNewLocType] = useState<'warehouse' | 'point_of_sale' | 'kitchen'>('point_of_sale');
    const [selectedLocation, setSelectedLocation] = useState<LocationWithMetrics | null>(null);
    const [locationStock, setLocationStock] = useState<any[]>([]);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [transferItemId, setTransferItemId] = useState<string | undefined>(undefined);
    const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
    const [itemsVisibility, setItemsVisibility] = useState<Record<string, { is_visible: boolean, type: string }>>({});

    useEffect(() => {
        if (locationStock.length > 0) {
            fetchItemVisibility();
        }
    }, [locationStock]);

    const fetchItemVisibility = async () => {
        const itemIds = locationStock.map(s => s.item_id);
        const { data } = await supabase
            .from('inventory_items')
            .select('id, is_menu_visible, item_type')
            .in('id', itemIds);

        if (data) {
            const map: Record<string, { is_visible: boolean, type: string }> = {};
            data.forEach((i: any) => {
                map[i.id] = { is_visible: i.is_menu_visible, type: i.item_type };
            });
            setItemsVisibility(map);
        }
    };

    const handleToggleVisibility = async (itemId: string, currentVal: boolean, type: string) => {
        setItemsVisibility(prev => ({
            ...prev,
            [itemId]: { ...prev[itemId], is_visible: !currentVal }
        }));

        const isProduct = type === 'sellable' || type === 'product';
        const endpoint = isProduct ? 'products' : 'inventory_items';
        // Check local storage / update logic
        // We can just rely on the existing logic
        try {
            const payload = isProduct ? { is_visible: !currentVal } : { is_menu_visible: !currentVal };
            await supabase.from(endpoint).update(payload).eq('id', itemId);
            addToast(!currentVal ? 'Visible en menú' : 'Oculto del menú', 'success');
            // Invalidate cache
            const profile = await supabase.auth.getUser();
            // We need store_id. Using locations[0] is risky if empty.
            const storeId = locations[0]?.store_id;
            if (storeId) localStorage.removeItem(`inventory_cache_v5_${storeId}`);
        } catch (e) {
            addToast('Error al actualizar', 'error');
            setItemsVisibility(prev => ({ ...prev, [itemId]: { ...prev[itemId], is_visible: currentVal } }));
        }
    };

    useEffect(() => {
        fetchLocations();
        fetchHistory();
    }, []);

    // Effect to handle preselection
    useEffect(() => {
        if (preselectedLocationName && locations.length > 0) {
            const found = locations.find(l => l.name === preselectedLocationName);
            if (found && (!selectedLocation || selectedLocation.id !== found.id)) {
                console.log('📍 Auto-selecting location in Logistics:', found.name);
                handleSelectLocation(found);
            }
        }
    }, [preselectedLocationName, locations]);

    const fetchLocations = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('storage_locations')
            .select('*')
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: true });

        if (error) {
            console.error(error);
            addToast('Error al cargar ubicaciones', 'error');
        } else {
            // Fetch metrics for each location
            const locationsWithMetrics: LocationWithMetrics[] = [];
            for (const loc of data || []) {
                const { data: metrics } = await (supabase.rpc as any)('get_location_stock', { p_location_id: loc.id });
                locationsWithMetrics.push({
                    ...(loc as any),
                    metrics: metrics?.[0] || { total_items: 0, total_closed_units: 0, total_open_packages: 0, total_effective_stock: 0, estimated_value: 0 }
                });
            }
            setLocations(locationsWithMetrics);
        }
        setLoading(false);
    };

    const fetchHistory = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase.from('profiles').select('store_id').eq('id', user.id).single();
        if (!profile?.store_id) return;

        // Use new audit logs instead of stock_transfers
        const { data, error } = await (supabase.from('inventory_audit_logs') as any)
            .select(`
                *,
                inventory_items (name, unit_type),
                location_from:storage_locations!inventory_audit_logs_location_from_fkey (name),
                location_to:storage_locations!inventory_audit_logs_location_to_fkey (name),
                profiles:profiles!inventory_audit_logs_user_id_profiles_fkey (full_name)
            `)
            .eq('store_id', profile.store_id)
            .in('action_type', ['transfer', 'purchase', 'loss', 'adjustment'])
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) console.error(error);
        else setHistory(data || []);
    };

    const fetchLocationStock = async (locationId: string) => {
        const { data, error } = await (supabase.rpc as any)('get_location_stock_details', { p_location_id: locationId });

        if (error) {
            console.error(error);
        } else {
            const formatted = (data || []).map((item: any) => ({
                id: item.id,
                item_id: item.item_id,
                closed_units: item.closed_units,
                open_packages: item.open_packages,
                inventory_items: {
                    id: item.item_id,
                    name: item.item_name,
                    unit_type: item.item_unit_type,
                    image_url: item.item_image_url,
                    cost: item.item_cost,
                    unit_size: item.item_package_size
                }
            }));
            setLocationStock(formatted);
        }
    };

    const handleSelectLocation = async (loc: LocationWithMetrics) => {
        // Optimistically select
        setSelectedLocation(loc);
        setSelectedItemIds([]);

        // Fetch latest metrics to avoid stale data from initial fetch
        const { data: metrics } = await (supabase.rpc as any)('get_location_stock', { p_location_id: loc.id });
        if (metrics?.[0]) {
            setSelectedLocation(prev => prev && prev.id === loc.id ? { ...prev, metrics: metrics[0] } : prev);
            // Also update it in the main list
            setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, metrics: metrics[0] } : l));
        }

        fetchLocationStock(loc.id);
    };

    const toggleSelection = (stockId: string) => {
        setSelectedItemIds(prev =>
            prev.includes(stockId)
                ? prev.filter(id => id !== stockId)
                : [...prev, stockId]
        );
    };

    const handleSelectAll = () => {
        if (selectedItemIds.length === locationStock.length) {
            setSelectedItemIds([]);
        } else {
            setSelectedItemIds(locationStock.map(s => s.id));
        }
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
            location_type: newLocType === 'warehouse' ? 'storage' : newLocType === 'kitchen' ? 'kitchen' : 'custom',
            is_default: locations.length === 0,
            is_deletable: true
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

    const getLocationIcon = (loc: LocationWithMetrics) => {
        const type = (loc as any).location_type || loc.type;
        switch (type) {
            case 'base': return 'home_storage';
            case 'bar': return 'local_bar';
            case 'kitchen': return 'restaurant';
            case 'storage':
            case 'warehouse': return 'inventory_2';
            default: return 'location_on';
        }
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
    };

    return (
        <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-700">
            {/* Selected Location Detail */}
            {selectedLocation && (
                <div className="bg-[#0D0F0D] border border-neon/30 rounded-2xl p-6 shadow-2xl animate-in slide-in-from-top-4">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <div className="size-12 rounded-xl bg-neon/10 flex items-center justify-center border border-neon/20">
                                <span className="material-symbols-outlined text-neon text-xl">{getLocationIcon(selectedLocation)}</span>
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-white uppercase tracking-tight">{selectedLocation.name}</h2>
                                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">
                                    {(selectedLocation as any).location_type || selectedLocation.type}
                                    {selectedLocation.is_default && ' · BASE'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {selectedItemIds.length > 0 && (
                                <button
                                    onClick={() => {
                                        setTransferItemId(undefined);
                                        setIsTransferModalOpen(true);
                                    }}
                                    className="flex items-center gap-2 bg-neon/10 border border-neon/20 text-neon px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-neon hover:text-black transition-all"
                                >
                                    <span className="material-symbols-outlined text-sm">swap_horiz</span>
                                    Transferir ({selectedItemIds.length})
                                </button>
                            )}
                            <button
                                onClick={() => setIsTransferModalOpen(true)}
                                className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all"
                            >
                                <span className="material-symbols-outlined text-sm">swap_horiz</span>
                                Transferir
                            </button>
                            <button
                                onClick={() => setSelectedLocation(null)}
                                className="size-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                    </div>

                    {/* Metrics Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Productos</p>
                            <p className="text-2xl font-black text-white">{selectedLocation.metrics?.total_items || 0}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Cerrados</p>
                            <p className="text-2xl font-black text-neon">{selectedLocation.metrics?.total_closed_units || 0}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Abiertos</p>
                            <p className="text-2xl font-black text-amber-500">{selectedLocation.metrics?.total_open_packages || 0}</p>
                        </div>
                        <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Valor Est.</p>
                            <p className="text-xl font-black text-white">{formatCurrency(selectedLocation.metrics?.estimated_value || 0)}</p>
                        </div>
                    </div>

                    {/* Stock List */}
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                        {locationStock.length === 0 ? (
                            <div className="py-8 text-center text-white/20 text-xs uppercase tracking-widest">Sin stock en esta ubicación</div>
                        ) : (
                            <>
                                <div className="flex justify-end px-2 mb-2">
                                    <button onClick={handleSelectAll} className="text-[9px] font-bold text-neon hover:underline uppercase tracking-wider">
                                        {selectedItemIds.length === locationStock.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                                    </button>
                                </div>
                                {locationStock.map(stock => (
                                    <div
                                        key={stock.id}
                                        className={`flex items-center justify-between bg-white/[0.02] p-3 rounded-xl border transition-all ${selectedItemIds.includes(stock.id) ? 'border-neon/50 bg-neon/5' : 'border-white/5 hover:bg-white/[0.04]'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div onClick={() => toggleSelection(stock.id)} className="cursor-pointer">
                                                <div className={`size-5 rounded border flex items-center justify-center transition-all ${selectedItemIds.includes(stock.id) ? 'bg-neon border-neon' : 'border-white/20 hover:border-white/40'}`}>
                                                    {selectedItemIds.includes(stock.id) && <span className="material-symbols-outlined text-black text-sm font-bold">check</span>}
                                                </div>
                                            </div>
                                            {stock.inventory_items?.image_url && (
                                                <img src={stock.inventory_items.image_url} className="size-10 rounded-lg object-cover bg-black" alt="" />
                                            )}
                                            <div>
                                                <p className="text-[11px] font-black text-white uppercase">{stock.inventory_items?.name}</p>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[8px] text-white/40 uppercase">{stock.inventory_items?.unit_type}</p>

                                                    {/* Menu Visibility Toggle */}
                                                    {itemsVisibility[stock.item_id] && (
                                                        <div
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const info = itemsVisibility[stock.item_id];
                                                                handleToggleVisibility(stock.item_id, info.is_visible, info.type);
                                                            }}
                                                            className={`
                                                                ml-2 px-1.5 py-0.5 rounded-full flex items-center gap-1 cursor-pointer transition-all border
                                                                ${itemsVisibility[stock.item_id]?.is_visible
                                                                    ? 'bg-neon/10 border-neon/30 text-neon'
                                                                    : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'
                                                                }
                                                            `}
                                                        >
                                                            <div className={`size-1.5 rounded-full ${itemsVisibility[stock.item_id]?.is_visible ? 'bg-neon shadow-[0_0_5px_rgba(34,197,94,0.5)]' : 'bg-white/30'}`} />
                                                            <span className="text-[7px] font-black uppercase tracking-wider">
                                                                {itemsVisibility[stock.item_id]?.is_visible ? 'MENÚ ON' : 'MENÚ OFF'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-sm font-black text-neon">{stock.closed_units} <span className="text-[8px] text-white/40">ENV</span></p>
                                                {stock.open_packages?.length > 0 && stock.open_packages.map((pkg: any, idx: number) => {
                                                    const unitSize = Number(stock.inventory_items?.unit_size) || 1;
                                                    const remaining = Number(pkg.remaining || 0);

                                                    // Cap percentage at 100 visually, but calculations rely on data
                                                    const percentage = unitSize > 0 ? Math.min(100, Math.round((remaining / unitSize) * 100)) : 0;

                                                    // Determine color based on percentage
                                                    const barColor = percentage > 50 ? 'bg-green-500' : percentage > 20 ? 'bg-amber-500' : 'bg-red-500';
                                                    const textColor = percentage > 50 ? 'text-green-500' : percentage > 20 ? 'text-amber-500' : 'text-red-500';

                                                    return (
                                                        <div key={idx} className="flex flex-col items-end gap-0.5 mt-1 text-right">
                                                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                                                                <span className="text-[10px] font-bold text-white uppercase tracking-tight">
                                                                    #{idx + 1}
                                                                </span>
                                                                <span className={`text-[10px] font-black ${textColor}`}>
                                                                    {remaining} / {unitSize} {stock.inventory_items?.unit_type}
                                                                </span>
                                                                <span className="text-[8px] font-bold text-white/40">
                                                                    ({percentage}%)
                                                                </span>
                                                            </div>
                                                            {/* Mini Progress Bar */}
                                                            <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full ${barColor} transition-all duration-500`}
                                                                    style={{ width: `${percentage}%` }}
                                                                ></div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setTransferItemId(stock.item_id);
                                                    setIsTransferModalOpen(true);
                                                }}
                                                className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 hover:bg-blue-500 hover:text-white transition-all border border-blue-500/20"
                                                title="Transferir Stock"
                                            >
                                                <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                            </button>
                                        </div>
                                    </div>
                                ))
                                }
                            </>
                        )}
                    </div>
                </div>
            )
            }

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

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 no-scrollbar">
                        {loading && (
                            <div className="col-span-full py-10 flex flex-col items-center justify-center opacity-40">
                                <span className="material-symbols-outlined animate-spin text-2xl mb-2">sync</span>
                                <p className="text-[10px] uppercase font-black tracking-widest">Cargando...</p>
                            </div>
                        )}
                        {!loading && locations.length === 0 && (
                            <div className="col-span-full py-10 flex flex-col items-center justify-center opacity-20 bg-white/5 rounded-xl border border-dashed border-white/20">
                                <span className="material-symbols-outlined text-3xl mb-2">inventory_2</span>
                                <p className="text-[10px] uppercase font-black tracking-widest">Sin ubicaciones definidas</p>
                            </div>
                        )}
                        {locations.map(loc => (
                            <div
                                key={loc.id}
                                onClick={() => handleSelectLocation(loc)}
                                className={`cursor-pointer bg-white/[0.03] p-4 rounded-xl border group hover:bg-white/[0.06] transition-all ${selectedLocation?.id === loc.id ? 'border-neon/50 bg-neon/5' : 'border-white/5 hover:border-white/10'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <span className={`material-symbols-outlined text-lg transition-colors ${selectedLocation?.id === loc.id ? 'text-neon' : 'text-white/20 group-hover:text-neon'
                                            }`}>
                                            {getLocationIcon(loc)}
                                        </span>
                                        <div>
                                            <p className="text-white text-[11px] font-black uppercase italic-black tracking-tight leading-none mb-1">{loc.name}</p>
                                            <p className="text-[#71766F] text-[9px] uppercase tracking-wider font-bold">
                                                {((loc as any).location_type || loc.type).replace('_', ' ')}
                                            </p>
                                        </div>
                                    </div>
                                    {loc.is_default && (
                                        <span className="text-[7px] font-black bg-neon text-black px-1.5 py-0.5 rounded uppercase tracking-tighter">BASE</span>
                                    )}
                                </div>

                                {/* Mini Metrics Row */}
                                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/5">
                                    <div className="flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs text-white/20">inventory_2</span>
                                        <span className="text-[10px] font-bold text-white">{loc.metrics?.total_items || 0}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs text-neon/50">package_2</span>
                                        <span className="text-[10px] font-bold text-neon">{loc.metrics?.total_closed_units || 0}</span>
                                    </div>
                                    {(loc.metrics?.total_open_packages || 0) > 0 && (
                                        <div className="flex items-center gap-1">
                                            <span className="material-symbols-outlined text-xs text-amber-500/50">local_drink</span>
                                            <span className="text-[10px] font-bold text-amber-500">{loc.metrics?.total_open_packages}</span>
                                        </div>
                                    )}
                                    <div className="ml-auto text-[9px] font-bold text-white/30">
                                        {formatCurrency(loc.metrics?.estimated_value || 0)}
                                    </div>
                                </div>
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

            {/* BOTTOM SECTION: AUDIT LOG HISTORY */}
            <div className="bg-[#141714] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                <div className="p-4 border-b border-white/5 bg-white/[0.01] flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
                        <span className="material-symbols-outlined text-orange-500 text-sm">history</span>
                    </div>
                    <h3 className="text-white font-black uppercase tracking-wider text-xs">Historial de Movimientos</h3>
                </div>

                <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/20 border-b border-white/[0.02]">
                                <th className="px-6 py-4 text-[9px] font-black text-white/30 uppercase tracking-widest">Fecha</th>
                                <th className="px-6 py-4 text-[9px] font-black text-white/30 uppercase tracking-widest">Acción</th>
                                <th className="px-6 py-4 text-[9px] font-black text-white/30 uppercase tracking-widest">Ítem</th>
                                <th className="px-6 py-4 text-[9px] font-black text-white/30 uppercase tracking-widest">Impacto</th>
                                <th className="px-6 py-4 text-[9px] font-black text-white/30 uppercase tracking-widest">Motivo</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.01]">
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-16 text-center text-[10px] text-white/10 uppercase tracking-widest font-black">Sin movimientos registrados</td>
                                </tr>
                            ) : (
                                history.map(tr => (
                                    <tr key={tr.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-6 py-3 whitespace-nowrap">
                                            <p className="text-[10px] text-white font-bold">{new Date(tr.created_at).toLocaleDateString()}</p>
                                            <p className="text-[9px] text-white/20">{new Date(tr.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded ${tr.action_type === 'purchase' ? 'bg-green-500/10 text-green-500' :
                                                tr.action_type === 'loss' ? 'bg-red-500/10 text-red-500' :
                                                    tr.action_type === 'transfer' ? 'bg-blue-500/10 text-blue-500' :
                                                        'bg-orange-500/10 text-orange-500'
                                                }`}>
                                                {tr.action_type === 'purchase' ? 'COMPRA' :
                                                    tr.action_type === 'loss' ? 'PÉRDIDA' :
                                                        tr.action_type === 'transfer' ? 'TRANSFER' :
                                                            'AJUSTE'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <p className="text-[10px] font-black text-white uppercase">{tr.inventory_items?.name || '-'}</p>
                                            {tr.inventory_items?.unit_type && (
                                                <p className="text-[8px] text-white/30 uppercase">{tr.inventory_items.unit_type}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-3">
                                            <span className={`text-[11px] font-black ${(tr.package_delta || tr.quantity_delta) > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                {(tr.package_delta || tr.quantity_delta) > 0 ? '+' : ''}{tr.package_delta || tr.quantity_delta} un
                                            </span>
                                        </td>
                                        <td className="px-6 py-3">
                                            <p className="text-[9px] text-white/40 truncate max-w-[250px]">
                                                {tr.action_type === 'transfer' ? (
                                                    <span>
                                                        <span className="text-red-400">{tr.location_from?.name || 'Origen'}</span>
                                                        <span className="text-white/20 mx-1">→</span>
                                                        <span className="text-green-400">{tr.location_to?.name || 'Destino'}</span>
                                                    </span>
                                                ) : tr.action_type === 'loss' ? (
                                                    <span>
                                                        <span className="text-red-400">{tr.location_from?.name || ''}</span>
                                                        {tr.location_from?.name && <span className="text-white/20"> · </span>}
                                                        {tr.reason || 'Pérdida'}
                                                    </span>
                                                ) : tr.action_type === 'purchase' ? (
                                                    <span>
                                                        <span className="text-green-400">{tr.location_to?.name || ''}</span>
                                                        {tr.location_to?.name && <span className="text-white/20"> · </span>}
                                                        {tr.reason || 'Compra'}
                                                    </span>
                                                ) : (
                                                    tr.reason || '-'
                                                )}
                                            </p>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <TransferStockModal
                isOpen={isTransferModalOpen}
                onClose={() => {
                    setIsTransferModalOpen(false);
                    setTransferItemId(undefined);
                }}
                onSuccess={() => {
                    fetchLocations();
                    fetchHistory();
                    if (selectedLocation) fetchLocationStock(selectedLocation.id);
                    setSelectedItemIds([]);
                }}
                preselectedFromLocation={selectedLocation?.id}
                preselectedItemId={transferItemId}
                preselectedItemIds={selectedItemIds.length > 0 && !transferItemId ? selectedItemIds.map(stockId => locationStock.find(s => s.id === stockId)?.item_id).filter(Boolean) as string[] : undefined}
            />
        </div >
    );
};
