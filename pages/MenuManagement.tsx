import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastSystem';
import {
    Plus, Edit2, Trash2, ChevronRight, Clock, Calendar,
    MapPin, Star, AlertTriangle, Check, X, GripVertical,
    Copy, ToggleLeft, ToggleRight, Save
} from 'lucide-react';

interface Menu {
    id: string;
    store_id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    priority: number;
    is_fallback: boolean;
    created_at: string;
    product_count?: number;
    rules?: MenuRule[];
}

interface MenuRule {
    id: string;
    menu_id: string;
    rule_type: 'session_type' | 'tables' | 'time_range' | 'weekdays' | 'manual_override';
    rule_config: any;
    is_active: boolean;
}

interface MenuProduct {
    id: string;
    menu_id: string;
    product_id: string;
    price_override: number | null;
    sort_order: number;
    is_visible: boolean;
    product?: {
        name: string;
        base_price: number;
        category: string;
    };
}

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const MenuManagement: React.FC = () => {
    const { profile } = useAuth();
    const { addToast } = useToast();
    const storeId = profile?.store_id;

    const [menus, setMenus] = useState<Menu[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
    const [menuProducts, setMenuProducts] = useState<MenuProduct[]>([]);
    const [allProducts, setAllProducts] = useState<any[]>([]);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', description: '', priority: 100 });
    const [activeTab, setActiveTab] = useState<'products' | 'rules'>('products');

    // Fetch menus
    useEffect(() => {
        if (!storeId) return;
        fetchMenus();
        fetchAllProducts();
    }, [storeId]);

    const fetchMenus = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('menus')
                .select('*, menu_rules(*)')
                .eq('store_id', storeId)
                .order('priority', { ascending: true });

            if (error) throw error;

            // Get product counts
            const menusWithCounts = await Promise.all((data || []).map(async (menu: any) => {
                const { count } = await supabase
                    .from('menu_products')
                    .select('*', { count: 'exact', head: true })
                    .eq('menu_id', menu.id);
                return { ...menu, product_count: count || 0, rules: menu.menu_rules };
            }));

            setMenus(menusWithCounts);
        } catch (err) {
            console.error('Error fetching menus:', err);
            addToast('Error al cargar menús', 'error');
        } finally {
            setLoading(false);
        }
    };

    const fetchAllProducts = async () => {
        const { data } = await supabase
            .from('products')
            .select('id, name, base_price, category')
            .eq('store_id', storeId)
            .eq('active', true)
            .order('name');
        setAllProducts(data || []);
    };

    const fetchMenuProducts = async (menuId: string) => {
        const { data } = await supabase
            .from('menu_products')
            .select('*, product:products(name, base_price, category)')
            .eq('menu_id', menuId)
            .order('sort_order');
        setMenuProducts(data || []);
    };

    const handleSelectMenu = async (menu: Menu) => {
        setSelectedMenu(menu);
        setEditForm({ name: menu.name, description: menu.description || '', priority: menu.priority });
        await fetchMenuProducts(menu.id);
    };

    const handleCreateMenu = async () => {
        try {
            const { data, error } = await supabase
                .from('menus')
                .insert({
                    store_id: storeId,
                    name: 'Nuevo Menú',
                    priority: 100,
                    is_active: false,
                    is_fallback: false
                })
                .select()
                .single();

            if (error) throw error;
            addToast('Menú creado', 'success');
            fetchMenus();
            setSelectedMenu(data);
        } catch (err) {
            addToast('Error al crear menú', 'error');
        }
    };

    const handleSaveMenu = async () => {
        if (!selectedMenu) return;
        try {
            const { error } = await supabase
                .from('menus')
                .update({
                    name: editForm.name,
                    description: editForm.description || null,
                    priority: editForm.priority
                })
                .eq('id', selectedMenu.id);

            if (error) throw error;
            addToast('Menú guardado', 'success');
            setIsEditing(false);
            fetchMenus();
        } catch (err) {
            addToast('Error al guardar', 'error');
        }
    };

    const handleToggleActive = async (menu: Menu) => {
        try {
            const { error } = await supabase
                .from('menus')
                .update({ is_active: !menu.is_active })
                .eq('id', menu.id);

            if (error) throw error;
            fetchMenus();
        } catch (err) {
            addToast('Error al cambiar estado', 'error');
        }
    };

    const handleDeleteMenu = async (menu: Menu) => {
        if (menu.is_fallback) {
            addToast('No se puede eliminar el menú fallback', 'error');
            return;
        }
        if (!confirm(`¿Eliminar "${menu.name}"?`)) return;

        try {
            const { error } = await supabase.from('menus').delete().eq('id', menu.id);
            if (error) throw error;
            addToast('Menú eliminado', 'success');
            setSelectedMenu(null);
            fetchMenus();
        } catch (err) {
            addToast('Error al eliminar', 'error');
        }
    };

    const handleAddProduct = async (productId: string) => {
        if (!selectedMenu) return;
        try {
            const maxOrder = Math.max(0, ...menuProducts.map(p => p.sort_order)) + 1;
            const { error } = await supabase.from('menu_products').insert({
                menu_id: selectedMenu.id,
                product_id: productId,
                sort_order: maxOrder,
                is_visible: true
            });
            if (error) throw error;
            fetchMenuProducts(selectedMenu.id);
            fetchMenus();
        } catch (err) {
            addToast('Error al agregar producto', 'error');
        }
    };

    const handleRemoveProduct = async (menuProductId: string) => {
        try {
            const { error } = await supabase.from('menu_products').delete().eq('id', menuProductId);
            if (error) throw error;
            if (selectedMenu) fetchMenuProducts(selectedMenu.id);
            fetchMenus();
        } catch (err) {
            addToast('Error al eliminar producto', 'error');
        }
    };

    const handleUpdatePriceOverride = async (menuProductId: string, priceOverride: number | null) => {
        try {
            const { error } = await supabase
                .from('menu_products')
                .update({ price_override: priceOverride })
                .eq('id', menuProductId);
            if (error) throw error;
            if (selectedMenu) fetchMenuProducts(selectedMenu.id);
        } catch (err) {
            addToast('Error al actualizar precio', 'error');
        }
    };

    const handleAddRule = async (ruleType: string, ruleConfig: any) => {
        if (!selectedMenu) return;
        try {
            const { error } = await supabase.from('menu_rules').insert({
                menu_id: selectedMenu.id,
                rule_type: ruleType,
                rule_config: ruleConfig,
                is_active: true
            });
            if (error) throw error;
            fetchMenus();
            addToast('Regla agregada', 'success');
        } catch (err) {
            addToast('Error al agregar regla', 'error');
        }
    };

    const handleDeleteRule = async (ruleId: string) => {
        try {
            const { error } = await supabase.from('menu_rules').delete().eq('id', ruleId);
            if (error) throw error;
            fetchMenus();
        } catch (err) {
            addToast('Error al eliminar regla', 'error');
        }
    };

    // Check for warnings
    const hasFallback = menus.some(m => m.is_fallback);
    const conflictingMenus = menus.filter(m => m.is_active && !m.is_fallback && m.priority === selectedMenu?.priority && m.id !== selectedMenu?.id);

    const getRuleBadges = (rules?: MenuRule[]) => {
        if (!rules || rules.length === 0) return null;
        return rules.filter(r => r.is_active).map(rule => {
            switch (rule.rule_type) {
                case 'time_range':
                    return <span key={rule.id} className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[9px] rounded-full flex items-center gap-1"><Clock size={10} />{rule.rule_config.from}-{rule.rule_config.to}</span>;
                case 'weekdays':
                    return <span key={rule.id} className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[9px] rounded-full flex items-center gap-1"><Calendar size={10} />{rule.rule_config.days?.map((d: number) => WEEKDAY_LABELS[d]).join(', ')}</span>;
                case 'session_type':
                    return <span key={rule.id} className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[9px] rounded-full flex items-center gap-1"><MapPin size={10} />{rule.rule_config.values?.join(', ')}</span>;
                case 'tables':
                    return <span key={rule.id} className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-[9px] rounded-full flex items-center gap-1"><MapPin size={10} />{rule.rule_config.table_ids?.length} mesas</span>;
                case 'manual_override':
                    return rule.rule_config.enabled ? <span key={rule.id} className="px-2 py-0.5 bg-red-500/20 text-red-400 text-[9px] rounded-full">OVERRIDE</span> : null;
                default:
                    return null;
            }
        });
    };

    if (loading) {
        return <div className="flex items-center justify-center h-64"><span className="animate-spin text-neon">●</span></div>;
    }

    return (
        <div className="flex h-full bg-[#0A0B09]">
            {/* LEFT PANEL: Menu List */}
            <div className="w-80 border-r border-white/10 flex flex-col">
                <div className="p-4 border-b border-white/10">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-black text-white">Menús</h2>
                        <button
                            onClick={handleCreateMenu}
                            className="p-2 bg-neon/10 text-neon rounded-lg hover:bg-neon/20 transition-all"
                        >
                            <Plus size={18} />
                        </button>
                    </div>

                    {/* Warnings */}
                    {!hasFallback && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 mb-3">
                            <AlertTriangle size={16} className="text-red-500" />
                            <span className="text-[11px] text-red-400">Sin menú fallback configurado</span>
                        </div>
                    )}
                </div>

                {/* Menu List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {menus.map(menu => (
                        <button
                            key={menu.id}
                            onClick={() => handleSelectMenu(menu)}
                            className={`w-full p-3 rounded-xl text-left transition-all ${selectedMenu?.id === menu.id
                                ? 'bg-neon/10 border border-neon/30'
                                : 'bg-white/[0.02] border border-white/5 hover:bg-white/5'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-white text-sm truncate">{menu.name}</span>
                                <div className="flex items-center gap-1">
                                    {menu.is_fallback && (
                                        <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 text-[8px] font-bold rounded">DEFAULT</span>
                                    )}
                                    <span className={`w-2 h-2 rounded-full ${menu.is_active ? 'bg-green-500' : 'bg-white/20'}`} />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] text-white/40">{menu.product_count} productos</span>
                                <span className="text-[10px] text-white/40">P:{menu.priority}</span>
                                {getRuleBadges(menu.rules)}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* RIGHT PANEL: Menu Detail */}
            <div className="flex-1 flex flex-col">
                {selectedMenu ? (
                    <>
                        {/* Header */}
                        <div className="p-4 border-b border-white/10 flex items-center justify-between">
                            <div className="flex-1">
                                {isEditing ? (
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                        className="bg-black border border-white/20 rounded-lg px-3 py-2 text-white font-bold text-lg w-full max-w-xs"
                                        autoFocus
                                    />
                                ) : (
                                    <h2 className="text-xl font-black text-white">{selectedMenu.name}</h2>
                                )}
                                <p className="text-xs text-white/40 mt-1">
                                    {selectedMenu.is_fallback ? 'Menú fallback (siempre activo)' : `Prioridad: ${selectedMenu.priority}`}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                {isEditing ? (
                                    <>
                                        <button onClick={() => setIsEditing(false)} className="p-2 text-white/40 hover:text-white"><X size={18} /></button>
                                        <button onClick={handleSaveMenu} className="p-2 bg-neon/20 text-neon rounded-lg hover:bg-neon/30"><Save size={18} /></button>
                                    </>
                                ) : (
                                    <>
                                        <button onClick={() => setIsEditing(true)} className="p-2 text-white/40 hover:text-white"><Edit2 size={18} /></button>
                                        <button
                                            onClick={() => handleToggleActive(selectedMenu)}
                                            className={`p-2 rounded-lg ${selectedMenu.is_active ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/40'}`}
                                        >
                                            {selectedMenu.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                        </button>
                                        {!selectedMenu.is_fallback && (
                                            <button onClick={() => handleDeleteMenu(selectedMenu)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"><Trash2 size={18} /></button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Priority Editor (when editing) */}
                        {isEditing && (
                            <div className="px-4 py-3 border-b border-white/10 flex items-center gap-4">
                                <label className="text-xs text-white/40">Prioridad:</label>
                                <input
                                    type="number"
                                    value={editForm.priority}
                                    onChange={e => setEditForm(f => ({ ...f, priority: parseInt(e.target.value) || 100 }))}
                                    className="w-20 bg-black border border-white/20 rounded px-2 py-1 text-white text-sm"
                                />
                                <span className="text-[10px] text-white/30">(menor = mayor prioridad)</span>
                            </div>
                        )}

                        {/* Conflict Warning */}
                        {conflictingMenus.length > 0 && (
                            <div className="mx-4 mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-2">
                                <AlertTriangle size={16} className="text-yellow-500" />
                                <span className="text-[11px] text-yellow-400">
                                    Conflicto: {conflictingMenus.map(m => m.name).join(', ')} tienen la misma prioridad
                                </span>
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="px-4 pt-4 flex gap-2">
                            <button
                                onClick={() => setActiveTab('products')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'products' ? 'bg-neon/20 text-neon' : 'bg-white/5 text-white/40'}`}
                            >
                                Productos ({menuProducts.length})
                            </button>
                            <button
                                onClick={() => setActiveTab('rules')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'rules' ? 'bg-neon/20 text-neon' : 'bg-white/5 text-white/40'}`}
                            >
                                Reglas ({selectedMenu.rules?.filter(r => r.is_active).length || 0})
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-y-auto p-4">
                            {activeTab === 'products' && (
                                <div className="space-y-4">
                                    {/* Add Product */}
                                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl">
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 block">Agregar Producto</label>
                                        <select
                                            onChange={e => { if (e.target.value) handleAddProduct(e.target.value); e.target.value = ''; }}
                                            className="w-full bg-black border border-white/20 rounded-lg px-3 py-2 text-white text-sm"
                                        >
                                            <option value="">Seleccionar producto...</option>
                                            {allProducts
                                                .filter(p => !menuProducts.find(mp => mp.product_id === p.id))
                                                .map(p => (
                                                    <option key={p.id} value={p.id}>{p.name} - ${p.base_price}</option>
                                                ))}
                                        </select>
                                    </div>

                                    {/* Product List */}
                                    <div className="space-y-2">
                                        {menuProducts.map((mp, idx) => (
                                            <div key={mp.id} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/10 rounded-xl group">
                                                <GripVertical size={16} className="text-white/20 cursor-grab" />
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-white">{mp.product?.name}</p>
                                                    <p className="text-[10px] text-white/40">{mp.product?.category}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-white/40">Base: ${mp.product?.base_price}</span>
                                                    <input
                                                        type="number"
                                                        placeholder="Override"
                                                        value={mp.price_override ?? ''}
                                                        onChange={e => handleUpdatePriceOverride(mp.id, e.target.value ? parseFloat(e.target.value) : null)}
                                                        className="w-24 bg-black border border-white/20 rounded px-2 py-1 text-white text-xs"
                                                    />
                                                    <button
                                                        onClick={() => handleRemoveProduct(mp.id)}
                                                        className="p-1 text-red-500/50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        {menuProducts.length === 0 && (
                                            <div className="p-8 text-center text-white/30 text-sm">
                                                Sin productos en este menú
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'rules' && (
                                <div className="space-y-4">
                                    {/* Add Rule Buttons */}
                                    <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl space-y-3">
                                        <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest block">Agregar Regla</label>
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={() => handleAddRule('time_range', { from: '18:00', to: '23:59' })}
                                                className="px-3 py-2 bg-purple-500/10 text-purple-400 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-purple-500/20"
                                            >
                                                <Clock size={14} /> Horario
                                            </button>
                                            <button
                                                onClick={() => handleAddRule('weekdays', { days: [5, 6] })}
                                                className="px-3 py-2 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-blue-500/20"
                                            >
                                                <Calendar size={14} /> Días
                                            </button>
                                            <button
                                                onClick={() => handleAddRule('session_type', { values: ['table'] })}
                                                className="px-3 py-2 bg-green-500/10 text-green-400 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-green-500/20"
                                            >
                                                <MapPin size={14} /> Tipo Sesión
                                            </button>
                                            <button
                                                onClick={() => handleAddRule('manual_override', { enabled: true })}
                                                className="px-3 py-2 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-red-500/20"
                                            >
                                                <Star size={14} /> Override Manual
                                            </button>
                                        </div>
                                    </div>

                                    {/* Active Rules */}
                                    <div className="space-y-2">
                                        {selectedMenu.rules?.map(rule => (
                                            <div key={rule.id} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/10 rounded-xl">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2">
                                                        {getRuleBadges([rule])}
                                                        <span className="text-xs text-white/60 capitalize">{rule.rule_type.replace('_', ' ')}</span>
                                                    </div>
                                                    <p className="text-[10px] text-white/30 mt-1 font-mono">
                                                        {JSON.stringify(rule.rule_config)}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleDeleteRule(rule.id)}
                                                    className="p-1 text-red-500/50 hover:text-red-500"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                        {(!selectedMenu.rules || selectedMenu.rules.length === 0) && (
                                            <div className="p-8 text-center text-white/30 text-sm">
                                                Sin reglas de activación (siempre por prioridad)
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-white/30">
                        Seleccioná un menú para editarlo
                    </div>
                )}
            </div>
        </div>
    );
};

export default MenuManagement;
