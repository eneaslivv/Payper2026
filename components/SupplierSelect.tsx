import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from './ToastSystem';

interface Supplier {
    id: string;
    name: string;
    contact_info?: string;
    email?: string;
    active: boolean;
}

interface SupplierSelectProps {
    value: string | null;
    onChange: (supplierId: string | null, supplier?: Supplier) => void;
    required?: boolean;
    className?: string;
}

export const SupplierSelect: React.FC<SupplierSelectProps> = ({
    value,
    onChange,
    required = false,
    className = ''
}) => {
    const { profile } = useAuth();
    const { addToast } = useToast();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState('');
    const [creating, setCreating] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const storeId = profile?.store_id;

    useEffect(() => {
        if (storeId) fetchSuppliers();
    }, [storeId]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchSuppliers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('inventory_suppliers' as any)
                .select('*')
                .eq('store_id', storeId)
                .eq('active', true)
                .order('name');

            if (error) throw error;
            setSuppliers(data || []);
        } catch (err: any) {
            console.error('Error fetching suppliers:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreateSupplier = async () => {
        if (!newSupplierName.trim()) return;

        setCreating(true);
        try {
            const { data, error } = await supabase
                .from('inventory_suppliers' as any)
                .insert({
                    store_id: storeId,
                    name: newSupplierName.trim(),
                    active: true
                })
                .select()
                .single();

            if (error) throw error;

            addToast('✓ Proveedor creado', 'success');
            setSuppliers(prev => [...prev, data as any as Supplier]);
            onChange((data as any).id, data as any as Supplier);
            setNewSupplierName('');
            setShowCreate(false);
            setIsOpen(false);
        } catch (err: any) {
            addToast('Error: ' + err.message, 'error');
        } finally {
            setCreating(false);
        }
    };

    const selectedSupplier = suppliers.find(s => s.id === value);
    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div ref={dropdownRef} className={`relative ${className}`}>
            {/* Selected Value / Trigger */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full bg-black border rounded-xl px-4 py-3 text-left flex items-center justify-between transition-all ${isOpen ? 'border-neon' : 'border-white/10'
                    } ${required && !value ? 'border-red-500/50' : ''}`}
            >
                <span className={`text-xs font-bold uppercase tracking-widest ${selectedSupplier ? 'text-white' : 'text-white/30'}`}>
                    {selectedSupplier?.name || 'Seleccionar proveedor...'}
                </span>
                <span className="material-symbols-outlined text-white/20 text-sm">
                    {isOpen ? 'expand_less' : 'expand_more'}
                </span>
            </button>

            {/* Dropdown */}
            {isOpen && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    {/* Search */}
                    <div className="p-3 border-b border-white/5">
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/20 text-sm">search</span>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar proveedor..."
                                className="w-full bg-white/5 border border-white/5 rounded-lg pl-9 pr-3 py-2 text-[10px] font-bold text-white uppercase tracking-widest outline-none focus:border-neon/50 transition-all placeholder:text-white/20"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Suppliers List */}
                    <div className="max-h-48 overflow-y-auto">
                        {loading ? (
                            <div className="p-4 text-center">
                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Cargando...</span>
                            </div>
                        ) : filteredSuppliers.length === 0 ? (
                            <div className="p-4 text-center">
                                <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">
                                    {search ? 'Sin resultados' : 'No hay proveedores'}
                                </span>
                            </div>
                        ) : (
                            filteredSuppliers.map(supplier => (
                                <button
                                    key={supplier.id}
                                    type="button"
                                    onClick={() => {
                                        onChange(supplier.id, supplier);
                                        setIsOpen(false);
                                        setSearch('');
                                    }}
                                    className={`w-full px-4 py-3 text-left flex items-center gap-3 hover:bg-white/5 transition-colors ${value === supplier.id ? 'bg-neon/10' : ''
                                        }`}
                                >
                                    <span className={`material-symbols-outlined text-sm ${value === supplier.id ? 'text-neon' : 'text-white/20'}`}>
                                        {value === supplier.id ? 'check_circle' : 'storefront'}
                                    </span>
                                    <div className="flex flex-col">
                                        <span className={`text-xs font-bold uppercase tracking-widest ${value === supplier.id ? 'text-neon' : 'text-white'}`}>
                                            {supplier.name}
                                        </span>
                                        {supplier.contact_info && (
                                            <span className="text-[9px] text-white/30">{supplier.contact_info}</span>
                                        )}
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* Create New */}
                    <div className="p-3 border-t border-white/5">
                        {showCreate ? (
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newSupplierName}
                                    onChange={(e) => setNewSupplierName(e.target.value)}
                                    placeholder="Nombre del proveedor..."
                                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] font-bold text-white uppercase tracking-widest outline-none focus:border-neon/50"
                                    autoFocus
                                    onKeyDown={(e) => e.key === 'Enter' && handleCreateSupplier()}
                                />
                                <button
                                    type="button"
                                    onClick={handleCreateSupplier}
                                    disabled={creating || !newSupplierName.trim()}
                                    className="px-3 py-2 bg-neon text-black rounded-lg text-[10px] font-black uppercase tracking-widest disabled:opacity-50 transition-all active:scale-95"
                                >
                                    {creating ? '...' : 'OK'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setShowCreate(false); setNewSupplierName(''); }}
                                    className="px-3 py-2 bg-white/5 text-white/40 rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-white transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowCreate(true)}
                                className="w-full flex items-center justify-center gap-2 py-2 text-neon hover:bg-neon/10 rounded-lg transition-colors"
                            >
                                <span className="material-symbols-outlined text-sm">add</span>
                                <span className="text-[10px] font-black uppercase tracking-widest">Nuevo Proveedor</span>
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Required indicator */}
            {required && !value && (
                <p className="text-[8px] font-bold text-red-500/60 uppercase tracking-widest mt-1 ml-1">
                    * Proveedor obligatorio para compras
                </p>
            )}
        </div>
    );
};

export default SupplierSelect;
