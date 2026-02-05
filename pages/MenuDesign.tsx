import React, { useState, useMemo, useRef, useEffect } from 'react';
import { InventoryItem, ProductVariant, ProductAddon, UnitType, RecipeComponent, Store, MenuTheme } from '../types';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PaymentCapabilityBadge } from '../components/PaymentCapabilityBadge';
import { MenuRenderer } from '../components/MenuRenderer';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastSystem';
import {
    Save,
    Image,
    Grid,
    List,
    Plus,
    Search,
    ChevronRight,
    Monitor,
    Truck,
    Package,
    Coffee,
    Store as StoreIcon,
    X,
    Trash2,
    Check,
    Clock,
    Calendar,
    MapPin,
    Star,
    AlertTriangle,
    Edit2,
    ToggleLeft,
    ToggleRight,
    GripVertical
} from 'lucide-react';



// ==========================================
// INLINE MENU MANAGEMENT PANEL
// ==========================================
interface Menu {
    id: string;
    store_id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    priority: number;
    is_fallback: boolean;
    product_count?: number;
    rules?: MenuRule[];
}

interface MenuRule {
    id: string;
    menu_id: string;
    rule_type: string;
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
    product?: { name: string; base_price: number; category: string };
}

interface VenueNode {
    id: string;
    label: string;
    node_type: string;
}

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const MenusPanel: React.FC<{ storeId: string | undefined }> = ({ storeId: propStoreId }) => {
    const { addToast } = useToast();
    const { profile } = useAuth();
    const storeId = propStoreId || profile?.store_id;
    const [menus, setMenus] = useState<Menu[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
    const [menuProducts, setMenuProducts] = useState<MenuProduct[]>([]);
    const [allProducts, setAllProducts] = useState<any[]>([]); // Using any for large mixed results for now
    const [venueNodes, setVenueNodes] = useState<VenueNode[]>([]);
    const [showNodeSelector, setShowNodeSelector] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', description: '', priority: 100 });
    const [activeSubTab, setActiveSubTab] = useState<'products' | 'rules'>('products');
    const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
    const [productSearch, setProductSearch] = useState('');



    useEffect(() => {
        if (storeId) { fetchMenus(); fetchAllProducts(); fetchVenueNodes(); }
    }, [storeId]);

    const fetchMenus = async () => {
        setLoading(true);
        const { data } = await supabase.from('menus').select('*, menu_rules(*)').eq('store_id', storeId).order('priority');
        const menusWithCounts = await Promise.all((data || []).map(async (m: any) => {
            const { count } = await supabase.from('menu_products').select('*', { count: 'exact', head: true }).eq('menu_id', m.id);
            return { ...m, product_count: count || 0, rules: m.menu_rules };
        }));
        setMenus(menusWithCounts);
        setLoading(false);
    };

    const fetchAllProducts = async () => {
        // 1. Fetch Products
        const productsReq = await supabase
            .from('products')
            .select('*, image') // Ensure image column is selected
            .eq('store_id', storeId)
            .eq('active', true)
            .order('name');

        // 2. Fetch Inventory Items (All active, for enrichment)
        const inventoryReq = await supabase
            .from('inventory_items')
            .select('*')
            .eq('store_id', storeId)
            .eq('is_active', true); // Removed is_menu_visible filter to ensure we get images

        const rawProducts = productsReq.data || [];
        const rawInventory = inventoryReq.data || [];

        // 3. Merge Logic (Same as useProducts.ts)
        const inventoryMap = new Map<string, any>();
        rawInventory.forEach((item: any) => {
            inventoryMap.set(item.name.trim().toLowerCase(), item);
        });

        // Enrich Products with images from Inventory if missing
        const enrichedProducts = rawProducts.map((p: any) => {
            // Normalize image field
            if (!p.image_url && p.image) {
                p.image_url = p.image;
            }

            if (!p.image_url || p.image_url === '') {
                const invItem = inventoryMap.get(p.name.trim().toLowerCase());
                if (invItem && invItem.image_url) {
                    return { ...p, image_url: invItem.image_url };
                }
            }
            return p;
        });

        // Add "Sellable Inventory Items" that are NOT in products table yet
        // (This happens if user created item in Inventory but didn't convert to Product)
        // In MenuDesign, we usually only show 'products' table items because Menu is built on Products.
        // BUT if we want to be consistent with Client Menu, we should allow adding pure inventory items too?
        // Current system seems to favor Products for Menus.
        // However, the client menu DOES show inventory items.
        // If I want to add them to a menu, I need to treat them as potential targets.
        // But `menu_products` links to `products` table (foreign key).
        // Check `menu_products` definition: product_id REFERENCES products(id).
        // SO: We CANNOT add pure inventory items to a menu unless they are in the products table.
        //
        // CONCLUSION: For MenuDesign, we only show enriched Products.
        // Pure inventory items must be "Converted" to products first to be added here.
        // (Unlike Client Menu which has a fallback to show raw inventory items if no menu is active or "All Items" mode).
        // Since this is "Menu Management", we restrict to Products.

        setAllProducts(enrichedProducts);
    };

    const fetchVenueNodes = async () => {
        // Use VIEW active_venue_states to align with VenueSystem and avoid RLS issues on raw table
        const { data } = await supabase.from('active_venue_states').select('node_id, label, type').eq('store_id', storeId).order('label');

        if (data) {
            setVenueNodes((data as any[]).map((d) => ({
                id: d.node_id,
                label: d.label,
                node_type: d.type
            })));
        } else {
            setVenueNodes([]);
        }
    };

    const fetchMenuProducts = async (menuId: string) => {
        const { data } = await supabase.from('menu_products').select('*, product:products(name, base_price, category)').eq('menu_id', menuId).order('sort_order');
        setMenuProducts(data || []);
    };

    const handleSelectMenu = async (menu: Menu) => {
        setSelectedMenu(menu);
        setEditForm({ name: menu.name, description: menu.description || '', priority: menu.priority });
        await fetchMenuProducts(menu.id);
    };

    const handleCreateMenu = async () => {
        const { data } = await supabase.from('menus').insert({ store_id: storeId, name: 'Nuevo Menú', priority: 100, is_active: false, is_fallback: false }).select().single();
        if (data) { fetchMenus(); setSelectedMenu(data); }
    };

    const handleSaveMenu = async () => {
        if (!selectedMenu) return;
        await supabase.from('menus').update({ name: editForm.name, description: editForm.description || null, priority: editForm.priority }).eq('id', selectedMenu.id);
        setIsEditing(false);
        fetchMenus();
    };

    const handleToggleActive = async (menu: Menu) => {
        await supabase.from('menus').update({ is_active: !menu.is_active }).eq('id', menu.id);
        fetchMenus();
    };

    const handleDeleteMenu = async (menu: Menu) => {
        if (menu.is_fallback) { addToast('No se puede eliminar el menú fallback', 'error'); return; }
        await supabase.from('menus').delete().eq('id', menu.id);
        setSelectedMenu(null);
        fetchMenus();
    };

    const handleAddProduct = async (productId: string) => {
        if (!selectedMenu) return;
        const maxOrder = Math.max(0, ...menuProducts.map(p => p.sort_order)) + 1;
        await supabase.from('menu_products').insert({ menu_id: selectedMenu.id, product_id: productId, sort_order: maxOrder, is_visible: true });
        fetchMenuProducts(selectedMenu.id);
        fetchMenus();
    };

    const handleRemoveProduct = async (mpId: string) => {
        await supabase.from('menu_products').delete().eq('id', mpId);
        if (selectedMenu) fetchMenuProducts(selectedMenu.id);
        fetchMenus();
    };

    const handleUpdatePriceOverride = async (mpId: string, price: number | null) => {
        await supabase.from('menu_products').update({ price_override: price }).eq('id', mpId);
        if (selectedMenu) fetchMenuProducts(selectedMenu.id);
    };

    const handleAddRule = async (ruleType: string, ruleConfig: any) => {
        if (!selectedMenu) return;
        await supabase.from('menu_rules').insert({ menu_id: selectedMenu.id, rule_type: ruleType, rule_config: ruleConfig, is_active: true });
        fetchMenus();
    };

    const handleDeleteRule = async (ruleId: string) => {
        await supabase.from('menu_rules').delete().eq('id', ruleId);
        fetchMenus();
    };

    const hasFallback = menus.some(m => m.is_fallback);

    // Human-readable rule description
    const getRuleDescription = (rule: MenuRule): string => {
        const config = rule.rule_config || {};
        switch (rule.rule_type) {
            case 'time_range':
                return `${config.from || '00:00'} - ${config.to || '23:59'}`;
            case 'weekdays':
                if (config.days && Array.isArray(config.days)) {
                    return config.days.map((d: number) => WEEKDAY_LABELS[d] || d).join(', ');
                }
                return 'Días no configurados';
            case 'session_type':
                const types: Record<string, string> = { table: 'Mesa', takeaway: 'Para llevar', delivery: 'Delivery' };
                return (config.values || []).map((v: string) => types[v] || v).join(', ');
            case 'tables':
                const count = (config.table_ids || []).length;
                return `${count} ubicación${count !== 1 ? 'es' : ''} asignada${count !== 1 ? 's' : ''}`;
            case 'manual_override':
                return 'Activo manualmente';
            default:
                return JSON.stringify(config);
        }
    };

    const getRuleBadge = (rule: MenuRule) => {
        const icons: Record<string, React.ReactNode> = {
            time_range: <Clock size={10} />,
            weekdays: <Calendar size={10} />,
            session_type: <MapPin size={10} />,
            tables: <StoreIcon size={10} />,
            manual_override: <Star size={10} />
        };
        const colors: Record<string, string> = {
            time_range: 'bg-purple-500/20 text-purple-400',
            weekdays: 'bg-blue-500/20 text-blue-400',
            session_type: 'bg-green-500/20 text-green-400',
            tables: 'bg-orange-500/20 text-orange-400',
            manual_override: 'bg-red-500/20 text-red-400'
        };
        const labels: Record<string, string> = {
            time_range: 'Horario',
            weekdays: 'Días',
            session_type: 'Tipo',
            tables: 'Ubicaciones',
            manual_override: 'Override'
        };
        return (
            <span key={rule.id} className={`px-2.5 py-1 ${colors[rule.rule_type] || 'bg-white/10 text-white/40'} text-[10px] rounded-lg flex items-center gap-1.5`}>
                {icons[rule.rule_type]}{labels[rule.rule_type] || rule.rule_type}
            </span>
        );
    };

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <div className="relative">
                <div className="w-12 h-12 border-4 border-[#4ADE80]/20 rounded-full animate-spin border-t-[#4ADE80]" />
                <div className="absolute inset-0 w-12 h-12 border-4 border-transparent rounded-full animate-ping border-t-[#4ADE80]/30" />
            </div>
        </div>
    );

    return (
        <div className="flex flex-col md:flex-row h-full animate-in fade-in duration-500">
            {/* LEFT: Menu List */}
            <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/10 flex flex-col bg-gradient-to-b from-[#0D0F0D] to-[#141714] max-h-[40vh] md:max-h-none">\
                {/* Header */}
                <div className="p-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-[#4ADE80]/5 to-transparent">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#4ADE80]/20 rounded-xl flex items-center justify-center">
                            <Package size={16} className="text-[#4ADE80]" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white">Menús</h3>
                            <p className="text-[9px] text-white/40">{menus.length} configurados</p>
                        </div>
                    </div>
                    <button
                        onClick={handleCreateMenu}
                        className="p-2 bg-[#4ADE80]/10 text-[#4ADE80] rounded-xl hover:bg-[#4ADE80]/20 hover:scale-110 transition-all duration-300 shadow-lg shadow-[#4ADE80]/10"
                    >
                        <Plus size={16} />
                    </button>
                </div>

                {/* Warning: No Fallback */}
                {!hasFallback && (
                    <div className="p-3 bg-gradient-to-r from-red-500/20 to-red-500/5 border-b border-red-500/20 flex items-center gap-2 animate-pulse">
                        <AlertTriangle size={14} className="text-red-400" />
                        <span className="text-[10px] text-red-400 font-medium">Falta menú fallback</span>
                    </div>
                )}

                {/* Menu List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {menus.map((menu, idx) => {
                        // Check if currently active (Time/Day)
                        const now = new Date();
                        const currentDay = now.getDay(); // 0-6
                        const currentTime = now.getHours() * 60 + now.getMinutes(); // minutes from midnight

                        const timeRule = menu.rules?.find(r => r.rule_type === 'time_range');
                        const dayRule = menu.rules?.find(r => r.rule_type === 'weekdays');

                        let isTimeMatching = true;
                        if (timeRule?.rule_config?.from && timeRule?.rule_config?.to) {
                            const [fh, fm] = timeRule.rule_config.from.split(':').map(Number);
                            const [th, tm] = timeRule.rule_config.to.split(':').map(Number);
                            const fromMinutes = fh * 60 + fm;
                            const toMinutes = th * 60 + tm;
                            isTimeMatching = currentTime >= fromMinutes && currentTime <= toMinutes;
                        }

                        let isDayMatching = true;
                        if (dayRule?.rule_config?.days && Array.isArray(dayRule.rule_config.days)) {
                            isDayMatching = dayRule.rule_config.days.includes(currentDay);
                        }

                        const isLive = menu.is_active && isTimeMatching && isDayMatching;

                        return (
                            <button
                                key={menu.id}
                                onClick={() => handleSelectMenu(menu)}
                                className={`
                                w-full p-4 rounded-2xl text-left transition-all duration-300 group relative overflow-hidden
                                ${selectedMenu?.id === menu.id
                                        ? 'bg-gradient-to-r from-[#4ADE80]/15 to-[#4ADE80]/5 border-2 border-[#4ADE80] shadow-lg shadow-[#4ADE80]/20 scale-[1.02]'
                                        : isLive
                                            ? 'bg-green-500/5 border border-green-500/30 hover:bg-green-500/10'
                                            : menu.is_fallback
                                                ? 'bg-yellow-500/5 border border-yellow-500/30 hover:bg-yellow-500/10'
                                                : 'bg-white/[0.02] border border-white/5 hover:bg-white/5 hover:border-white/10 hover:scale-[1.01]'}
                            `}
                                style={{ animationDelay: `${idx * 50}ms` }}
                            >
                                {isLive && (
                                    <div className="absolute top-0 right-0 p-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-bold text-white text-sm truncate group-hover:text-[#4ADE80] transition-colors">{menu.name}</span>
                                    <div className="flex items-center gap-2">
                                        {menu.is_fallback && (
                                            <span className="px-2 py-0.5 bg-gradient-to-r from-yellow-500/30 to-yellow-500/10 text-yellow-400 text-[8px] font-black rounded-full uppercase tracking-wide">
                                                Default
                                            </span>
                                        )}
                                        <span className={`w-3 h-3 rounded-full transition-all duration-300 ${menu.is_active ? 'bg-green-500 shadow-lg shadow-green-500/50' : 'bg-white/20'}`} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] text-white/50 bg-white/5 px-2 py-0.5 rounded-full">{menu.product_count} productos</span>

                                    {/* Rule Icons */}
                                    {menu.rules?.some(r => r.rule_type === 'tables' && r.is_active) && (
                                        <span className="p-1 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20" title="Ubicaciones específicas"><MapPin size={10} /></span>
                                    )}
                                    {menu.rules?.some(r => r.rule_type === 'weekdays' && r.is_active) && (
                                        <span className="p-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20" title="Días específicos"><Calendar size={10} /></span>
                                    )}
                                    {menu.rules?.some(r => r.rule_type === 'time_range' && r.is_active) && (
                                        <span className="p-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20" title="Horario específico"><Clock size={10} /></span>
                                    )}

                                    {/* Remove detailed badges to simplify sidebar view as requested, keep priority */}
                                    <span className="text-[10px] text-white/50 bg-white/5 px-2 py-0.5 rounded-full">P:{menu.priority}</span>
                                    {isLive && <span className="text-[9px] text-green-400 font-bold ml-1 animate-pulse">EN VIVO</span>}
                                </div>
                            </button>
                        );
                    })}

                    {menus.length === 0 && (
                        <div className="text-center py-12">
                            <Package size={32} className="mx-auto text-white/10 mb-3" />
                            <p className="text-white/30 text-xs">Sin menús</p>
                            <button onClick={handleCreateMenu} className="mt-3 text-[#4ADE80] text-[10px] hover:underline">+ Crear primero</button>
                        </div>
                    )}
                </div>
            </div>

            {/* RIGHT: Detail */}
            <div className="flex-1 flex flex-col bg-[#0A0B09]">
                {selectedMenu ? (
                    <div className="animate-in fade-in slide-in-from-right-2 duration-500 flex flex-col h-full">
                        {/* Header */}
                        <div className="p-3 md:p-6 border-b border-white/10 bg-gradient-to-r from-white/[0.02] to-transparent">\
                            <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-3">\
                                <div className="flex-1">
                                    {isEditing ? (
                                        <input
                                            value={editForm.name}
                                            onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                            className="bg-black/50 border border-[#4ADE80]/30 rounded-xl px-4 py-2 text-white font-black text-lg w-64 focus:outline-none focus:ring-2 focus:ring-[#4ADE80]/50"
                                            autoFocus
                                        />
                                    ) : (
                                        <h2 className="text-2xl font-black text-white mb-1 flex items-center gap-2">
                                            {selectedMenu.name}
                                            {selectedMenu.is_active && <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />}
                                        </h2>
                                    )}
                                    <p className="text-[11px] text-white/40 flex items-center gap-2">
                                        {selectedMenu.is_fallback ? (
                                            <span className="text-yellow-400">⭐ Menú fallback (siempre activo)</span>
                                        ) : (
                                            <><span>Prioridad: {selectedMenu.priority}</span> • <span>{menuProducts.length} productos</span></>
                                        )}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {isEditing ? (
                                        <>
                                            <button onClick={() => setIsEditing(false)} className="p-2.5 text-white/40 hover:text-white rounded-xl hover:bg-white/5 transition-all"><X size={18} /></button>
                                            <button onClick={handleSaveMenu} className="p-2.5 bg-[#4ADE80]/20 text-[#4ADE80] rounded-xl hover:bg-[#4ADE80]/30 transition-all"><Save size={18} /></button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => setIsEditing(true)} className="p-2.5 text-white/40 hover:text-white rounded-xl hover:bg-white/5 transition-all"><Edit2 size={18} /></button>
                                            <button
                                                onClick={() => handleToggleActive(selectedMenu)}
                                                className={`p-2.5 rounded-xl transition-all duration-300 ${selectedMenu.is_active ? 'bg-green-500/20 text-green-400 shadow-lg shadow-green-500/20' : 'bg-white/5 text-white/40'}`}
                                            >
                                                {selectedMenu.is_active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                            </button>
                                            {!selectedMenu.is_fallback && (
                                                <button onClick={() => handleDeleteMenu(selectedMenu)} className="p-2.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"><Trash2 size={18} /></button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="px-3 md:px-6 py-4 flex gap-2 border-b border-white/5 overflow-x-auto">\
                            <button
                                onClick={() => setActiveSubTab('products')}
                                className={`px-5 py-2.5 rounded-xl text-[11px] font-bold transition-all duration-300 ${activeSubTab === 'products'
                                    ? 'bg-gradient-to-r from-[#4ADE80]/20 to-[#4ADE80]/10 text-[#4ADE80] shadow-lg shadow-[#4ADE80]/10'
                                    : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                <span className="flex items-center gap-2">
                                    <Coffee size={14} />
                                    Productos ({menuProducts.length})
                                </span>
                            </button>
                            <button
                                onClick={() => setActiveSubTab('rules')}
                                className={`px-5 py-2.5 rounded-xl text-[11px] font-bold transition-all duration-300 ${activeSubTab === 'rules'
                                    ? 'bg-gradient-to-r from-[#4ADE80]/20 to-[#4ADE80]/10 text-[#4ADE80] shadow-lg shadow-[#4ADE80]/10'
                                    : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                <span className="flex items-center gap-2">
                                    <Clock size={14} />
                                    Reglas ({selectedMenu.rules?.filter(r => r.is_active).length || 0})
                                </span>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-3 md:p-6">\
                            {activeSubTab === 'products' && (
                                <div className="flex flex-col h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    {/* 1. Search Bar */}
                                    <div className="p-4 border-b border-white/5 bg-white/[0.02]">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                                            <input
                                                type="text"
                                                placeholder="Buscar productos..."
                                                value={productSearch}
                                                onChange={e => setProductSearch(e.target.value)}
                                                className="w-full bg-black/50 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#4ADE80]/50 transition-all placeholder:text-white/20"
                                            />
                                        </div>
                                    </div>

                                    {/* 2. Bulk List */}
                                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                                        {allProducts
                                            .filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
                                            .map(product => {
                                                const menuProduct = menuProducts.find(mp => mp.product_id === product.id);
                                                const isSelected = !!menuProduct;

                                                return (
                                                    <div
                                                        key={product.id}
                                                        className={`
                                                            flex items-center gap-3 p-2 rounded-xl border transition-all duration-200
                                                            ${isSelected
                                                                ? 'bg-[#4ADE80]/10 border-[#4ADE80]/30'
                                                                : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'}
                                                        `}
                                                    >
                                                        {/* Toggle Checkbox */}
                                                        <button
                                                            onClick={() => isSelected ? handleRemoveProduct(menuProduct!.id) : handleAddProduct(product.id)}
                                                            className={`
                                                                w-10 h-10 rounded-xl flex items-center justify-center transition-all shrink-0
                                                                ${isSelected
                                                                    ? 'bg-[#4ADE80] text-black shadow-[0_0_10px_rgba(74,222,128,0.3)]'
                                                                    : 'bg-white/5 text-white/20 hover:bg-white/10'}
                                                            `}
                                                        >
                                                            {isSelected ? <Check size={18} strokeWidth={3} /> : <Plus size={18} />}
                                                        </button>

                                                        {/* Product Info */}
                                                        <div className="flex-1 min-w-0">
                                                            <p className={`text-sm font-bold truncate ${isSelected ? 'text-white' : 'text-white/60'}`}>
                                                                {product.name}
                                                            </p>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                                                    {product.category}
                                                                </span>
                                                                <span className="text-[10px] text-white/40 font-mono">
                                                                    ${product.base_price}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Inline Price Override (Only if selected) */}
                                                        {isSelected && (
                                                            <div className="flex flex-col items-end gap-1 animate-in slide-in-from-right-2 duration-200">
                                                                <span className="text-[9px] text-[#4ADE80] uppercase font-bold tracking-wider">Precio Menu</span>
                                                                <input
                                                                    type="number"
                                                                    placeholder="Original"
                                                                    value={menuProduct.price_override ?? ''}
                                                                    onBlur={e => handleUpdatePriceOverride(menuProduct.id, e.target.value ? parseFloat(e.target.value) : null)}
                                                                    onChange={e => {
                                                                        // Optimistic typing? Or just allow typing and save on blur
                                                                        // Since we rely on 'menuProduct' from props which comes from DB, 
                                                                        // typing might be janky if we don't have local state.
                                                                        // But 'menuProduct.price_override' is from 'menuProducts' state.
                                                                        // We need to update that state locally for smooth typing.
                                                                        // Ideally, handleUpdatePriceOverride should be debounced or just set local state.

                                                                        // For now, let's use a "save on enter/blur" approach better, 
                                                                        // OR assume handleUpdatePriceOverride updates local state fast enough? 
                                                                        // No, it awaits DB.

                                                                        // FIX: The value is bound to `menuProduct.price_override`. 
                                                                        // If we want smooth typing, we need to bypass the parent state or update it locally without fetch.
                                                                        // Given the component structure, let's just trigger update on Blur to avoid re-renders while typing.
                                                                        // So usage: type value, it's uncontrolled while typing? No, value is bound.
                                                                        // If I type, onChange fires, if I don't update state, input won't change.
                                                                        // I must update state.

                                                                        // Workaround: We'll update the local 'menuProducts' state immediately, then debounce save.
                                                                        // But 'handleUpdatePriceOverride' does fetch.
                                                                        // Let's rely on standard html valid: Use 'defaultValue' and update on Blur.
                                                                    }}
                                                                    className="w-20 bg-[#0A0B09] border border-[#4ADE80]/30 rounded-lg px-2 py-1 text-right text-xs text-[#4ADE80] font-bold focus:outline-none focus:ring-1 focus:ring-[#4ADE80]"
                                                                    // Key hack to allow typing without controlling every keystroke via DB
                                                                    defaultValue={menuProduct.price_override ?? ''}
                                                                    key={menuProduct.price_override}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}

                                        {allProducts.length === 0 && (
                                            <div className="text-center py-12 text-white/30">
                                                <p>No hay productos en el sistema.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeSubTab === 'rules' && (
                                selectedMenu.is_fallback ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in-95 duration-500">
                                        <div className="w-20 h-20 rounded-full bg-yellow-500/5 border border-yellow-500/20 flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(234,179,8,0.1)]">
                                            <Star size={32} className="text-yellow-400 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
                                        </div>
                                        <h3 className="text-xl font-black text-white mb-3">Menú por Defecto</h3>
                                        <div className="max-w-xs space-y-4">
                                            <p className="text-sm text-white/60 leading-relaxed">
                                                Este menú está activo <strong>globalmente</strong> siempre que no haya otra regla específica (Ubicación, Día u Hora) que aplique.
                                            </p>
                                            <div className="p-3 bg-white/5 rounded-lg border border-white/5 text-xs text-white/40 italic">
                                                "Es el menú de respaldo que nunca falla"
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300 p-2">

                                        {/* 1. DÍAS ACTIVO */}
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Calendar size={16} className="text-blue-400" />
                                                <h3 className="text-sm font-bold text-white">Días Activo</h3>
                                            </div>
                                            <div className="flex gap-2">
                                                {WEEKDAY_LABELS.map((day, idx) => {
                                                    // Check if day is active
                                                    const weekdayRule = selectedMenu.rules?.find(r => r.rule_type === 'weekdays');
                                                    const activeDays = weekdayRule?.rule_config?.days || [];
                                                    // If no rule exists, it implies ALL days (or none? usually none means always active if no restrictions, but here we want explicit control).
                                                    // actually, existing logic: no rule = always.
                                                    // UX decision: Show as "All active" if no rule, or force user to select?
                                                    // Let's assume if no rule exists, it's ON for everyone.
                                                    // BUT for editing, we want to toggle.
                                                    // If no rule exists, we treat it as "All Selected" visually? 
                                                    // Better: If no rule, creating one means restricting. 
                                                    // Let's make it so clicking toggles the restriction.

                                                    const isSelected = !weekdayRule || activeDays.includes(idx);

                                                    return (
                                                        <button
                                                            key={idx}
                                                            onClick={async () => {
                                                                let newDays = [...activeDays];
                                                                if (!weekdayRule) {
                                                                    // Converting from "No Rule" (All) to "Specific Days"
                                                                    // If I click one, does it mean I only want that one? or I'm removing it?
                                                                    // Standard UX: If "All" are implicitly active, clicking one usually toggles it OFF?
                                                                    // Let's stick to explicit: If no rule, create one with ALL days except the clicked one (if unselecting) or just logic is tricky.
                                                                    // EASIER: Create rule with all days first if not exists.
                                                                    newDays = [0, 1, 2, 3, 4, 5, 6].filter(d => d !== idx);
                                                                    await handleAddRule('weekdays', { days: newDays });
                                                                } else {
                                                                    if (isSelected) {
                                                                        newDays = newDays.filter(d => d !== idx);
                                                                    } else {
                                                                        newDays.push(idx);
                                                                    }

                                                                    if (newDays.length === 7) {
                                                                        // If all selected, delete rule to cleanup?
                                                                        await handleDeleteRule(weekdayRule.id);
                                                                    } else {
                                                                        // Update rule
                                                                        await supabase.from('menu_rules').update({ rule_config: { days: newDays } }).eq('id', weekdayRule.id);
                                                                        fetchMenus();
                                                                    }
                                                                }
                                                            }}
                                                            className={`
                                                            flex-1 py-3 rounded-xl text-xs font-black uppercase transition-all
                                                            ${isSelected
                                                                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
                                                                    : 'bg-white/5 text-white/20 hover:bg-white/10'}
                                                        `}
                                                        >
                                                            {day}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[10px] text-white/30 px-1">
                                                {selectedMenu.rules?.find(r => r.rule_type === 'weekdays')
                                                    ? 'Menú activo solo en los días seleccionados.'
                                                    : 'Menú activo todos los días.'}
                                            </p>
                                        </div>

                                        <div className="h-px bg-white/5" />

                                        {/* 2. HORARIO */}
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Clock size={16} className="text-purple-400" />
                                                <h3 className="text-sm font-bold text-white">Horario Disponibilidad</h3>
                                            </div>

                                            {(() => {
                                                const timeRule = selectedMenu.rules?.find(r => r.rule_type === 'time_range');
                                                const from = timeRule?.rule_config?.from || '';
                                                const to = timeRule?.rule_config?.to || '';

                                                // Helper to saving time
                                                const saveTime = async (newFrom: string, newTo: string) => {
                                                    if (!newFrom && !newTo) {
                                                        if (timeRule) await handleDeleteRule(timeRule.id);
                                                        return;
                                                    }
                                                    const config = { from: newFrom || '00:00', to: newTo || '23:59' };
                                                    if (timeRule) {
                                                        await supabase.from('menu_rules').update({ rule_config: config }).eq('id', timeRule.id);
                                                        fetchMenus();
                                                    } else {
                                                        await handleAddRule('time_range', config);
                                                    }
                                                };

                                                return (
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex-1 bg-white/5 rounded-xl border border-white/10 p-2 flex items-center gap-2">
                                                            <span className="text-[10px] text-white/40 uppercase font-bold pl-2">Desde</span>
                                                            <input
                                                                type="time"
                                                                value={from}
                                                                onChange={e => saveTime(e.target.value, to)}
                                                                className="bg-transparent text-white font-mono text-sm focus:outline-none w-full text-right"
                                                            />
                                                        </div>
                                                        <span className="text-white/20">-</span>
                                                        <div className="flex-1 bg-white/5 rounded-xl border border-white/10 p-2 flex items-center gap-2">
                                                            <span className="text-[10px] text-white/40 uppercase font-bold pl-2">Hasta</span>
                                                            <input
                                                                type="time"
                                                                value={to}
                                                                onChange={e => saveTime(from, e.target.value)}
                                                                className="bg-transparent text-white font-mono text-sm focus:outline-none w-full text-right"
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                            <p className="text-[10px] text-white/30 px-1">
                                                Si dejás los horarios vacíos, el menú estará activo todo el día.
                                            </p>
                                        </div>

                                        <div className="h-px bg-white/5" />

                                        {/* 3. UBICACIÓN */}
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <StoreIcon size={16} className="text-orange-400" />
                                                <h3 className="text-sm font-bold text-white">Ubicaciones</h3>
                                            </div>

                                            {(() => {
                                                const locRule = selectedMenu.rules?.find(r => r.rule_type === 'tables');
                                                const activeIds = locRule?.rule_config?.table_ids || [];
                                                const isAllLocations = !locRule;
                                                const selectedNodes = venueNodes.filter(n => activeIds.includes(n.id));

                                                return (
                                                    <div className="space-y-3">\
                                                        <div className="flex p-1 bg-white/5 rounded-xl border border-white/5">
                                                            <button
                                                                onClick={async () => {
                                                                    if (locRule) await handleDeleteRule(locRule.id);
                                                                }}
                                                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${isAllLocations ? 'bg-orange-500 text-black shadow' : 'text-white/40 hover:text-white'}`}
                                                            >
                                                                Todo el Local
                                                            </button>
                                                            <button
                                                                onClick={() => setShowNodeSelector(true)}
                                                                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${!isAllLocations ? 'bg-orange-500 text-black shadow' : 'text-white/40 hover:text-white'}`}
                                                            >
                                                                Zonas Específicas {activeIds.length > 0 && `(${activeIds.length})`}
                                                            </button>
                                                        </div>

                                                        {/* Visual Summary */}
                                                        {!isAllLocations && selectedNodes.length > 0 && (
                                                            <div className="p-3 bg-orange-500/5 border border-orange-500/20 rounded-xl animate-in slide-in-from-top-2 duration-200">
                                                                <p className="text-[9px] text-orange-400 uppercase font-bold mb-2">Mesas/Barras Habilitadas:</p>
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {selectedNodes.map(node => (
                                                                        <span key={node.id} className="px-2 py-1 bg-orange-500/10 text-orange-300 text-[10px] rounded-lg font-medium border border-orange-500/30">
                                                                            {node.label}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                                <button onClick={() => setShowNodeSelector(true)} className="mt-2 text-[9px] text-orange-400 hover:text-orange-300 underline">
                                                                    Editar selección
                                                                </button>
                                                            </div>
                                                        )}

                                                        {/* Explanation */}
                                                        <p className="text-[10px] text-white/30 px-1">
                                                            {isAllLocations
                                                                ? '✅ Este menú se mostrará en todas las ubicaciones.'
                                                                : selectedNodes.length > 0
                                                                    ? `📍 Solo en ${selectedNodes.length} ubicación(es) seleccionada(s).`
                                                                    : '⚠️ Hacé clic en "Zonas Específicas" para elegir.'}
                                                        </p>

                                                        {/* Node Selector Modal */}
                                                        {showNodeSelector && (
                                                            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-200 p-4" onClick={() => setShowNodeSelector(false)}>
                                                                <div className="bg-[#141714] border border-white/10 rounded-3xl p-4 md:p-6 max-w-lg w-full shadow-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                                                                    <div className="mb-4">
                                                                        <h3 className="text-lg font-black text-white mb-1">🗺️ Seleccionar Ubicaciones</h3>
                                                                        <p className="text-[11px] text-white/50">Marcá las mesas/barras donde querés que aparezca este menú</p>
                                                                    </div>

                                                                    {venueNodes.length === 0 ? (
                                                                        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                                                                            <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4">
                                                                                <StoreIcon size={32} className="text-white/20" />
                                                                            </div>
                                                                            <p className="text-white/40 text-sm mb-2">No hay mesas ni barras configuradas</p>
                                                                            <p className="text-white/30 text-xs max-w-[280px]">Primero tenés que crear mesas/barras en "Mesas y Salones"</p>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 mb-4">
                                                                            {venueNodes.map(node => {
                                                                                const isSelected = activeIds.includes(node.id);
                                                                                return (
                                                                                    <button
                                                                                        key={node.id}
                                                                                        onClick={() => {
                                                                                            const newIds = isSelected
                                                                                                ? activeIds.filter((id: string) => id !== node.id)
                                                                                                : [...activeIds, node.id];
                                                                                            // Update immediately for UX in modal? Or wait to save?
                                                                                            // To simplify, let's update temporary state or use the same quick save logic
                                                                                            // Here we need to update the rule (or create it)
                                                                                            // But if we are in "All Locations" mode, clicking here switches to custom?
                                                                                            // Let's assume we are editing the rule.
                                                                                            // Ideally use local state for modal, simplified for now:

                                                                                            // If rule doesn't exist, create it with this single ID
                                                                                            // If rule exists, update IDs

                                                                                            const upsert = async () => {
                                                                                                if (!locRule) {
                                                                                                    await handleAddRule('tables', { table_ids: [node.id] });
                                                                                                } else {
                                                                                                    if (newIds.length === 0) {
                                                                                                        // If unselecting last one, maybe warn or delete rule? If delete rule, goes back to ALL.
                                                                                                        // User might want "None"? No, usually menu must be somewhere.
                                                                                                        // Let's allow empty rule (effectively nowhere? or fix logic)
                                                                                                        await supabase.from('menu_rules').update({ rule_config: { table_ids: [] } }).eq('id', locRule.id);
                                                                                                        fetchMenus();
                                                                                                    } else {
                                                                                                        await supabase.from('menu_rules').update({ rule_config: { table_ids: newIds } }).eq('id', locRule.id);
                                                                                                        fetchMenus();
                                                                                                    }
                                                                                                }
                                                                                            };
                                                                                            upsert();
                                                                                        }}
                                                                                        className={`p-3 rounded-xl border text-left flex items-center gap-3 ${isSelected ? 'bg-orange-500/20 border-orange-500/50' : 'bg-white/5 border-white/5'}`}
                                                                                    >
                                                                                        {isSelected && <Check size={14} className="text-orange-400" />}
                                                                                        <span className={isSelected ? 'text-white font-bold' : 'text-white/60'}>{node.label}</span>
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}\
                                                                    <button onClick={() => setShowNodeSelector(false)} className="w-full py-3 bg-white/10 text-white font-bold rounded-xl">Listo</button>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                    </div>
                                )
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                        <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mb-6">
                            <Package size={32} className="text-white/20" />
                        </div>
                        <p className="text-white/40 text-sm mb-2">Seleccioná un menú</p>
                        <p className="text-white/20 text-xs">o creá uno nuevo con el botón +</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// ==========================================
// MAIN COMPONENT
// ==========================================
const MenuDesign: React.FC = () => {
    const { profile } = useAuth();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'ESTÉTICA' | 'LÓGICA' | 'INVENTARIO' | 'MENÚS'>('ESTÉTICA');
    const [searchTerm, setSearchTerm] = useState('');
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [previewTab, setPreviewTab] = useState<'menu' | 'club' | 'profile'>('menu');

    // Financial Input State
    const [activeFinancialInput, setActiveFinancialInput] = useState<'price' | 'margin' | 'profit' | null>(null);
    const [financialBuffer, setFinancialBuffer] = useState<string>('');

    const { addToast } = useToast();

    // --- CONFIGURACIÓN GLOBAL ---
    const [theme, setTheme] = useState<MenuTheme>({
        // Marca
        storeName: 'CIRO',
        logoUrl: '',
        headerImage: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=600',
        headerOverlay: 0.5,
        headerAlignment: 'left',
        // Colores (Tactical SaaS)
        accentColor: '#4ADE80',
        backgroundColor: '#0D0F0D',
        surfaceColor: '#141714',
        textColor: '#FFFFFF',
        // Layout & Forma
        layoutMode: 'grid',
        columns: 2,
        cardStyle: 'glass',
        borderRadius: 'xl',
        fontStyle: 'modern',
        // Visibilidad
        showImages: true,
        showPrices: true,
        showDescription: true,
        showAddButton: true,
        showBadges: true
    });

    const [logicConfig, setLogicConfig] = useState({
        // 1. Operación General
        operation: {
            isOpen: true,
            messageClosed: '',
            estimatedWaitMinutes: 20
        },
        // 2. Canales
        channels: {
            dineIn: { enabled: true, allowOrdering: true },
            takeaway: { enabled: true, minTimeMinutes: 15 },
            delivery: { enabled: true, radiusKm: 5, minOrderAmount: 0 }
        },
        // 3. Features
        features: {
            wallet: { allowTopUp: false, allowPayment: false },
            loyalty: { enabled: false, showPoints: false },
            guestMode: { enabled: true, allowOrdering: false }
        },
        // 4. Reglas
        rules: {
            hideOutofStock: false,
            enforceStock: false,
            showCalories: false,
            showAllergens: true
        },
        // 5. Horarios de Operación
        businessHours: {
            autoClose: true,
            schedules: [
                { day: 0, label: 'Dom', open: '10:00', close: '22:00', enabled: true },
                { day: 1, label: 'Lun', open: '09:00', close: '23:00', enabled: true },
                { day: 2, label: 'Mar', open: '09:00', close: '23:00', enabled: true },
                { day: 3, label: 'Mié', open: '09:00', close: '23:00', enabled: true },
                { day: 4, label: 'Jue', open: '09:00', close: '23:00', enabled: true },
                { day: 5, label: 'Vie', open: '09:00', close: '00:00', enabled: true },
                { day: 6, label: 'Sáb', open: '10:00', close: '00:00', enabled: true }
            ]
        }
    });

    // Item Selector Modal State
    const [showItemSelector, setShowItemSelector] = useState(false);
    const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
    const [editingComboItemId, setEditingComboItemId] = useState<number | null>(null);
    const [itemSelectorSearch, setItemSelectorSearch] = useState('');
    const [linkType, setLinkType] = useState<'addon' | 'combo'>('addon'); // New state for item selector

    const selectedItem = useMemo(() => items.find(i => i.id === editingId), [items, editingId]);

    const [storeSlug, setStoreSlug] = useState<string | null>(null);

    const filteredItems = useMemo(() => {
        return items.filter(i =>
            i.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [items, searchTerm]);

    // Categories for preview - extract from real items
    const previewCategories = useMemo(() => {
        const cats = new Set(items.filter(i => i.is_menu_visible).map(i => i.category_id || 'General'));
        return Array.from(cats).slice(0, 4);
    }, [items]);

    useEffect(() => {
        // Ejecutar inmediatamente - fetchData tiene fallback de store_id
        fetchData();
    }, []);

    const [categories, setCategories] = useState<any[]>([]); // Add categories state

    const fetchData = async () => {
        const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
        console.log('[MenuDesign] fetchData started with store_id:', storeId);
        setLoading(true);

        try {
            // Obtener token del localStorage (Mismo patrón que TableManagement)
            const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
            const storedData = localStorage.getItem(storageKey);
            let token = '';

            if (storedData) {
                try {
                    const parsed = JSON.parse(storedData);
                    token = parsed.access_token || '';
                } catch (e) {
                    console.error('[MenuDesign] Error parsing token:', e);
                }
            }

            const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
            const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1`;

            const headers: HeadersInit = {
                'Content-Type': 'application/json',
                'apikey': apiKey,
                'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`
            };

            // Fetch con timeout y AbortController
            const fetchWithTimeout = async (url: string, timeout = 10000) => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                try {
                    const response = await fetch(url, { headers, signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error(`[MenuDesign] Fetch error ${url}: `, response.status, errorText);
                        return [];
                    }
                    return await response.json();
                } catch (e) {
                    clearTimeout(timeoutId);
                    console.warn(`[MenuDesign] Fetch timeout or error ${url}: `, e);
                    return [];
                }
            };

            // PARALLEL FETCHING OPTIMIZATION
            // Fetch all independent data sources simultaneously to reduce load time
            console.log('[MenuDesign] Starting parallel data fetch...');

            const [stores, inventoryItems, products, categoriesData, recipesData] = await Promise.all([
                // 1. Fetch Store Details
                fetchWithTimeout(`${baseUrl}/stores?id=eq.${storeId}`),
                // 2. Fetch INVENTORY items
                fetchWithTimeout(`${baseUrl}/inventory_items?store_id=eq.${storeId}&order=name.asc`),
                // 2b. Fetch PRODUCTS
                fetchWithTimeout(`${baseUrl}/products?store_id=eq.${storeId}&order=name.asc`),
                // 3. Fetch CATEGORIES
                fetchWithTimeout(`${baseUrl}/categories?store_id=eq.${storeId}&is_active=eq.true&order=position.asc`),
                // 4. Fetch RECIPES
                fetchWithTimeout(`${baseUrl}/product_recipes`)
            ]);

            console.log('[MenuDesign] Parallel fetch complete.');

            const store = stores && stores.length > 0 ? stores[0] : null;

            if (store) {
                setStoreSlug(store.slug);
                console.log('[MenuDesign] Store loaded:', store.name);

                // Parsear menu_theme si existe
                let savedTheme: any = {};
                if (store.menu_theme) {
                    try {
                        savedTheme = typeof store.menu_theme === 'string'
                            ? JSON.parse(store.menu_theme)
                            : store.menu_theme;
                    } catch (e) {
                        console.warn('[MenuDesign] Error parsing menu_theme:', e);
                    }
                }

                // Parsear menu_logic si existe
                let savedLogic: any = {};
                if (store.menu_logic) {
                    try {
                        savedLogic = typeof store.menu_logic === 'string'
                            ? JSON.parse(store.menu_logic)
                            : store.menu_logic;
                    } catch (e) {
                        console.warn('[MenuDesign] Error parsing menu_logic:', e);
                    }
                }

                setTheme(prev => ({
                    ...prev,
                    storeName: store.name || prev.storeName,
                    logoUrl: store.logo_url || prev.logoUrl,
                    accentColor: savedTheme.accentColor || prev.accentColor,
                    backgroundColor: savedTheme.backgroundColor || prev.backgroundColor,
                    surfaceColor: savedTheme.surfaceColor || savedTheme.cardColor || prev.surfaceColor,
                    textColor: savedTheme.textColor || prev.textColor,
                    borderRadius: savedTheme.borderRadius || prev.borderRadius,
                    fontStyle: savedTheme.fontStyle || prev.fontStyle,
                    cardStyle: savedTheme.cardStyle || prev.cardStyle,
                    layoutMode: savedTheme.layoutMode || savedTheme.layout || prev.layoutMode,
                    columns: savedTheme.columns || prev.columns,
                    headerImage: savedTheme.headerImage || prev.headerImage,
                    headerOverlay: savedTheme.headerOverlay ?? prev.headerOverlay,
                    showImages: savedTheme.showImages ?? prev.showImages,
                    showPrices: savedTheme.showPrices ?? prev.showPrices,
                    showDescription: savedTheme.showDescription ?? prev.showDescription,
                    showAddButton: savedTheme.showAddButton ?? savedTheme.showQuickAdd ?? prev.showAddButton,
                    showBadges: savedTheme.showBadges ?? prev.showBadges
                }));

                if (Object.keys(savedLogic).length > 0) {
                    // Check if it's the new nested structure or old flat structure
                    if ((savedLogic as any).operation || (savedLogic as any).channels) {
                        // New structure found
                        setLogicConfig(prev => ({
                            ...prev,
                            ...savedLogic
                        }));
                    } else {
                        // Legacy structure detected - Migrate key values
                        const legacy = savedLogic as any;
                        setLogicConfig(prev => ({
                            ...prev,
                            operation: {
                                ...prev.operation,
                                estimatedWaitMinutes: legacy.estimated_wait_time || 20
                            },
                            channels: {
                                dineIn: { ...prev.channels.dineIn, enabled: legacy.is_dining_open ?? true },
                                takeaway: { ...prev.channels.takeaway, enabled: legacy.is_takeaway_open ?? true },
                                delivery: {
                                    ...prev.channels.delivery,
                                    enabled: legacy.is_delivery_open ?? true,
                                    radiusKm: legacy.delivery_radius_km || 5,
                                    minOrderAmount: legacy.min_order_value || 0
                                }
                            }
                        }));
                        console.log('[MenuDesign] Migrated legacy logic config to V2 structure');
                    }
                }
            }

            setCategories(categoriesData || []);

            // Cast raw data and Map to InventoryItem

            // Map Inventory Items (Ingredients/Raw Material)
            const mappedInventory: InventoryItem[] = (inventoryItems || []).map((item: any) => ({
                id: item.id,
                cafe_id: item.store_id, // Map store_id to cafe_id
                name: item.name,
                sku: item.sku,
                // These are typically ingredients since they are in inventory_items but not products
                // However, we preserve the price check just in case
                item_type: (item.cost > 0 || item.price > 0) ? 'sellable' : 'ingredient',
                unit_type: item.unit_type as UnitType,
                image: item.image || item.image_url || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200',
                is_active: true, // Default to true if not present
                min_stock: item.min_stock_alert,
                current_stock: item.current_stock,
                cost: item.cost,
                price: item.price ?? (item.cost ? item.cost * 3 : 0), // Use DB price or default to cost*3
                category_ids: item.category_id ? [item.category_id] : [],
                description: item.description || '', // Ensure Description is fetched
                presentations: [],
                closed_packages: [],
                open_packages: [],
                is_menu_visible: item.is_menu_visible ?? true, // Default to visible for now so they appear

                // MAPPED JSONB COLUMNS
                variants: item.variants || [],
                addon_links: item.addons || [],
                combo_links: item.combo_items || [],

                // EXPLICIT SOURCE FOR PERSISTENCE
                id_source: 'inventory' as const
            }));

            // Map Products (Recipes/Sellables) - Source of Truth for Menu
            // We use 'sellable' type to distinguish them for persistence
            const mappedProducts: InventoryItem[] = (products || []).map((p: any) => {
                // Calculate recipe cost
                const itemRecipes = (recipesData || []).filter((r: any) => r.product_id === p.id);
                let recipeCost = 0;

                itemRecipes.forEach((r: any) => {
                    const ingredient = (inventoryItems || []).find((inv: any) => inv.id === r.inventory_item_id);
                    if (ingredient && ingredient.cost) {
                        recipeCost += (ingredient.cost * (parseFloat(r.quantity_required) || 0));
                    }
                });

                // Add combo components cost
                (p.combo_items || []).forEach((link: any) => {
                    const component = (inventoryItems || []).find((inv: any) => inv.id === link.component_item_id);
                    if (component && component.cost) {
                        recipeCost += (component.cost * (link.quantity || 1));
                    }
                });

                return {
                    id: p.id,
                    cafe_id: p.store_id,
                    name: p.name,
                    sku: 'SKU-' + (p.id || '').slice(0, 4).toUpperCase(),
                    item_type: 'sellable' as const,
                    unit_type: 'unit' as UnitType,
                    image: p.image || p.image_url || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200',
                    is_active: p.is_available,
                    is_menu_visible: p.is_visible, // Map from 'is_visible' column in products table
                    min_stock: 0,
                    current_stock: 0,
                    cost: recipeCost, // Use calculated recipe cost
                    price: (p.base_price !== undefined && p.base_price !== null) ? Number(p.base_price) : (p.price || 0),
                    category_ids: p.category_id ? [p.category_id] : [],
                    description: p.description || '',
                    presentations: [],
                    closed_packages: [],
                    open_packages: [],
                    variants: p.product_variants || [],
                    addon_links: p.addons || [],
                    combo_links: p.combo_items || [],
                    recipe: itemRecipes.map((r: any) => ({
                        inventory_item_id: r.inventory_item_id,
                        quantity: r.quantity_required
                    })),

                    // EXPLICIT SOURCE FOR PERSISTENCE
                    id_source: 'product' as const
                };
            });

            // DEDUPLICATION: Remove Inventory Item if a Product with same Name exists.
            // This prevents "Double items" (one from inventory, one from product) and ensures we edit the proper Menu Item.
            const productNames = new Set(mappedProducts.map(p => p.name.trim().toLowerCase()));
            const filteredInventory = mappedInventory.filter(i => !productNames.has(i.name.trim().toLowerCase()));

            // Merge and Sort by Name
            const combinedItems = [...filteredInventory, ...mappedProducts]
                .filter(item => !item.name?.trim().toLowerCase().startsWith('[eliminado]'))
                .sort((a, b) => a.name.localeCompare(b.name));

            setItems(combinedItems);

            console.log('[MenuDesign] fetchData complete. Total items:', combinedItems.length);
            console.log('[MenuDesign] (Inventory: ' + filteredInventory.length + ', Products: ' + mappedProducts.length + ')');
            console.log('[MenuDesign] fetchData complete');
        } catch (err: any) {
            console.error('[MenuDesign] Error fetching data:', err);
            addToast('Error al cargar datos del menú', 'error');
        } finally {
            setLoading(false);
        }

    };

    // --- EDITOR HANDLERS ---


    // --- UPDATE LOGIC WITH DEBOUNCE ---
    const updateTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

    // 1. Immediate Local Update (For UI responsiveness)
    const updateItemLocal = (id: string, updates: Partial<InventoryItem>) => {
        setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
    };

    // 2. Persist to Server (Actual API Call)
    const persistItem = async (id: string, updates: Partial<InventoryItem>) => {
        console.log(`[MenuDesign] Persisting updates for ${id}...`, updates);
        const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
        localStorage.removeItem(`inventory_cache_v4_${storeId}`);
        try {
            // Find item to identify Target Table
            const item = items.find(i => i.id === id);

            // Use Explicit Source if available, fallback to legacy type check (should not be needed after refresh)
            const isProduct = (item as any)?.id_source === 'product' || item?.item_type === 'sellable' && !(item as any)?.id_source;
            const table = isProduct ? 'products' : 'inventory_items';

            const dbUpdates: any = {};
            if (updates.name !== undefined) dbUpdates.name = updates.name;
            if (updates.description !== undefined) dbUpdates.description = updates.description;
            if (updates.image_url !== undefined) {
                // Fix: explicit column mapping for products table (image) vs inventory_items (image_url)
                if (table === 'products') {
                    dbUpdates.image = updates.image_url;
                } else {
                    dbUpdates.image_url = updates.image_url;
                }
            }
            if (updates.price !== undefined) {
                // Fix: Verify target table to map column correctly
                if (table === 'products') {
                    dbUpdates.base_price = updates.price;
                    // Ensure 'price' is never sent to products table
                    if ('price' in dbUpdates) delete dbUpdates.price;
                } else {
                    dbUpdates.price = updates.price;
                }
            }

            // Handle Visibility Mapping
            if (updates.is_menu_visible !== undefined) {
                if (isProduct) {
                    dbUpdates.is_visible = updates.is_menu_visible; // Products -> is_visible
                } else {
                    dbUpdates.is_menu_visible = updates.is_menu_visible; // Inventory -> is_menu_visible
                }
            }

            // Complex JSONB fields
            if (updates.variants !== undefined) dbUpdates.variants = updates.variants;
            if (updates.addon_links !== undefined) dbUpdates.addons = updates.addon_links;
            if (updates.combo_links !== undefined) dbUpdates.combo_items = updates.combo_links;

            if (Object.keys(dbUpdates).length === 0) return;

            // Retrieve token
            const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
            const storedData = localStorage.getItem(storageKey);
            let token = '';
            if (storedData) {
                try {
                    const parsed = JSON.parse(storedData);
                    token = parsed.access_token || '';
                } catch (e) { console.error(e); }
            }
            const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

            const response = await fetch(`https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/${table}?id=eq.${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey,
                    'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(dbUpdates)
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[MenuDesign] Update failed:', response.status, errorText);
                throw new Error(`Failed to update item: ${response.status} ${errorText}`);
            }
            // console.log('[MenuDesign] Item persisted successfully');
            // Optional: Show a subtle "Saved" indicator here if needed, but avoiding toast spam is better
        } catch (err: any) {
            console.error('[MenuDesign] Error saving item:', err);
            addToast(`Error al guardar: ${err.message}`, 'error');
        }
    };

    // 3. Debounced Update Wrapper
    // Use this for text inputs (Name, Price, etc.)
    const updateItemDebounced = (id: string, updates: Partial<InventoryItem>) => {
        // 1. Update UI immediately
        updateItemLocal(id, updates);

        // 2. Clear pending timeout for this item
        if (updateTimeoutRef.current[id]) {
            clearTimeout(updateTimeoutRef.current[id]);
        }

        // 3. Set new timeout to persist
        updateTimeoutRef.current[id] = setTimeout(() => {
            persistItem(id, updates);
            // Optional: delete ref key? Not strictly necessary
        }, 1000); // Wait 1 second after last keystroke
    };

    // 4. Force Update (For toggles, buttons, critical changes)
    const updateItemImmediate = (id: string, updates: Partial<InventoryItem>) => {
        updateItemLocal(id, updates);
        persistItem(id, updates);
    };

    // --- DELETE ITEM ---
    const handleDeleteProduct = async (item: InventoryItem) => {
        if (!confirm(`¿Estás seguro de que quieres eliminar "${item.name}"?\nEsta acción es permanente y no se puede deshacer.`)) {
            return;
        }

        try {
            // Retrieve token
            const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
            const storedData = localStorage.getItem(storageKey);
            let token = '';
            if (storedData) {
                try {
                    const parsed = JSON.parse(storedData);
                    token = parsed.access_token || '';
                } catch (e) { console.error(e); }
            }
            const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

            const response = await fetch(`https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?id=eq.${item.id}`, {
                method: 'DELETE',
                headers: {
                    'apikey': apiKey,
                    'Authorization': token ? `Bearer ${token}` : `Bearer ${apiKey}`,
                }
            });

            if (!response.ok) {
                throw new Error('Error deleting item');
            }

            // Update Local State
            setItems(prev => prev.filter(i => i.id !== item.id));
            setEditingId(null);
            // setSelectedItem(null); // Removed: selectedItem is derived from editingId, so clearing editingId is enough
            addToast('Producto eliminado', 'success');

        } catch (err) {
            console.error('Error removing item:', err);
            addToast('Error al eliminar el producto', 'error');
        }
    };

    const handlePublish = async () => {
        console.log('[MenuDesign] handlePublish STARTED');
        setIsSaving(true);

        try {
            const storeId = profile?.store_id || 'f5e3bfcf-3ccc-4464-9eb5-431fa6e26533';
            console.log('[MenuDesign] Using store_id:', storeId);
            console.log('[MenuDesign] Saving name:', theme.storeName);

            // Obtener token directamente del localStorage (sin usar Supabase client)
            const storageKey = 'sb-yjxjyxhksedwfeueduwl-auth-token';
            const storedData = localStorage.getItem(storageKey);
            let token = '';

            if (storedData) {
                try {
                    const parsed = JSON.parse(storedData);
                    token = parsed.access_token || '';
                    console.log('[MenuDesign] Token from localStorage:', token ? 'Found' : 'Not found');
                } catch (e) {
                    console.error('[MenuDesign] Error parsing token:', e);
                }
            }

            if (!token) {
                addToast('Error: No hay sesión activa. Recarga la página.', 'error');
                setIsSaving(false);
                return;
            }

            // AbortController para timeout de 5 segundos
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            console.log('[MenuDesign] Haciendo fetch con timeout de 5s...');

            const response = await fetch(
                `https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/stores?id=eq.${storeId}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${token}`,
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify({
                        name: theme.storeName,
                        logo_url: theme.logoUrl || null,
                        menu_theme: {
                            accentColor: theme.accentColor,
                            backgroundColor: theme.backgroundColor,
                            surfaceColor: theme.surfaceColor,
                            textColor: theme.textColor,
                            borderRadius: theme.borderRadius,
                            fontStyle: theme.fontStyle,
                            cardStyle: theme.cardStyle,
                            layoutMode: theme.layoutMode,
                            columns: theme.columns,
                            headerImage: theme.headerImage,
                            headerOverlay: theme.headerOverlay,
                            showImages: theme.showImages,
                            showPrices: theme.showPrices,
                            showDescription: theme.showDescription,
                            showAddButton: theme.showAddButton,
                            showBadges: theme.showBadges,
                            headerAlignment: theme.headerAlignment
                        },
                        menu_logic: logicConfig,
                        updated_at: new Date().toISOString()
                    }),
                    signal: controller.signal
                }
            );

            clearTimeout(timeoutId);

            console.log('[MenuDesign] Response status:', response.status);
            const data = await response.json();
            console.log('[MenuDesign] Response data:', data);

            if (response.ok && data.length > 0) {
                addToast('✅ Cambios guardados', 'success');
            } else if (response.status === 404 || data.length === 0) {
                addToast('Error: Tienda no encontrada', 'error');
            } else {
                addToast('Error: ' + (data.message || response.statusText), 'error');
            }
        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.error('[MenuDesign] Timeout!');
                addToast('Error: Timeout de conexión', 'error');
            } else {
                console.error('[MenuDesign] Error:', err);
                addToast('Error: ' + (err.message || 'Desconocido'), 'error');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddVariant = () => {
        if (!selectedItem) return;
        const newVariant: ProductVariant = {
            id: crypto.randomUUID(),
            product_id: selectedItem.id,
            name: 'Nueva Variante',
            price_adjustment: 0,
            price_delta: 0,
            recipe_overrides: [],
            active: true,
            created_at: new Date().toISOString()
        } as ProductVariant;
        updateItemImmediate(selectedItem.id, { variants: [...(selectedItem.variants || []), newVariant] });
    };

    const handleUpdateVariant = (variantId: string, field: keyof ProductVariant, value: any) => {
        if (!selectedItem || !selectedItem.variants) return;
        const updatedVariants = selectedItem.variants.map(v =>
            v.id === variantId ? { ...v, [field]: value } : v
        );
        // Use debounced update since this is typically called from input fields (name, price)
        updateItemDebounced(selectedItem.id, { variants: updatedVariants });
    };

    const handleRemoveVariant = (variantId: string) => {
        if (!selectedItem || !selectedItem.variants) return;
        // Immediate update for removal
        updateItemImmediate(selectedItem.id, { variants: selectedItem.variants.filter(v => v.id !== variantId) });
    };

    const handleAddAddon = () => {
        if (!selectedItem) return;
        const newAddon: ProductAddon = {
            id: crypto.randomUUID(),
            name: 'Extra ...',
            price: 0,
            inventory_item_id: '',
            quantity_consumed: 0
        };
        // Consolidated: Push to addon_links
        // Immediate update for addition
        updateItemImmediate(selectedItem.id, { addon_links: [...(selectedItem.addon_links || []), newAddon] });
    };

    const handleUpdateAddon = (addonId: string, field: keyof ProductAddon, value: any) => {
        if (!selectedItem || !selectedItem.addon_links) return;
        const updatedAddons = selectedItem.addon_links.map(a =>
            a.id === addonId ? { ...a, [field]: value } : a
        );
        // Debounced update for editing addon fields
        updateItemDebounced(selectedItem.id, { addon_links: updatedAddons });
    };

    const handleRemoveAddon = (addonId: string) => {
        if (!selectedItem || !selectedItem.addon_links) return;
        const filteredAddons = selectedItem.addon_links.filter(a => a.id !== addonId);
        // Immediate update for removal
        updateItemImmediate(selectedItem.id, { addon_links: filteredAddons });
    };

    // Explicit Save Helper
    const saveItemChanges = async () => {
        if (!selectedItem) return;
        // Force update to DB to ensure persistence
        await persistItem(selectedItem.id, {
            addon_links: selectedItem.addon_links
        });
        addToast('Extras guardados y sincronizados con la nube', 'success');
    };

    // New functions for linking items
    const handleAddLink = (itemToLink: InventoryItem) => {
        if (!selectedItem) return;

        if (linkType === 'addon') {
            const newAddonLink: ProductAddon = {
                id: crypto.randomUUID(),
                name: itemToLink.name,
                price: 0,
                inventory_item_id: itemToLink.id,
                quantity_consumed: 1
            };
            updateItemImmediate(selectedItem.id, {
                addon_links: [...(selectedItem.addon_links || []), newAddonLink]
            });
        } else if (linkType === 'combo') {
            const newComboLink = { id: crypto.randomUUID(), component_item_id: itemToLink.id, quantity: 1 };
            updateItemImmediate(selectedItem.id, {
                combo_links: [...(selectedItem.combo_links || []), newComboLink]
            });
        } else if ((linkType as string) === 'variant_override') {
            const variantId = editingAddonId; // reusing this state
            if (!variantId) return;
            const variant = selectedItem.variants?.find(v => v.id === variantId);
            if (!variant) return;

            const newOverride = { ingredient_id: itemToLink.id, quantity_delta: 1, consumption_type: 'fixed' as const, value: 1 };
            const updatedVariants = selectedItem.variants?.map(v =>
                v.id === variantId ? { ...v, recipe_overrides: [...(v.recipe_overrides || []), newOverride] } : v
            );
            updateItemImmediate(selectedItem.id, { variants: updatedVariants });
        }
        setShowItemSelector(false);
    };

    const handleDeleteLink = (itemId: string, linkId: string) => {
        const item = items.find(i => i.id === itemId);
        if (!item) return;

        if (linkType === 'addon') {
            const updatedAddonLinks = (item.addon_links || []).filter(link => link.id !== linkId);
            updateItemImmediate(itemId, { addon_links: updatedAddonLinks });
        } else if (linkType === 'combo') {
            const updatedComboLinks = (item.combo_links || []).filter(link => link.id !== linkId);
            updateItemImmediate(itemId, { combo_links: updatedComboLinks });
        }
    };


    // --- AI HANDLERS ---

    const handleAIDescription = async () => {
        if (!selectedItem) return;
        setIsGeneratingAI(true);
        try {
            const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
            if (!apiKey) {
                alert('Configuración de IA no detectada. Solicite activación al soporte.');
                return;
            }
            const ai = new GoogleGenerativeAI(apiKey);
            const model = ai.getGenerativeModel({ model: "gemini-2.0-flash" });
            const prompt = `Eres un experto redactor gourmet para cafeterías de especialidad. Escribe una descripción corta (máximo 120 caracteres), sensorial e irresistible para el producto: "${selectedItem.name}". Si el producto es café, menciona notas de cata. No uses comillas.`;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            if (text) updateItemImmediate(selectedItem.id, { description: text.trim() });
        } catch (e) {
            console.error("AI Error:", e);
            alert(`Error al contactar con SquadAI: ${(e as Error).message}`);
        } finally {
            setIsGeneratingAI(false);
        }
    };

    const handleImageDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0] && selectedItem) {
            processImageFile(e.dataTransfer.files[0]);
        }
    };

    const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && selectedItem) {
            processImageFile(e.target.files[0]);
        }
    };

    const processImageFile = async (file: File) => {
        if (!selectedItem) return;

        // Ensure we have a path prefix, fallback to 'temp' if store_id not loaded
        const storePrefix = profile?.store_id || 'temp';
        addToast('Subiendo imagen...', 'info');
        console.log('[ImageUpload] Starting upload for item:', selectedItem.id);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${selectedItem.id}-${Date.now()}.${fileExt}`;
            const filePath = `${storePrefix}/${fileName}`;
            console.log('[ImageUpload] Path:', filePath);

            const { error: uploadError } = await supabase.storage
                .from('product-images' as any)
                .upload(filePath, file, { cacheControl: '3600', upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('product-images' as any)
                .getPublicUrl(filePath);

            const finalUrl = `${publicUrl}?t=${Date.now()}`;
            console.log('[ImageUpload] Success. URL:', finalUrl);

            await updateItemImmediate(selectedItem.id, { image_url: finalUrl });

            // Reset input to allow re-uploading the same file if needed
            const input = document.getElementById('item-image-input') as HTMLInputElement;
            if (input) input.value = '';

            addToast('Imagen guardada correctamente', 'success');
        } catch (err: any) {
            console.error('[ImageUpload] Error uploading image:', err);
            addToast(`Error al subir: ${err.message}`, 'error');
        }
    };

    const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && profile?.store_id) {
            const file = e.target.files[0];
            addToast('Subiendo logo...', 'info');

            try {
                const fileExt = file.name.split('.').pop();
                const fileName = `logo-${Date.now()}.${fileExt}`;
                const filePath = `${profile.store_id}/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('store-logos' as any)
                    .upload(filePath, file);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('store-logos' as any)
                    .getPublicUrl(filePath);

                setTheme(prev => ({ ...prev, logoUrl: publicUrl }));
                addToast('Logo subido correctamente', 'success');
            } catch (err: any) {
                console.error('Error uploading logo:', err);
                addToast('Error al subir logo. ¿Existe el bucket "store-logos"?', 'error');
            }
        }
    };

    const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && profile?.store_id) {
            const file = e.target.files[0];
            addToast('Subiendo portada...', 'info');

            try {
                const fileExt = file.name.split('.').pop();
                const fileName = `cover-${Date.now()}.${fileExt}`;
                const filePath = `${profile.store_id}/${fileName}`;

                // Use Supabase SDK for proper auth handling
                const { error: uploadError } = await supabase.storage
                    .from('store-covers')
                    .upload(filePath, file, {
                        upsert: true,
                        contentType: file.type
                    });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('store-covers')
                    .getPublicUrl(filePath);

                const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
                setTheme(prev => ({ ...prev, headerImage: publicUrl }));
                addToast('Portada subida correctamente', 'success');
            } catch (err: any) {
                console.error('Error uploading cover:', err);
                addToast(`Error al subir portada: ${err.message || 'Verifica que el bucket "store-covers" exista y tenga permisos públicos'}`, 'error');
            }
        }
    };

    const handlePromoBannerSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0] && profile?.store_id) {
            const file = e.target.files[0];
            addToast('Subiendo banner...', 'info');

            try {
                const fileExt = file.name.split('.').pop();
                const fileName = `promo-${Date.now()}.${fileExt}`;
                const filePath = `${profile.store_id}/${fileName}`;

                // Use Supabase SDK for proper auth handling
                const { error: uploadError } = await supabase.storage
                    .from('store-covers')
                    .upload(filePath, file, {
                        upsert: true,
                        contentType: file.type
                    });

                if (uploadError) throw uploadError;

                const { data: urlData } = supabase.storage
                    .from('store-covers')
                    .getPublicUrl(filePath);

                const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
                setTheme(prev => ({ ...prev, promoBannerUrl: publicUrl }));
                addToast('Banner cargado correctamente', 'success');
            } catch (err: any) {
                console.error('Error uploading promo banner:', err);
                addToast(`Error al subir banner: ${err.message}`, 'error');
            }
        }
    };

    // Helper para obtener clases basadas en el tema
    const getPreviewClasses = () => {
        const rounded = theme.borderRadius === 'none' ? 'rounded-none' : theme.borderRadius === 'md' ? 'rounded-md' : theme.borderRadius === 'full' ? 'rounded-[2rem]' : 'rounded-xl';
        const font = theme.fontStyle === 'serif' ? 'font-serif' : theme.fontStyle === 'mono' ? 'font-mono' : 'font-sans';

        let cardBase = '';
        if (theme.cardStyle === 'glass') cardBase = 'bg-white/10 backdrop-blur-md border border-white/10';
        if (theme.cardStyle === 'solid') cardBase = 'bg-[#1a1c1a] border border-white/5';
        if (theme.cardStyle === 'border') cardBase = 'bg-transparent border border-white/20';
        if (theme.cardStyle === 'minimal') cardBase = 'bg-transparent border-b border-white/5 rounded-none px-0';

        return { rounded, font, cardBase };
    };

    const preview = getPreviewClasses();

    return (
        <div className="min-h-screen bg-[#F8F9F7] dark:bg-[#0D0F0D] text-[#37352F] dark:text-white p-4 md:p-8 font-sans selection:bg-[#4ADE80]/30 transition-colors duration-300">
            {/* Header / Navigation */}
            <div className="max-w-[1600px] mx-auto mb-12">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-white/5 pb-8">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5 text-[#4ADE80] text-[10px] font-mono tracking-widest uppercase opacity-80">
                            <div className="w-1.5 h-1.5 rounded-full bg-[#4ADE80] animate-pulse" />
                            Editor de Experiencia v2.1
                        </div>
                        <h1 className="text-2xl font-black tracking-tighter text-white mb-0.5">
                            DISEÑO DE <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/30">EXPERIENCIA</span>
                        </h1>
                        <p className="text-[#52525B] text-[11px] font-medium uppercase tracking-wider">Identidad Visual & Protocolos de Storefront</p>
                    </div>

                    <div className="flex items-center gap-3 bg-black/40 p-1 rounded-xl border border-white/5 backdrop-blur-xl">
                        {(['ESTÉTICA', 'LÓGICA', 'INVENTARIO', 'MENÚS'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`
                                    px-4 py-2 rounded-lg text-[10px] font-black transition-all duration-300 tracking-[0.15em]
                                    ${activeTab === tab
                                        ? 'bg-[#141714] text-[#4ADE80] border border-[#4ADE80]/20'
                                        : 'text-[#52525B] hover:text-white'
                                    }
                                `}
                            >
                                {tab}
                            </button>
                        ))}
                        <div className="w-px h-5 bg-white/10 mx-1" />
                        <button
                            onClick={handlePublish}
                            disabled={isSaving}
                            className="bg-[#4ADE80] hover:bg-[#22C55E] disabled:bg-[#4ADE80]/50 text-black px-5 py-2 rounded-lg text-[10px] font-black transition-all flex items-center gap-2"
                        >
                            {isSaving ? (
                                <>
                                    <div className="w-2.5 h-2.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                                    GUARDANDO...
                                </>
                            ) : (
                                <>
                                    <Save className="w-3 h-3" />
                                    PUBLICAR
                                </>
                            )}
                        </button>
                        <button
                            onClick={() => storeSlug && window.open(`/#/m/${storeSlug}`, '_blank')}
                            disabled={!storeSlug}
                            className="bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-[10px] font-black transition-all flex items-center gap-2 border border-white/5"
                            title={storeSlug ? "Ver menú en vivo" : "Guarda la configuración para generar el link"}
                        >
                            <Monitor className="w-3 h-3" />
                            VER MENÚ LIVE
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-5 space-y-4">
                    {/* VISTA: GESTIÓN DE MENÚS DINÁMICOS */}
                    {activeTab === 'MENÚS' && (
                        <div className="bg-[#141714] border border-white/5 rounded-2xl overflow-hidden shadow-xl h-[calc(100vh-220px)] animate-in fade-in slide-in-from-bottom-4 duration-700">
                            <MenusPanel storeId={profile?.store_id} />
                        </div>
                    )}
                    {activeTab === 'ESTÉTICA' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                            {/* SECCIÓN: IDENTIDAD */}
                            <div className="bg-[#141714] border border-white/5 rounded-2xl p-4 shadow-xl">
                                <h3 className="text-[10px] font-black text-[#52525B] tracking-widest uppercase mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-[#4ADE80] rounded-full opacity-50" />
                                    Identidad de Marca
                                </h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[9px] font-black text-[#52525B] uppercase tracking-widest mb-1.5 block">Nombre del Store</label>
                                        <input
                                            type="text"
                                            value={theme.storeName}
                                            onChange={e => setTheme({ ...theme, storeName: e.target.value })}
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:border-[#4ADE80]/50 transition-all outline-none"
                                        />
                                    </div>
                                    {/* COVER IMAGE UPLOAD */}
                                    <div>
                                        <label className="text-[9px] font-black text-[#52525B] uppercase tracking-widest mb-1.5 block">Imagen de Portada</label>
                                        <div className="relative group">
                                            <div
                                                className="w-full h-24 rounded-xl bg-black/40 border border-white/10 overflow-hidden cursor-pointer hover:border-[#4ADE80]/50 transition-all"
                                                onClick={() => document.getElementById('cover-input')?.click()}
                                            >
                                                {theme.headerImage ? (
                                                    <img src={theme.headerImage} className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="flex items-center justify-center h-full text-[#52525B]">
                                                        <Image className="w-6 h-6" />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <span className="text-[10px] font-bold text-white uppercase">Subir imagen</span>
                                                </div>
                                            </div>
                                            <input
                                                id="cover-input"
                                                type="file"
                                                accept="image/*"
                                                onChange={handleCoverSelect}
                                                className="hidden"
                                            />
                                        </div>
                                    </div>
                                    {/* LOGO UPLOAD */}
                                    <div>
                                        <label className="text-[9px] font-black text-[#52525B] uppercase tracking-widest mb-1.5 block">Logo del Local</label>
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="size-14 rounded-xl bg-black/40 border border-white/10 overflow-hidden cursor-pointer hover:border-[#4ADE80]/50 transition-all flex items-center justify-center"
                                                onClick={() => document.getElementById('logo-input')?.click()}
                                            >
                                                {theme.logoUrl ? (
                                                    <img src={theme.logoUrl} className="w-full h-full object-contain bg-black/10" />
                                                ) : (
                                                    <span className="material-symbols-outlined text-[#52525B] text-xl">add_photo_alternate</span>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-[10px] text-white/40">Se mostrará en el header del menú</p>
                                                <button
                                                    onClick={() => document.getElementById('logo-input')?.click()}
                                                    className="mt-1 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[9px] font-bold uppercase hover:bg-white/10 transition-all"
                                                >
                                                    Subir logo
                                                </button>
                                            </div>
                                            <input
                                                id="logo-input"
                                                type="file"
                                                accept="image/*"
                                                onChange={handleLogoSelect}
                                                className="hidden"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between items-center mb-1.5">
                                            <label className="text-[9px] font-black text-[#52525B] uppercase tracking-widest block">Overlay</label>
                                            <span className="text-[9px] font-mono text-[#4ADE80]">{Math.round(theme.headerOverlay * 100)}%</span>
                                        </div>
                                        <input
                                            type="range" min="0" max="0.9" step="0.05"
                                            value={theme.headerOverlay}
                                            onChange={e => setTheme({ ...theme, headerOverlay: parseFloat(e.target.value) })}
                                            className="w-full h-1 bg-black/60 rounded-lg appearance-none cursor-pointer accent-[#4ADE80]"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN: COLORES */}
                            <div className="bg-[#141714] border border-white/5 rounded-2xl p-4 shadow-xl">
                                <h3 className="text-[10px] font-black text-[#52525B] tracking-widest uppercase mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-[#4ADE80] rounded-full opacity-50" />
                                    Paleta Táctica
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <ColorPicker label="Acento" color={theme.accentColor} onChange={c => setTheme({ ...theme, accentColor: c })} />
                                    <ColorPicker label="Fondo" color={theme.backgroundColor} onChange={c => setTheme({ ...theme, backgroundColor: c })} />
                                    <ColorPicker label="Superficie" color={theme.surfaceColor} onChange={c => setTheme({ ...theme, surfaceColor: c })} />
                                    <ColorPicker label="Texto" color={theme.textColor} onChange={c => setTheme({ ...theme, textColor: c })} />
                                </div>
                            </div>

                            {/* SECCIÓN: LAYOUT */}
                            <div className="bg-[#141714] border border-white/5 rounded-2xl p-4 shadow-xl">
                                <h3 className="text-[10px] font-black text-[#52525B] tracking-widest uppercase mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-[#4ADE80] rounded-full opacity-50" />
                                    Estructura
                                </h3>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-2">
                                        <StyleBtn active={theme.layoutMode === 'grid'} onClick={() => setTheme({ ...theme, layoutMode: 'grid' })}>
                                            <Grid className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-black">GRID</span>
                                        </StyleBtn>
                                        <StyleBtn active={theme.layoutMode === 'list'} onClick={() => setTheme({ ...theme, layoutMode: 'list' })}>
                                            <List className="w-3.5 h-3.5" />
                                            <span className="text-[10px] font-black">LISTA</span>
                                        </StyleBtn>
                                    </div>

                                    <div className="grid grid-cols-3 gap-1.5">
                                        {(['glass', 'solid', 'border'] as const).map(s => (
                                            <button key={s} onClick={() => setTheme({ ...theme, cardStyle: s })} className={`py-1.5 text-[9px] font-black uppercase tracking-widest rounded-lg border ${theme.cardStyle === s ? 'bg-[#4ADE80]/10 border-[#4ADE80]/20 text-[#4ADE80]' : 'bg-black/20 border-white/5 text-[#52525B]'}`}>{s}</button>
                                        ))}
                                    </div>

                                    <div className="flex justify-between gap-1 overflow-x-auto pb-1 invisible-scrollbar">
                                        {(['none', 'sm', 'md', 'lg', 'xl'] as const).map(r => (
                                            <button key={r} onClick={() => setTheme({ ...theme, borderRadius: r })} className={`min-w-[32px] h-8 flex items-center justify-center text-[9px] font-bold rounded-lg border ${theme.borderRadius === r ? 'bg-[#4ADE80] text-black border-transparent' : 'bg-black/20 border-white/5 text-[#52525B]'}`}>{r}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#141714] border border-white/5 rounded-2xl p-4 shadow-xl">
                                <h3 className="text-[10px] font-black text-[#52525B] tracking-widest uppercase mb-3 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-[#4ADE80] rounded-full opacity-50" />
                                    Visibilidad
                                </h3>
                                <div className="space-y-2">
                                    <Toggle label="Imágenes" active={theme.showImages} onChange={v => setTheme({ ...theme, showImages: v })} />
                                    <Toggle label="Precios" active={theme.showPrices} onChange={v => setTheme({ ...theme, showPrices: v })} />
                                    <Toggle label="Detalle" active={theme.showDescription} onChange={v => setTheme({ ...theme, showDescription: v })} />
                                    <Toggle label="Compra" active={theme.showAddButton} onChange={v => setTheme({ ...theme, showAddButton: v })} />
                                    <div className="pt-2 border-t border-white/5 mt-2">
                                        <Toggle label="Banner Promo" active={theme.showPromoBanner ?? false} onChange={v => setTheme({ ...theme, showPromoBanner: v })} />
                                        {theme.showPromoBanner && (
                                            <div className="mt-2 pl-3 border-l border-white/10 space-y-2 animate-in slide-in-from-top-2 fade-in duration-300">
                                                <label className="text-[9px] font-black text-[#52525B] uppercase tracking-widest block">Imagen del Banner</label>
                                                <div className="relative group">
                                                    <div
                                                        className="w-full h-16 rounded-xl bg-black/40 border border-white/10 overflow-hidden cursor-pointer hover:border-[#4ADE80]/50 transition-all flex items-center justify-center group-hover:bg-white/5"
                                                        onClick={() => document.getElementById('promo-banner-input')?.click()}
                                                    >
                                                        {theme.promoBannerUrl ? (
                                                            <>
                                                                <img src={theme.promoBannerUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-40 transition-opacity" />
                                                                <div className="absolute inset-0 flex items-center justify-center">
                                                                    <span className="text-[9px] font-black text-white drop-shadow-md uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0 duration-300">Cambiar Imagen</span>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="flex flex-col items-center gap-1 text-[#52525B] group-hover:text-white/60 transition-colors">
                                                                <span className="material-symbols-outlined text-lg">add_photo_alternate</span>
                                                                <span className="text-[8px] font-black uppercase tracking-widest">Subir Banner</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <input
                                                        id="promo-banner-input"
                                                        type="file"
                                                        accept="image/*"
                                                        onChange={handlePromoBannerSelect}
                                                        className="hidden"
                                                    />
                                                </div>
                                                <p className="text-[8px] text-white/30 italic">Se mostrará a invitados y usuarios cuando NO tengan saldo.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'LÓGICA' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* 1. OPERACIÓN GENERAL */}
                            <div className="bg-[#141714] border border-white/5 rounded-2xl p-4 shadow-xl">
                                <h3 className="text-[10px] font-black text-[#52525B] tracking-widest uppercase mb-4 flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${logicConfig.operation.isOpen ? 'bg-[#4ADE80]' : 'bg-red-500'}`} />
                                    Operación General
                                </h3>
                                <div className="space-y-2">
                                    <Toggle label="Tienda Abierta" active={logicConfig.operation.isOpen} onChange={v => setLogicConfig({ ...logicConfig, operation: { ...logicConfig.operation, isOpen: v } })} />
                                    <LogicRow label="Demora (min)" value={logicConfig.operation.estimatedWaitMinutes} onChange={v => setLogicConfig({ ...logicConfig, operation: { ...logicConfig.operation, estimatedWaitMinutes: v } })} unit="min" />

                                    {/* Mensaje de cierre opcional */}
                                    {!logicConfig.operation.isOpen && (
                                        <div className="mt-2">
                                            <label className="text-[9px] font-bold text-[#52525B] uppercase tracking-wider mb-1 block">Mensaje de Cierre</label>
                                            <input
                                                type="text"
                                                value={logicConfig.operation.messageClosed || ''}
                                                onChange={e => setLogicConfig({ ...logicConfig, operation: { ...logicConfig.operation, messageClosed: e.target.value } })}
                                                placeholder="Ej: Volvemos a las 19:00hs"
                                                className="w-full bg-black/20 border border-white/10 rounded-lg p-2 text-xs font-medium text-white/80 focus:border-[#4ADE80]/50 outline-none"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 1.5 HORARIOS DE OPERACIÓN */}
                            <div className="bg-[#141714] border border-white/5 rounded-2xl p-4 shadow-xl">
                                <h3 className="text-[10px] font-black text-[#52525B] tracking-widest uppercase mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full opacity-50" />
                                    Horarios de Operación
                                </h3>
                                <div className="space-y-2">
                                    <Toggle
                                        label="Cerrar automáticamente fuera de horario"
                                        active={logicConfig.businessHours.autoClose}
                                        onChange={v => setLogicConfig({
                                            ...logicConfig,
                                            businessHours: { ...logicConfig.businessHours, autoClose: v }
                                        })}
                                    />
                                    <div className="mt-3 space-y-1.5">
                                        {logicConfig.businessHours.schedules.map((s, idx) => (
                                            <div key={s.day} className="flex items-center gap-2 p-2 bg-black/20 rounded-lg">
                                                <button
                                                    onClick={() => {
                                                        const updated = [...logicConfig.businessHours.schedules];
                                                        updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
                                                        setLogicConfig({
                                                            ...logicConfig,
                                                            businessHours: { ...logicConfig.businessHours, schedules: updated }
                                                        });
                                                    }}
                                                    className={`w-10 text-[9px] font-black ${s.enabled ? 'text-[#4ADE80]' : 'text-white/30'}`}
                                                >
                                                    {s.label}
                                                </button>
                                                {s.enabled ? (
                                                    <>
                                                        <input
                                                            type="time"
                                                            value={s.open}
                                                            onChange={e => {
                                                                const updated = [...logicConfig.businessHours.schedules];
                                                                updated[idx] = { ...updated[idx], open: e.target.value };
                                                                setLogicConfig({
                                                                    ...logicConfig,
                                                                    businessHours: { ...logicConfig.businessHours, schedules: updated }
                                                                });
                                                            }}
                                                            className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white outline-none focus:border-[#4ADE80]/50"
                                                        />
                                                        <span className="text-white/20 text-[10px]">a</span>
                                                        <input
                                                            type="time"
                                                            value={s.close}
                                                            onChange={e => {
                                                                const updated = [...logicConfig.businessHours.schedules];
                                                                updated[idx] = { ...updated[idx], close: e.target.value };
                                                                setLogicConfig({
                                                                    ...logicConfig,
                                                                    businessHours: { ...logicConfig.businessHours, schedules: updated }
                                                                });
                                                            }}
                                                            className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white outline-none focus:border-[#4ADE80]/50"
                                                        />
                                                    </>
                                                ) : (
                                                    <span className="flex-1 text-[10px] text-white/20 text-center">Cerrado</span>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* 2. CANALES */}
                            <div className="bg-[#141714] border border-white/5 rounded-2xl p-4 shadow-xl">
                                <h3 className="text-[10px] font-black text-[#52525B] tracking-widest uppercase mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-[#4ADE80] rounded-full opacity-50" />
                                    Canales & Accesos
                                </h3>

                                {/* Mesa */}
                                <div className="mb-4 pb-4 border-b border-white/5">
                                    <h4 className="text-[9px] font-bold text-white/40 uppercase mb-2">En el Local</h4>
                                    <div className="space-y-2">
                                        <ChannelBtn icon={<StoreIcon className="w-3.5 h-3.5" />} label="MESA / SALÓN" active={logicConfig.channels.dineIn.enabled} onClick={v => setLogicConfig({ ...logicConfig, channels: { ...logicConfig.channels, dineIn: { ...logicConfig.channels.dineIn, enabled: v } } })} />
                                        {logicConfig.channels.dineIn.enabled && (
                                            <Toggle label="Permitir Pedidos" active={logicConfig.channels.dineIn.allowOrdering} onChange={v => setLogicConfig({ ...logicConfig, channels: { ...logicConfig.channels, dineIn: { ...logicConfig.channels.dineIn, allowOrdering: v } } })} />
                                        )}
                                    </div>
                                </div>

                                {/* Takeaway */}
                                <div className="mb-4 pb-4 border-b border-white/5">
                                    <h4 className="text-[9px] font-bold text-white/40 uppercase mb-2">Para Llevar</h4>
                                    <div className="space-y-2">
                                        <ChannelBtn icon={<Package className="w-3.5 h-3.5" />} label="TAKEAWAY" active={logicConfig.channels.takeaway.enabled} onClick={v => setLogicConfig({ ...logicConfig, channels: { ...logicConfig.channels, takeaway: { ...logicConfig.channels.takeaway, enabled: v } } })} />
                                    </div>
                                </div>

                                {/* Delivery */}
                                <div>
                                    <h4 className="text-[9px] font-bold text-white/40 uppercase mb-2">Delivery</h4>
                                    <div className="space-y-2">
                                        <ChannelBtn icon={<Truck className="w-3.5 h-3.5" />} label="DELIVERY" active={logicConfig.channels.delivery.enabled} onClick={v => setLogicConfig({ ...logicConfig, channels: { ...logicConfig.channels, delivery: { ...logicConfig.channels.delivery, enabled: v } } })} />
                                        {logicConfig.channels.delivery.enabled && (
                                            <>
                                                <LogicRow label="Radio (km)" value={logicConfig.channels.delivery.radiusKm} onChange={v => setLogicConfig({ ...logicConfig, channels: { ...logicConfig.channels, delivery: { ...logicConfig.channels.delivery, radiusKm: v } } })} unit="km" />
                                                <LogicRow label="Mínimo ($)" value={logicConfig.channels.delivery.minOrderAmount} onChange={v => setLogicConfig({ ...logicConfig, channels: { ...logicConfig.channels, delivery: { ...logicConfig.channels.delivery, minOrderAmount: v } } })} unit="$" />
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* 3. FEATURES (WALLET & LOYALTY) */}
                            <div className="bg-[#141714] border border-white/5 rounded-2xl p-4 shadow-xl">
                                <h3 className="text-[10px] font-black text-[#52525B] tracking-widest uppercase mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-yellow-500 rounded-full opacity-50" />
                                    Experiencia & Fidelidad
                                </h3>
                                <div className="space-y-2">
                                    <Toggle label="Wallet (Saldo)" active={logicConfig.features.wallet.allowPayment} onChange={v => setLogicConfig({ ...logicConfig, features: { ...logicConfig.features, wallet: { ...logicConfig.features.wallet, allowPayment: v, allowTopUp: v } } })} />
                                    <Toggle label="Puntos (Loyalty)" active={logicConfig.features.loyalty.enabled} onChange={v => setLogicConfig({ ...logicConfig, features: { ...logicConfig.features, loyalty: { ...logicConfig.features.loyalty, enabled: v, showPoints: v } } })} />
                                    <Toggle label="Modo Invitado" active={logicConfig.features.guestMode.enabled} onChange={v => setLogicConfig({ ...logicConfig, features: { ...logicConfig.features, guestMode: { ...logicConfig.features.guestMode, enabled: v } } })} />
                                </div>
                            </div>

                            {/* 4. REGLAS DE MENÚ */}
                            <div className="bg-[#141714] border border-white/5 rounded-2xl p-4 shadow-xl">
                                <h3 className="text-[10px] font-black text-[#52525B] tracking-widest uppercase mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full opacity-50" />
                                    Reglas de Menú
                                </h3>
                                <div className="space-y-2">
                                    <div className="p-3 bg-red-500/5 rounded-xl border border-red-500/10">
                                        <Toggle label="Ocultar Sin Stock" active={logicConfig.rules.hideOutofStock} onChange={v => setLogicConfig({ ...logicConfig, rules: { ...logicConfig.rules, hideOutofStock: v } })} />
                                        <p className="text-[9px] text-red-400/60 mt-1 pl-1">Los productos con stock 0 desaparecerán del menú.</p>
                                    </div>
                                    <Toggle label="Mostrar Calorías" active={logicConfig.rules.showCalories} onChange={v => setLogicConfig({ ...logicConfig, rules: { ...logicConfig.rules, showCalories: v } })} />
                                    <Toggle label="Mostrar Alérgenos" active={logicConfig.rules.showAllergens} onChange={v => setLogicConfig({ ...logicConfig, rules: { ...logicConfig.rules, showAllergens: v } })} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* VISTA: GESTIÓN DE INVENTARIO */}
                    {activeTab === 'INVENTARIO' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="bg-[#141714] border border-white/5 rounded-2xl p-4 shadow-xl">
                                <h3 className="text-[10px] font-black text-[#52525B] tracking-widest uppercase mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-[#4ADE80] rounded-full opacity-50" />
                                    Gestión de Inventario
                                </h3>
                                <p className="text-[10px] text-[#A1A1AA] italic mb-4">Vincula productos físicos con el catálogo digital.</p>

                                <div className="space-y-3 lg:max-h-[calc(100vh-300px)] overflow-y-auto pr-2 custom-scrollbar">
                                    {items.map(item => (
                                        <div
                                            key={item.id}
                                            onClick={() => { setEditingId(item.id); setLinkType(null); }}
                                            className="bg-black/30 border border-white/5 rounded-xl p-3 hover:border-[#4ADE80]/30 transition-all group cursor-pointer"
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div className="flex gap-3">
                                                    <div className="w-10 h-10 bg-white/5 rounded-lg overflow-hidden border border-white/10 group-hover:border-[#4ADE80]/50 transition-colors">
                                                        {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <Coffee className="w-5 h-5 m-2 text-[#52525B]" />}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-[10px] font-bold uppercase truncate max-w-[120px]">{item.name}</h4>
                                                        <span className="text-[9px] text-[#A1A1AA] font-mono tracking-tighter block">{item.sku || 'SIN-SKU'}</span>
                                                    </div>
                                                </div>
                                                <div className={`px-1.5 py-0.5 rounded-full text-[7px] font-black ${item.item_type === 'sellable' ? 'bg-[#4ADE80]/10 text-[#4ADE80]' : 'bg-blue-500/10 text-blue-400'}`}>
                                                    {item.item_type?.toUpperCase().slice(0, 1)}
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between p-1.5 bg-white/5 rounded-lg border border-white/5">
                                                    <span className="text-[8px] font-medium text-white/60">Visible</span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); updateItemImmediate(item.id, { is_menu_visible: !item.is_menu_visible }); }}
                                                        className={`w-6 h-3 rounded-full transition-colors relative ${item.is_menu_visible ? 'bg-[#4ADE80]' : 'bg-white/10'}`}
                                                    >
                                                        <div className={`absolute top-0.5 left-0.5 w-2 h-2 bg-white rounded-full transition-transform ${item.is_menu_visible ? 'translate-x-3' : ''}`} />
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-2 gap-1.5">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingId(item.id); setLinkType('variant'); }}
                                                        className={`py-1.5 rounded-lg border ${item.variants && item.variants.length > 0 ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/10 text-white/40'} text-[8px] font-black uppercase tracking-widest hover:border-white/30 transition-all text-center`}
                                                    >
                                                        {item.variants?.length || 0} VAR
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingId(item.id); setLinkType('addon'); }}
                                                        className={`py-1.5 rounded-lg border ${item.addon_links && item.addon_links.length > 0 ? 'bg-orange-500/10 border-orange-500/30 text-orange-400' : 'bg-white/5 border-white/10 text-white/40'} text-[8px] font-black uppercase tracking-widest hover:border-white/30 transition-all text-center`}
                                                    >
                                                        {item.addon_links?.length || 0} EXT
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Vista Previa: Lógica Real (MenuRenderer) */}
                <div className="lg:col-span-7 sticky top-8 flex items-start justify-center min-h-[800px]">
                    <div className="relative w-full max-w-[390px] aspect-[9/19] bg-black rounded-[3.5rem] border-[12px] border-[#1A1C19] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col transform transition-all duration-500">
                        {/* Notch */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-7 bg-[#1A1C19] rounded-b-3xl z-50 pointer-events-none" />

                        {/* Content Wrapper for MenuRenderer */}
                        <div className="flex-1 flex flex-col relative overflow-y-auto overflow-x-hidden bg-black">
                            {previewTab === 'menu' && (
                                <MenuRenderer
                                    theme={theme}
                                    products={items.filter(i => i.is_menu_visible)}
                                    categories={categories}
                                    storeName={theme.storeName}
                                    logoUrl={theme.logoUrl}
                                    mpNickname="Mercado Pago"
                                    canProcessPayments={false}
                                />
                            )}

                            {previewTab !== 'menu' && (
                                <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-8 animate-in fade-in duration-500">
                                    <div className="size-20 bg-white/5 rounded-3xl flex items-center justify-center mb-8 border border-white/5 shadow-2xl">
                                        <span className="material-symbols-outlined text-4xl text-neon">person</span>
                                    </div>

                                    <h3 className="text-2xl font-black italic-black text-white text-center uppercase leading-none mb-1">
                                        CREA TU PERFIL
                                    </h3>
                                    <h3 className="text-2xl font-black italic-black text-white text-center uppercase leading-none mb-6">
                                        PARA PEDIR
                                    </h3>

                                    <p className="text-center text-xs font-bold text-white/40 leading-relaxed mb-8 max-w-[240px]">
                                        Pide desde la mesa, paga sin esperas y acumula granos para cafés gratis.
                                    </p>

                                    <button className="w-full py-4 bg-neon rounded-full font-black text-[10px] uppercase tracking-widest text-black mb-4 hover:scale-105 transition-transform flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(74,222,128,0.3)]">
                                        CREAR PERFIL (1 MIN)
                                        <span className="material-symbols-outlined text-sm">bolt</span>
                                    </button>

                                    <button
                                        onClick={() => setPreviewTab('menu')}
                                        className="w-full py-4 bg-transparent border border-white/10 rounded-full font-black text-[9px] uppercase tracking-widest text-white hover:bg-white/5 transition-colors"
                                    >
                                        VER CÓMO FUNCIONA
                                    </button>

                                    <div className="absolute bottom-12 flex items-center gap-3 opacity-30">
                                        <span className="material-symbols-outlined text-xs">verified_user</span>
                                        <span className="text-[7px] font-black uppercase tracking-[0.3em]">SEGURO • RÁPIDO • SIMPLE</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Bottom Nav Simulation - OUTSIDE scroll container, ABSOLUTE positioned */}
                        <div className="absolute bottom-0 left-0 right-0 z-40">
                            <nav className="bg-black/95 backdrop-blur-2xl border-t border-white/5 pb-6 pt-2 px-8">
                                <div className="flex justify-between items-center h-16">
                                    {[
                                        { id: 'menu', icon: 'restaurant_menu', label: 'Menú' },
                                        { id: 'club', icon: 'stars', label: 'Club' },
                                        { id: 'profile', icon: 'person', label: 'Perfil' }
                                    ].map((item) => {
                                        const isActive = previewTab === item.id;
                                        return (
                                            <button
                                                key={item.id}
                                                onClick={() => setPreviewTab(item.id as any)}
                                                className="relative flex flex-col items-center justify-center gap-1 group transition-all duration-300"
                                                style={{ color: isActive ? theme.accentColor : '#64748b', transform: isActive ? 'scale(1.1)' : 'scale(1)' }}
                                            >
                                                <div
                                                    className="absolute inset-0 -mx-4 -my-1 rounded-2xl transition-all duration-500"
                                                    style={{ backgroundColor: isActive ? `${theme.accentColor}10` : 'transparent', opacity: isActive ? 1 : 0 }}
                                                />

                                                <span className={`material-symbols-outlined transition-all duration-300 ${isActive ? 'fill-icon' : 'scale-90'}`}>
                                                    {item.icon}
                                                </span>

                                                <span className={`text-[9px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${isActive ? 'opacity-100' : 'opacity-60'}`}>
                                                    {item.label}
                                                </span>

                                                {isActive && (
                                                    <div
                                                        className="absolute -top-3 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full animate-in fade-in slide-in-from-top-1"
                                                        style={{ backgroundColor: theme.accentColor, boxShadow: `0 0 12px ${theme.accentColor}` }}
                                                    />
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            </nav>
                        </div>
                    </div>
                </div>
            </div >



            {/* Item Selector Modal - Mantained Logic but updated UI */}
            {
                showItemSelector && (
                    <div className="fixed inset-0 z-[300] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
                        <div className="bg-[#141714] border border-white/10 rounded-[2.5rem] w-full max-w-lg overflow-hidden shadow-[0_0_100px_rgba(74,222,128,0.1)]">
                            <div className="p-8 border-b border-white/5 flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tight">Vincular {linkType === 'addon' ? 'Adicional' : 'Componente'}</h3>
                                    <p className="text-xs text-[#A1A1AA]">Selecciona un item de tu inventario base.</p>
                                </div>
                                <button onClick={() => setShowItemSelector(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-all"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="p-4 bg-black/20">
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#52525B]" />
                                    <input
                                        className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm focus:border-[#4ADE80]/50 outline-none transition-all"
                                        placeholder="Buscar por nombre o SKU..."
                                        value={itemSelectorSearch}
                                        onChange={(e) => setItemSelectorSearch(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex-1 max-h-[400px] overflow-y-auto p-4 space-y-2 custom-scrollbar">
                                {items.filter(i => i.id !== selectedItem?.id && i.name.toLowerCase().includes(itemSelectorSearch.toLowerCase())).map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => handleAddLink(item)}
                                        className="w-full flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5 hover:border-[#4ADE80]/50 hover:bg-[#4ADE80]/5 transition-all text-left"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-black/40 rounded-xl overflow-hidden border border-white/10 flex items-center justify-center">
                                                {item.image_url ? <img src={item.image_url} className="w-full h-full object-cover" /> : <Coffee className="w-5 h-5 text-[#52525B]" />}
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black">{item.name}</h4>
                                                <p className="text-[10px] text-[#52525B] font-mono uppercase italic">{item.sku}</p>
                                            </div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-[#52525B]" />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Editor Lateral (Variants, Addons) - Hidden if styling tab active on small screens for clarity */}
            {
                editingId && (activeTab === 'INVENTARIO' || activeTab === 'LÓGICA') && (
                    <div className={`fixed inset-y-0 right-0 z-[100] w-full max-w-[650px] bg-[#141714] border-l border-white/[0.04] shadow-2xl transition-transform duration-500 ease-out flex flex-col translate-x-0`}>
                        {selectedItem ? (
                            <>
                                <div className="p-8 flex justify-between items-center border-b border-white/[0.02]">
                                    <div className="flex items-center gap-5">
                                        <img src={selectedItem.image_url || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200'} className="size-16 rounded-2xl object-cover border border-white/10" />
                                        <div>
                                            <h3 className="text-2xl font-black italic-black text-white uppercase tracking-tighter leading-none">{selectedItem.name}</h3>
                                            <p className="text-[10px] font-bold text-text-secondary uppercase mt-1 opacity-60 tracking-widest">SKU: {selectedItem.sku || 'N/A'}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => setEditingId(null)} className="size-12 rounded-2xl bg-white/5 flex items-center justify-center text-white/40 hover:text-white transition-colors">
                                        <span className="material-symbols-outlined text-2xl font-bold">close</span>
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto p-8 space-y-12 no-scrollbar pb-32">
                                    {/* SECCIÓN BASE */}
                                    <div className="space-y-4">
                                        <h4 className="text-[10px] font-black uppercase text-text-secondary tracking-[0.2em] mb-2 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-sm">edit</span> Información Base
                                        </h4>
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Nombre Público</label>
                                            <input
                                                type="text"
                                                value={selectedItem.name}
                                                onChange={(e) => updateItemDebounced(selectedItem.id, { name: e.target.value })}
                                                className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-white font-black text-sm outline-none focus:ring-1 focus:ring-neon/30 uppercase"
                                                placeholder="Nombre del producto en el menú..."
                                            />
                                        </div>
                                        <div className="space-y-4">
                                            {/* FINANCIAL DASHBOARD - SYNCHRONIZED */}
                                            {(() => {
                                                let currentCost = selectedItem.cost || 0;
                                                const breakdown: { name: string, qty: string, cost: number, unit?: string }[] = [];

                                                if (selectedItem.id_source === 'product') {
                                                    let theoretical = 0;
                                                    (selectedItem.recipe || []).forEach(r => {
                                                        const comp = items.find(i => i.id === (r as any).inventory_item_id);
                                                        if (comp) {
                                                            const itemCost = (comp.cost || 0) * (parseFloat((r as any).quantity) || 0);
                                                            theoretical += itemCost;
                                                            breakdown.push({
                                                                name: comp.name,
                                                                qty: `${(r as any).quantity}`,
                                                                unit: comp.unit_type || 'u',
                                                                cost: itemCost
                                                            });
                                                        }
                                                    });
                                                    (selectedItem.combo_links || []).forEach(l => {
                                                        const comp = items.find(i => i.id === l.component_item_id);
                                                        if (comp) {
                                                            const itemCost = (comp.cost || 0) * (parseFloat(l.quantity as any) || 1);
                                                            theoretical += itemCost;
                                                            breakdown.push({
                                                                name: comp.name,
                                                                qty: `${l.quantity} ${comp.unit || 'u'}`,
                                                                cost: itemCost
                                                            });
                                                        }
                                                    });
                                                    if (theoretical > 0) currentCost = theoretical;
                                                }

                                                const profit = (selectedItem.price || 0) - currentCost;
                                                const margin = (selectedItem.price || 0) > 0 ? (profit / (selectedItem.price || 0)) * 100 : 0;

                                                // Sync Handlers
                                                // Sync Handlers
                                                const handlePriceChange = (newPrice: number) => {
                                                    updateItemImmediate(selectedItem.id, { price: Math.round(newPrice * 100) / 100 });
                                                };

                                                const handleMarginChange = (targetMargin: number) => {
                                                    if (currentCost <= 0) return;
                                                    // Price = Cost / (1 - margin/100)
                                                    const newPrice = currentCost / (1 - targetMargin / 100);
                                                    if (newPrice > 0 && isFinite(newPrice)) {
                                                        updateItemImmediate(selectedItem.id, { price: Math.round(newPrice * 100) / 100 });
                                                    }
                                                };

                                                const handleFinancialInput = (type: 'price' | 'margin' | 'profit', valueStr: string) => {
                                                    setFinancialBuffer(valueStr);
                                                    const val = parseFloat(valueStr);

                                                    if (isNaN(val)) return;

                                                    if (type === 'price') {
                                                        // Use debounced for price input to prevent UI jumping/excessive writes
                                                        updateItemDebounced(selectedItem.id, { price: val });
                                                    } else if (type === 'margin') {
                                                        // Margin logic: Price = Cost / (1 - Margin/100)
                                                        if (currentCost > 0 && val < 100) {
                                                            const newPrice = currentCost / (1 - val / 100);
                                                            updateItemDebounced(selectedItem.id, { price: Math.round(newPrice * 100) / 100 });
                                                        }
                                                    } else if (type === 'profit') {
                                                        // Profit logic: Price = Cost + Profit
                                                        const newPrice = currentCost + val;
                                                        if (newPrice >= 0) {
                                                            updateItemDebounced(selectedItem.id, { price: Math.round(newPrice * 100) / 100 });
                                                        }
                                                    }
                                                };

                                                return (
                                                    <div className="space-y-4">
                                                        <div className="grid grid-cols-2 gap-4">
                                                            {/* COL 1: PRICE & COST */}
                                                            <div className="space-y-4">
                                                                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-center">
                                                                    <span className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">Precio de Venta ($)</span>
                                                                    <div className="relative group/price flex items-center gap-2">
                                                                        <input
                                                                            type="number"
                                                                            value={activeFinancialInput === 'price' ? financialBuffer : (selectedItem.price || 0)}
                                                                            onChange={(e) => handleFinancialInput('price', e.target.value)}
                                                                            onFocus={() => { setActiveFinancialInput('price'); setFinancialBuffer((selectedItem.price || 0).toString()); }}
                                                                            onBlur={() => {
                                                                                setActiveFinancialInput(null);
                                                                                // Force save on blur
                                                                                if (financialBuffer) {
                                                                                    updateItemImmediate(selectedItem.id, { price: parseFloat(financialBuffer) });
                                                                                }
                                                                            }}
                                                                            className="w-full bg-transparent border-b border-dashed border-white/10 text-xl font-black text-white outline-none focus:border-neon/50 transition-all"
                                                                        />
                                                                        <button
                                                                            onClick={() => {
                                                                                if (activeFinancialInput === 'price') {
                                                                                    updateItemImmediate(selectedItem.id, { price: parseFloat(financialBuffer) });
                                                                                    setActiveFinancialInput(null);
                                                                                }
                                                                            }}
                                                                            className={`h-6 px-3 rounded bg-neon/10 border border-neon/20 text-[9px] font-black text-neon hover:bg-neon hover:text-black transition-all uppercase flex items-center gap-1 ${activeFinancialInput === 'price' ? 'opacity-100 scale-100' : 'opacity-0 scale-90 pointer-events-none'}`}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[10px]">save</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex flex-col justify-center opacity-60">
                                                                    <span className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em] mb-1">Costo de Producto</span>
                                                                    <div className="flex items-baseline gap-1">
                                                                        <span className="text-xl font-black text-white">${currentCost.toFixed(2)}</span>
                                                                        <span className="text-[8px] font-bold text-white/20 uppercase">Unitario</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* COL 2: RENTABILIDAD & MARGEN */}
                                                            <div className={`p-4 rounded-2xl border flex flex-col justify-center transition-all ${profit > 0
                                                                ? 'bg-neon/5 border-neon/10'
                                                                : (selectedItem.price || 0) === 0 ? 'bg-red-500/5 border-red-500/10' : 'bg-orange-500/5 border-orange-500/10'
                                                                }`}>
                                                                <div className="flex justify-between items-center mb-3">
                                                                    <span className="text-[8px] font-bold text-white/30 uppercase tracking-[0.2em]">Rentabilidad</span>
                                                                    <div className="flex items-center gap-1">
                                                                        <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${profit > 0 ? 'bg-neon/10 text-neon' : 'bg-red-500/10 text-red-400'}`}>
                                                                            {profit > 0 ? 'Saludable' : 'Alerta'}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-4">
                                                                    {/* % Margin Input */}
                                                                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                                                        <span className="text-[9px] font-bold text-white/40 uppercase">Margen %</span>
                                                                        <div className="flex items-center gap-1">
                                                                            <input
                                                                                type="number"
                                                                                value={activeFinancialInput === 'margin' ? financialBuffer : Math.round(margin)}
                                                                                onChange={(e) => handleFinancialInput('margin', e.target.value)}
                                                                                onFocus={() => { setActiveFinancialInput('margin'); setFinancialBuffer(Math.round(margin).toString()); }}
                                                                                onBlur={() => setActiveFinancialInput(null)}
                                                                                className={`w-14 bg-transparent text-xl font-black text-right focus:outline-none transition-all ${profit > 0 ? 'text-neon' : 'text-red-400'}`}
                                                                                disabled={currentCost <= 0}
                                                                            />
                                                                            <span className={`text-sm font-black ${profit > 0 ? 'text-neon' : 'text-red-400'}`}>%</span>
                                                                        </div>
                                                                    </div>

                                                                    {/* $ Profit Input */}
                                                                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                                                        <span className="text-[9px] font-bold text-white/40 uppercase">Ganancia $</span>
                                                                        <div className="flex items-center gap-1">
                                                                            <span className="text-sm font-black text-white/20">$</span>
                                                                            <input
                                                                                type="number"
                                                                                value={activeFinancialInput === 'profit' ? financialBuffer : profit.toFixed(2)}
                                                                                onChange={(e) => handleFinancialInput('profit', e.target.value)}
                                                                                onFocus={() => { setActiveFinancialInput('profit'); setFinancialBuffer(profit.toFixed(2)); }}
                                                                                onBlur={() => setActiveFinancialInput(null)}
                                                                                className="w-24 bg-transparent text-xl font-black text-white text-right focus:outline-none transition-all"
                                                                                disabled={currentCost <= 0}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {currentCost <= 0 && (
                                                                    <span className="text-[7px] text-white/20 uppercase mt-2 text-center">Falta definir costos</span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* RECIPE BREAKDOWN */}
                                                        {breakdown.length > 0 && (
                                                            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 space-y-3">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className="material-symbols-outlined text-sm text-white/30">list_alt</span>
                                                                    <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Desglose de Receta / Costos</span>
                                                                </div>
                                                                <div className="space-y-2">
                                                                    {breakdown.map((b, idx) => (
                                                                        <div key={idx} className="flex justify-between items-center text-[10px] border-b border-white/[0.02] pb-1 last:border-0">
                                                                            <div className="flex flex-col">
                                                                                <span className="font-bold text-white/70 uppercase">{b.name}</span>
                                                                                <span className="text-[8px] text-white/20">{b.qty} {b.unit}</span>
                                                                            </div>
                                                                            <div className="flex flex-col items-end">
                                                                                <span className="font-black text-white/60">${b.cost.toFixed(2)}</span>
                                                                                <span className="text-[7px] text-white/20">{((b.cost / currentCost) * 100).toFixed(0)}% del costo</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                    <div className="flex justify-between items-center pt-2 mt-1 border-t border-white/5">
                                                                        <span className="text-[9px] font-black text-white/40 uppercase">Total Teórico</span>
                                                                        <span className="text-[11px] font-black text-neon">${currentCost.toFixed(2)}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* IMAGE SECTOR (Moved here for better grid balance) */}
                                                        <div className="space-y-2">
                                                            <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Imagen Cover</label>
                                                            <div
                                                                className={`h-16 rounded-xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:border-neon/40 transition-all overflow-hidden relative group/img ${isDragging ? 'bg-neon/10 border-neon' : ''}`}
                                                                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                                                                onDragLeave={() => setIsDragging(false)}
                                                                onDrop={handleImageDrop}
                                                                onClick={() => document.getElementById('item-image-input')?.click()}
                                                            >
                                                                {selectedItem.image_url ? (
                                                                    <>
                                                                        <img src={selectedItem.image_url} className="absolute inset-0 size-full object-cover opacity-50 group-hover/img:opacity-30 transition-opacity" />
                                                                        <span className="relative z-10 text-[9px] font-bold text-white shadow-black drop-shadow-md uppercase tracking-widest">{isDragging ? 'SOLTAR' : 'CAMBIAR IMAGEN'}</span>
                                                                    </>
                                                                ) : (
                                                                    <span className="text-[9px] font-bold text-white/30 uppercase tracking-widest">{isDragging ? 'SOLTAR AQUÍ' : 'SUBIR / ARRASTRAR'}</span>
                                                                )}
                                                                <input id="item-image-input" type="file" accept="image/*" className="hidden" onChange={handleImageFileSelect} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex justify-between">
                                                <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Descripción Menú</label>
                                                <button onClick={handleAIDescription} className="text-[8px] font-black text-neon uppercase tracking-widest flex items-center gap-1 hover:text-white transition-colors" disabled={isGeneratingAI}>
                                                    <span className="material-symbols-outlined text-xs">{isGeneratingAI ? 'sync' : 'auto_awesome'}</span>
                                                    {isGeneratingAI ? 'Generando...' : 'Generar con AI'}
                                                </button>
                                            </div>
                                            <textarea
                                                value={selectedItem.description || ''}
                                                onChange={(e) => updateItemDebounced(selectedItem.id, { description: e.target.value })}
                                                className="w-full h-24 p-4 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-medium leading-relaxed outline-none focus:ring-1 focus:ring-neon/30 resize-none"
                                                placeholder="Descripción corta para el menú digital..."
                                            />
                                        </div>
                                    </div>

                                    {/* SECCIÓN COMBOS/PACKS (SOLO TIPO PACK) */}
                                    {selectedItem.item_type === 'pack' && (
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                                <h4 className="text-[10px] font-black uppercase text-text-secondary tracking-[0.2em] flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm">widgets</span> Configuración de Combo/Pack
                                                </h4>
                                                <button
                                                    onClick={() => {
                                                        const currentCombo = selectedItem.combo_links || [];
                                                        const newLink = { id: crypto.randomUUID(), component_item_id: '', quantity: 1 };
                                                        updateItemImmediate(selectedItem.id, { combo_links: [...currentCombo, newLink] });
                                                    }}
                                                    className="text-[8px] font-black bg-neon/10 hover:bg-neon/20 text-neon px-3 py-1.5 rounded-lg uppercase tracking-widest transition-all border border-neon/20"
                                                >
                                                    + Agregar Item al Pack
                                                </button>
                                            </div>
                                            <div className="space-y-3">
                                                {(selectedItem.combo_links || []).map((comboLink, idx) => {
                                                    const linkedItem = items.find(i => i.id === comboLink.component_item_id);
                                                    return (
                                                        <div key={idx} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3 group hover:border-white/10 transition-all">
                                                            <div className="grid grid-cols-12 gap-3 items-end">
                                                                <div className="col-span-8 space-y-1">
                                                                    <label className="text-[7px] font-bold text-white/30 uppercase tracking-widest block">Item del Inventario</label>
                                                                    <button
                                                                        onClick={() => {
                                                                            setEditingComboItemId(idx);
                                                                            setEditingAddonId(null);
                                                                            setItemSelectorSearch('');
                                                                            setShowItemSelector(true);
                                                                        }}
                                                                        className="w-full h-9 px-3 rounded-lg bg-black/20 border border-white/10 flex items-center justify-between text-[9px] font-bold text-white uppercase outline-none hover:border-neon/30 hover:bg-white/10 transition-all text-left truncate"
                                                                    >
                                                                        <div className="flex items-center gap-2 truncate">
                                                                            {linkedItem && <img src={linkedItem.image_url} className="size-5 rounded bg-black/40 object-cover" />}
                                                                            <span className="truncate">
                                                                                {linkedItem?.name || 'SELECCIONAR ITEM...'}
                                                                            </span>
                                                                        </div>
                                                                        <span className="material-symbols-outlined text-xs opacity-50">search</span>
                                                                    </button>
                                                                </div>
                                                                <div className="col-span-3 space-y-1">
                                                                    <label className="text-[7px] font-bold text-white/30 uppercase tracking-widest block">Cant.</label>
                                                                    <div className="relative">
                                                                        <input
                                                                            type="number"
                                                                            value={comboLink.quantity || 1}
                                                                            onChange={(e) => {
                                                                                const newCombo = [...(selectedItem.combo_links || [])];
                                                                                newCombo[idx] = { ...newCombo[idx], quantity: parseFloat(e.target.value) || 1 };
                                                                                updateItemDebounced(selectedItem.id, { combo_links: newCombo });
                                                                            }}
                                                                            className="w-full h-9 pl-3 pr-2 rounded-lg bg-black/20 border border-white/10 text-[10px] font-black text-white outline-none focus:border-neon/30"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="col-span-1">
                                                                    <button
                                                                        onClick={() => {
                                                                            const newCombo = (selectedItem.combo_links || []).filter((_, i) => i !== idx);
                                                                            updateItemImmediate(selectedItem.id, { combo_links: newCombo });
                                                                        }}
                                                                        className="size-9 rounded-lg bg-white/5 flex items-center justify-center text-white/20 hover:text-red-500 hover:bg-red-500/10 transition-all border border-transparent hover:border-red-500/20"
                                                                    >
                                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                {(!selectedItem.combo_links || selectedItem.combo_links.length === 0) && (
                                                    <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
                                                        <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Pack Metadato Vacío</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                            <h4 className="text-[10px] font-black uppercase text-text-secondary tracking-[0.2em] flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm">style</span> Variantes (Tamaños/Tipos)
                                            </h4>
                                            <button onClick={handleAddVariant} className="text-[8px] font-black bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg uppercase tracking-widest text-white transition-all border border-white/5">
                                                + Agregar Opción
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {selectedItem.variants?.map((variant, idx) => (
                                                <div key={variant.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 flex gap-4 items-start group hover:border-white/10 transition-all">
                                                    <div className="flex-1 space-y-2">
                                                        <div className="flex gap-2">
                                                            <input
                                                                value={variant.name}
                                                                onChange={(e) => handleUpdateVariant(variant.id, 'name', e.target.value)}
                                                                className="flex-1 h-9 px-3 rounded-lg bg-black/20 border border-white/10 text-[10px] font-bold text-white uppercase outline-none focus:border-neon/30 placeholder:text-white/20"
                                                                placeholder="NOMBRE (EJ: GRANDE)"
                                                            />
                                                            <div className="relative w-24">
                                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-white/30">$</span>
                                                                <input
                                                                    type="number"
                                                                    value={variant.price_adjustment}
                                                                    onChange={(e) => handleUpdateVariant(variant.id, 'price_adjustment', parseFloat(e.target.value) || 0)}
                                                                    className={`w-full h-9 pl-5 pr-2 rounded-lg bg-black/20 border border-white/10 text-[10px] font-black text-right outline-none focus:border-neon/30 ${variant.price_adjustment > 0 ? 'text-neon' : variant.price_adjustment < 0 ? 'text-red-400' : 'text-white'}`}
                                                                    placeholder="0"
                                                                />
                                                            </div>
                                                        </div>
                                                        <div className="flex justify-between items-center px-1">
                                                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest" title="Define qué insumos extra consume esta variante">Impacto en Inventario: {variant.recipe_overrides?.length || 0} ítems</span>
                                                            <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">
                                                                Precio Final: <span className="text-white">${((selectedItem.price || 0) + variant.price_adjustment).toFixed(2)}</span>
                                                            </span>
                                                        </div>

                                                        {/* GLOBAL RECIPE MULTIPLIER */}
                                                        <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-transparent border border-purple-500/20">
                                                            <span className="material-symbols-outlined text-purple-400 text-base">percent</span>
                                                            <div className="flex-1">
                                                                <label className="text-[8px] font-bold text-purple-300 uppercase tracking-widest block">Multiplicador Receta Base</label>
                                                                <span className="text-[7px] text-white/30">Ej: 1.5 = usa 50% más de todos los ingredientes</span>
                                                            </div>
                                                            <div className="relative">
                                                                <input
                                                                    type="number"
                                                                    value={variant.recipe_multiplier ?? 1}
                                                                    onChange={(e) => handleUpdateVariant(variant.id, 'recipe_multiplier', parseFloat(e.target.value) || 1)}
                                                                    className="w-16 h-8 bg-black/30 border border-purple-500/30 rounded-lg px-2 text-[10px] font-black text-purple-300 text-right outline-none focus:border-purple-500"
                                                                    step={0.1}
                                                                    min={0.1}
                                                                />
                                                                <span className="absolute right-8 top-1/2 -translate-y-1/2 text-[9px] text-purple-400/50 font-bold pointer-events-none">x</span>
                                                            </div>
                                                        </div>

                                                        {/* STOCK OVERRIDES UI */}
                                                        <div className="pt-2 border-t border-white/5 space-y-2">
                                                            {variant.recipe_overrides?.map((ov, ovIdx) => {
                                                                const ovItem = items.find(i => i.id === ov.ingredient_id);
                                                                const isMultiplier = ov.consumption_type === 'multiplier';

                                                                return (
                                                                    <div key={ovIdx} className="flex items-center gap-2 p-2 rounded-lg bg-black/40 border border-white/5 group/ov">
                                                                        <div className="flex-1 text-[9px] font-bold text-white/60 truncate">
                                                                            {ovItem?.name || 'Insumo Desconocido'}
                                                                        </div>

                                                                        {/* TYPE TOGGLE */}
                                                                        <button
                                                                            onClick={() => {
                                                                                const newOverrides = [...(variant.recipe_overrides || [])];
                                                                                const newType = isMultiplier ? 'fixed' : 'multiplier';
                                                                                // Reset value to sensible default when switching
                                                                                const newValue = newType === 'multiplier' ? 1.5 : 0;
                                                                                newOverrides[ovIdx] = {
                                                                                    ...ov,
                                                                                    consumption_type: newType,
                                                                                    value: newValue,
                                                                                    quantity_delta: newType === 'fixed' ? newValue : 0 // Update legacy field
                                                                                };
                                                                                handleUpdateVariant(variant.id, 'recipe_overrides', newOverrides);
                                                                            }}
                                                                            className={`w-6 h-7 rounded border text-[8px] font-black uppercase flex items-center justify-center transition-all ${isMultiplier ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-white/5 border-white/10 text-white/40'}`}
                                                                            title={isMultiplier ? "Modo Multiplicador (Ej: 1.5x)" : "Modo Cantidad Fija (Ej: +50ml)"}
                                                                        >
                                                                            {isMultiplier ? 'X' : '+'}
                                                                        </button>

                                                                        <div className="relative">
                                                                            <input
                                                                                type="number"
                                                                                value={isMultiplier ? (ov.value || 1) : (ov.quantity_delta || 0)}
                                                                                onChange={(e) => {
                                                                                    const val = parseFloat(e.target.value) || 0;
                                                                                    const newOverrides = [...(variant.recipe_overrides || [])];
                                                                                    newOverrides[ovIdx] = {
                                                                                        ...ov,
                                                                                        value: val,
                                                                                        quantity_delta: isMultiplier ? 0 : val // Only set pure delta if fixed
                                                                                    };
                                                                                    handleUpdateVariant(variant.id, 'recipe_overrides', newOverrides);
                                                                                }}
                                                                                className={`w-16 h-7 bg-white/5 border border-white/10 rounded px-2 text-[9px] font-black text-right outline-none focus:border-neon/30 ${isMultiplier ? 'text-purple-400' : 'text-white'}`}
                                                                                step={isMultiplier ? 0.1 : 1}
                                                                            />
                                                                            {isMultiplier && <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[8px] text-purple-400/50 pointer-events-none">x</span>}
                                                                        </div>

                                                                        <span className="text-[8px] font-bold text-white/20 w-6 uppercase">
                                                                            {isMultiplier ? 'BASE' : (ovItem?.unit_type || 'un')}
                                                                        </span>

                                                                        <button
                                                                            onClick={() => {
                                                                                const newOverrides = variant.recipe_overrides?.filter((_, i) => i !== ovIdx);
                                                                                handleUpdateVariant(variant.id, 'recipe_overrides', newOverrides);
                                                                            }}
                                                                            className="size-6 flex items-center justify-center rounded bg-white/5 text-white/20 hover:text-red-400 opacity-0 group-hover/ov:opacity-100 transition-all"
                                                                        >
                                                                            <span className="material-symbols-outlined text-xs">close</span>
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                            <button
                                                                onClick={() => {
                                                                    setEditingId(selectedItem.id);
                                                                    setEditingAddonId(variant.id);
                                                                    setLinkType('variant_override' as any);
                                                                    setShowItemSelector(true);
                                                                }}
                                                                className="w-full h-7 border border-dashed border-white/10 rounded-lg text-[8px] font-bold text-white/30 hover:text-white/60 hover:border-white/20 transition-all uppercase tracking-widest"
                                                            >
                                                                + Añadir Consumo Extra
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => handleRemoveVariant(variant.id)} className="size-9 rounded-lg bg-white/5 flex items-center justify-center text-white/20 hover:text-red-500 hover:bg-red-500/10 transition-all">
                                                        <span className="material-symbols-outlined text-base">delete</span>
                                                    </button>
                                                    <button onClick={() => handleDeleteProduct(selectedItem)} className="w-full mt-12 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 font-bold text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all">
                                                        Eliminar Producto
                                                    </button>
                                                </div>
                                            ))}
                                            {(!selectedItem.variants || selectedItem.variants.length === 0) && (
                                                <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
                                                    <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Sin variantes configuradas</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* SECCIÓN EXTRAS Y ADICIONALES */}
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                            <h4 className="text-[10px] font-black uppercase text-text-secondary tracking-[0.2em] flex items-center gap-2">
                                                <span className="material-symbols-outlined text-sm">extension</span> Extras & Adicionales
                                            </h4>
                                            <button onClick={handleAddAddon} className="text-[8px] font-black bg-neon/10 hover:bg-neon/20 text-neon px-3 py-1.5 rounded-lg uppercase tracking-widest transition-all border border-neon/20">
                                                + Crear Extra
                                            </button>
                                        </div>
                                        <div className="space-y-4">
                                            {selectedItem.addon_links?.map((addon, idx) => {
                                                // Cálculo de rentabilidad del addon
                                                const linkedItem = items.find(i => i.id === addon.inventory_item_id);
                                                const cost = linkedItem ? linkedItem.cost * (addon.quantity_consumed || 0) : 0;
                                                const profit = addon.price - cost;
                                                const margin = addon.price > 0 ? (profit / addon.price) * 100 : 0;

                                                return (
                                                    <div key={addon.id} className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3 group hover:border-white/10 transition-all">
                                                        <div className="flex gap-2">
                                                            <input
                                                                value={addon.name}
                                                                onChange={(e) => handleUpdateAddon(addon.id, 'name', e.target.value)}
                                                                className="flex-1 h-9 px-3 rounded-lg bg-black/20 border border-white/10 text-[10px] font-bold text-white uppercase outline-none focus:border-neon/30 placeholder:text-white/20"
                                                                placeholder="NOMBRE DEL EXTRA (EJ: LECHE ALMENDRA)"
                                                            />
                                                            <div className="relative w-32 flex items-center gap-1">
                                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-neon">$</span>
                                                                <input
                                                                    type="number"
                                                                    value={addon.price}
                                                                    onChange={(e) => handleUpdateAddon(addon.id, 'price', parseFloat(e.target.value) || 0)}
                                                                    className="w-full h-9 pl-5 pr-8 rounded-lg bg-black/20 border border-white/10 text-[10px] font-black text-white text-right outline-none focus:border-neon/30"
                                                                    placeholder="PRECIO"
                                                                />
                                                                <button
                                                                    onClick={() => {
                                                                        const linked = items.find(i => i.id === addon.inventory_item_id);
                                                                        const cost = linked ? linked.cost * (addon.quantity_consumed || 0) : 0;
                                                                        const suggestedPrice = cost * 3;
                                                                        handleUpdateAddon(addon.id, 'price', parseFloat(suggestedPrice.toFixed(2)));
                                                                    }}
                                                                    title="Auto-calcular (Costo x 3)"
                                                                    className="absolute right-1 top-1/2 -translate-y-1/2 size-7 flex items-center justify-center rounded-md bg-white/5 text-neon hover:bg-neon/20 transition-all"
                                                                >
                                                                    <span className="material-symbols-outlined text-xs">bolt</span>
                                                                </button>
                                                            </div>
                                                            <button
                                                                onClick={saveItemChanges}
                                                                title="Guardar Cambios de Extras"
                                                                className="size-9 rounded-lg bg-neon/10 border border-neon/30 flex items-center justify-center text-neon hover:bg-neon hover:text-black transition-all"
                                                            >
                                                                <span className="material-symbols-outlined text-base">save</span>
                                                            </button>
                                                            <button onClick={() => handleRemoveAddon(addon.id)} className="size-9 rounded-lg bg-white/5 flex items-center justify-center text-white/20 hover:text-red-500 hover:bg-red-500/10 transition-all">
                                                                <span className="material-symbols-outlined text-base">delete</span>
                                                            </button>
                                                        </div>

                                                        {/* ENLACE CON INVENTARIO */}
                                                        <div className="p-3 bg-black/20 rounded-lg border border-white/5 grid grid-cols-12 gap-3 items-end">
                                                            <div className="col-span-6 space-y-1">
                                                                <label className="text-[7px] font-bold text-white/30 uppercase tracking-widest block">Insumo Consumido</label>
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingAddonId(addon.id);
                                                                        setItemSelectorSearch('');
                                                                        setShowItemSelector(true);
                                                                    }}
                                                                    className="w-full h-8 px-2 rounded-md bg-white/5 border border-white/5 flex items-center justify-between text-[9px] font-bold text-white uppercase outline-none hover:border-neon/30 hover:bg-white/10 transition-all text-left truncate"
                                                                >
                                                                    <span className="truncate">
                                                                        {items.find(i => i.id === addon.inventory_item_id)?.name || 'SELECCIONAR INSUMO...'}
                                                                    </span>
                                                                    <span className="material-symbols-outlined text-xs opacity-50">search</span>
                                                                </button>
                                                            </div>
                                                            <div className="col-span-3 space-y-1">
                                                                <label className="text-[7px] font-bold text-white/30 uppercase tracking-widest block">Cantidad</label>
                                                                <div className="relative">
                                                                    <input
                                                                        type="number"
                                                                        value={addon.quantity_consumed || 0}
                                                                        onChange={(e) => handleUpdateAddon(addon.id, 'quantity_consumed', parseFloat(e.target.value) || 0)}
                                                                        className="w-full h-8 pl-2 pr-8 rounded-md bg-white/5 border border-white/5 text-[9px] font-bold text-white outline-none focus:border-neon/30"
                                                                        step={0.001}
                                                                    />
                                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[7px] font-bold text-white/30">{linkedItem?.unit_type || 'UN'}</span>

                                                                    {(linkedItem?.unit_type === 'kg' || linkedItem?.unit_type === 'l' || linkedItem?.unit_type === 'liter' || linkedItem?.unit_type === 'lt') && (
                                                                        <div className="absolute top-full right-0 bg-black/90 text-white text-[9px] px-2 py-1 rounded mt-2 opacity-0 group-hover/qty:opacity-100 transition-opacity pointer-events-none z-10 border border-white/10 w-max font-bold shadow-xl">
                                                                            {(addon.quantity_consumed * 1000).toFixed(1)} {linkedItem.unit_type === 'kg' ? 'g' : 'ml'}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="col-span-3">
                                                                <div className={`h-8 rounded-md flex flex-col justify-center items-center border ${profit > 0 ? 'bg-neon/5 border-neon/20' : 'bg-red-500/5 border-red-500/20'}`}>
                                                                    <span className={`text-[7px] font-black uppercase tracking-widest ${profit > 0 ? 'text-neon' : 'text-red-400'}`}>
                                                                        {profit > 0 ? `+${margin.toFixed(0)}%` : 'PERDIDA'}
                                                                    </span>
                                                                    <span className="text-[7px] font-bold text-white/40 uppercase">
                                                                        Costo: ${cost.toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {(!selectedItem.addon_links || selectedItem.addon_links.length === 0) && (
                                                <div className="text-center py-6 border border-dashed border-white/10 rounded-xl">
                                                    <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Sin extras configurados</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center p-12 text-center opacity-20 italic">
                                <span className="material-symbols-outlined text-6xl mb-4">ads_click</span>
                                <p className="text-sm font-black uppercase tracking-widest">Selecciona una unidad para operar.</p>
                            </div>
                        )}
                    </div>
                )
            }


            {/* ITEM SELECTOR MODAL */}
            {
                showItemSelector && (
                    <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
                        <div className="bg-[#141714] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-300">
                            <div className="p-6 border-b border-white/5 flex items-center justify-between">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest">Vincular Insumo</h3>
                                <button onClick={() => setShowItemSelector(false)} className="text-white/40 hover:text-white transition-colors">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="p-4 border-b border-white/5">
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/30">search</span>
                                    <input
                                        autoFocus
                                        value={itemSelectorSearch}
                                        onChange={(e) => setItemSelectorSearch(e.target.value)}
                                        placeholder="BUSCAR INSUMO..."
                                        className="w-full h-10 pl-10 pr-4 bg-black/40 border border-white/10 rounded-xl text-xs font-bold text-white uppercase outline-none focus:border-neon/50 placeholder:text-white/20 transition-all"
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                                {items
                                    .filter(i =>
                                    (i.name.toLowerCase().includes(itemSelectorSearch.toLowerCase()) ||
                                        i.sku.toLowerCase().includes(itemSelectorSearch.toLowerCase()))
                                    )
                                    .map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => {
                                                if (editingAddonId) {
                                                    handleUpdateAddon(editingAddonId, 'inventory_item_id', item.id);
                                                } else if (editingComboItemId !== null && selectedItem) {
                                                    const newCombo = [...(selectedItem.combo_links || [])];
                                                    if (newCombo[editingComboItemId]) {
                                                        newCombo[editingComboItemId] = { ...newCombo[editingComboItemId], component_item_id: item.id };
                                                        updateItemImmediate(selectedItem.id, { combo_links: newCombo });
                                                    }
                                                }
                                                setShowItemSelector(false);
                                            }}
                                            className="w-full text-left p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/5 flex items-center gap-3 group transition-all"
                                        >
                                            <div className="size-10 rounded-lg bg-black/40 border border-white/5 overflow-hidden shrink-0">
                                                <img src={item.image_url} className="size-full object-cover" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black text-white uppercase truncate">{item.name}</p>
                                                <p className="text-[8px] text-white/40 font-bold uppercase tracking-widest group-hover:text-neon/70 transition-colors">SKU: {item.sku} • Stock: {item.current_stock}</p>
                                            </div>
                                            <div className="text-right">
                                                <span className={`text-[9px] font-bold px-2 py-1 rounded-md ${item.item_type === 'ingredient' ? 'bg-indigo-500/10 text-indigo-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                                    {item.item_type === 'ingredient' ? 'INSUMO' : 'PROD'}
                                                </span>
                                            </div>
                                        </button>
                                    ))
                                }
                                {items.length === 0 && (
                                    <div className="p-8 text-center opacity-30">
                                        <p className="text-[10px] font-bold uppercase">No hay items disponibles</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

        </div >
    );
};

// Componentes Auxiliares
const ColorPicker: React.FC<{ label: string, color: string, onChange: (c: string) => void }> = ({ label, color, onChange }) => (
    <div className="bg-black/20 p-3 rounded-2xl border border-white/5">
        <label className="text-[10px] font-bold text-[#A1A1AA] uppercase tracking-[0.1em] mb-2 block">{label}</label>
        <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-xl overflow-hidden border border-white/10 shrink-0">
                <input
                    type="color"
                    value={color}
                    onChange={e => onChange(e.target.value)}
                    className="absolute -inset-2 w-[150%] h-[150%] cursor-pointer border-none p-0 bg-transparent"
                />
            </div>
            <input
                type="text"
                value={color}
                onChange={e => onChange(e.target.value)}
                className="w-full bg-transparent text-[10px] font-mono text-white/50 uppercase outline-none"
            />
        </div>
    </div>
);

const StyleBtn: React.FC<{ active: boolean, onClick: () => void, children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border transition-all ${active ? 'bg-[#4ADE80]/10 border-[#4ADE80]/20 text-[#4ADE80]' : 'bg-black/20 border-white/5 text-[#52525B] hover:bg-white/5'}`}
    >
        {children}
    </button>
);

const TabBtn: React.FC<{ active: boolean, onClick: () => void, icon?: string, children: React.ReactNode }> = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${active ? 'bg-[#141714] text-[#4ADE80] border border-[#4ADE80]/20' : 'text-[#52525B] hover:text-white'}`}
    >
        {children}
    </button>
);

const LogicRow: React.FC<{ label: string, value: number, onChange: (v: number) => void, unit?: string }> = ({ label, value, onChange, unit }) => (
    <div className="flex items-center justify-between p-3 bg-black/20 rounded-2xl border border-white/5">
        <label className="text-[10px] font-bold text-[#A1A1AA] uppercase">{label}</label>
        <div className="flex items-center gap-2">
            <input
                type="number"
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="w-16 bg-black/40 border border-white/10 rounded-lg px-2 py-1 text-right text-xs font-bold outline-none focus:border-[#4ADE80]/50"
            />
            {unit && <span className="text-[10px] font-bold text-[#52525B]">{unit}</span>}
        </div>
    </div>
);

const ChannelBtn: React.FC<{ icon: React.ReactNode, label: string, active: boolean, onClick: (v: boolean) => void }> = ({ icon, label, active, onClick }) => (
    <button
        onClick={() => onClick(!active)}
        className={`flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border transition-all ${active ? 'bg-[#4ADE80]/10 border-[#4ADE80]/20 text-[#4ADE80]' : 'bg-black/20 border-white/5 text-[#52525B] hover:opacity-100'}`}
    >
        <div className={`${active ? 'text-[#4ADE80]' : 'text-[#52525B]'}`}>{icon}</div>
        <span className="text-[9px] font-black uppercase tracking-widest leading-none">{label}</span>
    </button>
);

const Section: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <div className="bg-[#141714] border border-white/5 rounded-3xl p-4 shadow-2xl">
        <h3 className="text-xs font-black text-[#52525B] tracking-[0.2em] uppercase mb-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-[#4ADE80] rounded-full" />
            {title}
        </h3>
        {children}
    </div>
);

const Toggle: React.FC<{ label: string, active: boolean, onChange: (v: boolean) => void }> = ({ label, active, onChange }) => (
    <div className="flex items-center justify-between p-3 bg-black/20 rounded-2xl border border-white/5">
        <span className="text-[10px] font-bold text-[#A1A1AA] uppercase">{label}</span>
        <button
            onClick={() => onChange(!active)}
            className={`relative w-10 h-5 rounded-full transition-all duration-300 ${active ? 'bg-[#4ADE80]' : 'bg-white/10'}`}
        >
            <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${active ? 'left-6' : 'left-1'}`} />
        </button>
    </div>
);

export default MenuDesign;
