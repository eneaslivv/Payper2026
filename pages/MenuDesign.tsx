
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { InventoryItem, ProductVariant, ProductAddon, UnitType, RecipeComponent, Store } from '../types';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/ToastSystem';

interface MenuTheme {
    accentColor: string;
    borderRadius: 'none' | 'md' | 'xl' | 'full';
    fontStyle: 'modern' | 'serif' | 'mono';
    cardStyle: 'glass' | 'solid' | 'minimal' | 'border';
    layout: 'grid' | 'list';
    headerImage: string;
    showImages: boolean;
    showPrices: boolean;
    storeName: string;
    logoUrl: string;
}

const MenuDesign: React.FC = () => {
    const { profile } = useAuth();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'catalog' | 'styling' | 'logic'>('styling');
    const [searchTerm, setSearchTerm] = useState('');
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const { addToast } = useToast();

    // --- CONFIGURACIÓN GLOBAL ---
    const [theme, setTheme] = useState<MenuTheme>({
        accentColor: '#4ADE80',
        borderRadius: 'xl',
        fontStyle: 'modern',
        cardStyle: 'glass',
        layout: 'grid',
        headerImage: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=600',
        showImages: true,
        showPrices: true,
        storeName: 'MI CAFETERÍA',
        logoUrl: ''
    });

    const [logicConfig, setLogicConfig] = useState({
        autoConfirm: false,
        taxInclusive: true,
        allowTableOrder: true,
        allowTakeaway: true
    });

    // Item Selector Modal State
    const [showItemSelector, setShowItemSelector] = useState(false);
    const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
    const [editingComboItemId, setEditingComboItemId] = useState<number | null>(null);
    const [itemSelectorSearch, setItemSelectorSearch] = useState('');

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
                        console.error(`[MenuDesign] Fetch error ${url}:`, response.status, errorText);
                        return [];
                    }
                    return await response.json();
                } catch (e) {
                    clearTimeout(timeoutId);
                    console.warn(`[MenuDesign] Fetch timeout or error ${url}:`, e);
                    return [];
                }
            };

            // 1. Fetch Store Details
            console.log('[MenuDesign] Fetching store...');
            const stores = await fetchWithTimeout(`${baseUrl}/stores?id=eq.${storeId}`);
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
                    borderRadius: savedTheme.borderRadius || prev.borderRadius,
                    fontStyle: savedTheme.fontStyle || prev.fontStyle,
                    cardStyle: savedTheme.cardStyle || prev.cardStyle,
                    layout: savedTheme.layout || prev.layout,
                    headerImage: savedTheme.headerImage || prev.headerImage,
                    showImages: savedTheme.showImages ?? prev.showImages,
                    showPrices: savedTheme.showPrices ?? prev.showPrices
                }));

                if (Object.keys(savedLogic).length > 0) {
                    setLogicConfig(prev => ({
                        ...prev,
                        ...savedLogic
                    }));
                }
            }

            // 2. Fetch INVENTORY items directly via REST
            console.log('[MenuDesign] Fetching inventory items via REST...');
            const inventoryItems = await fetchWithTimeout(
                `${baseUrl}/inventory_items?store_id=eq.${storeId}&order=name.asc`
            );

            // Cast raw data and Map to InventoryItem
            // Note: inventory_items table in Supabase does NOT have 'item_type' column (verified in supabaseTypes.ts)
            // We must assign a default or infer it. 'InventoryManagement.tsx' assigns 'ingredient' by default.
            // For Menu Design, we want to treat them as potential sellables.
            const mappedItems: InventoryItem[] = (inventoryItems || []).map((item: any) => ({
                id: item.id,
                cafe_id: item.store_id, // Map store_id to cafe_id
                name: item.name,
                sku: item.sku,
                // Assign default item_type since it's missing in DB. 
                // We mark as 'sellable' if it has a price > 0, otherwise 'ingredient'
                item_type: (item.cost > 0 || item.price > 0) ? 'sellable' : 'ingredient',
                unit_type: item.unit_type as UnitType,
                image_url: item.image_url || 'https://images.unsplash.com/photo-1580828343064-fde4fc206bc6?auto=format&fit=crop&q=80&w=200',
                is_active: true, // Default to true if not present
                min_stock: item.min_stock_alert,
                current_stock: item.current_stock,
                cost: item.cost,
                price: item.cost * 3, // Default price logic if missing, or use 0
                category_ids: item.category_id ? [item.category_id] : [],
                description: '',
                presentations: [],
                closed_packages: [],
                open_packages: [],
                is_menu_visible: true, // Default to visible for now so they appear
                variants: [],
                addons: []
            }));

            // No filtrar estrictamente ahora, mostramos todo para que el usuario pueda ver sus items
            setItems(mappedItems);
            console.log('[MenuDesign] fetchData complete. Mapped items:', mappedItems.length);
            console.log('[MenuDesign] fetchData complete');
        } catch (err: any) {
            console.error('[MenuDesign] Error fetching data:', err);
            addToast('Error al cargar datos del menú', 'error');
        } finally {
            setLoading(false);
        }
    };

    // --- EDITOR HANDLERS ---


    const updateItem = async (id: string, updates: Partial<InventoryItem>) => {
        // Optimistic local update
        setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));

        const item = items.find(i => i.id === id);
        if (!item) return;

        // Persist changes to inventory_items
        try {
            // Construir el objeto de actualización solo con campos permitidos
            const dbUpdates: any = {};

            if (updates.is_menu_visible !== undefined) dbUpdates.is_menu_visible = updates.is_menu_visible;
            if (updates.name !== undefined) dbUpdates.name = updates.name;
            if (updates.description !== undefined) dbUpdates.description = updates.description;
            if (updates.image_url !== undefined) dbUpdates.image_url = updates.image_url;
            if (updates.price !== undefined) dbUpdates.price = updates.price;

            // Complejos (JSONB columns hopefully)
            if (updates.variants !== undefined) dbUpdates.variants = updates.variants;
            if (updates.addons !== undefined) dbUpdates.addons = updates.addons;
            if (updates.combo_items !== undefined) dbUpdates.combo_items = updates.combo_items;

            if (Object.keys(dbUpdates).length > 0) {
                // Recuperar token para la petición
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

                const response = await fetch(`https://yjxjyxhksedwfeueduwl.supabase.co/rest/v1/inventory_items?id=eq.${id}`, {
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
            }
        } catch (err: any) {
            console.error('[MenuDesign] Error saving item:', err);
            // Verify if error is about missing column
            if (err.message && (err.message.includes('column "addons" does not exist') || err.message.includes('column "variants" does not exist') || err.message.includes('column "combo_items" does not exist'))) {
                addToast('Error: La base de datos no tiene las columnas (addons/variants/combo_items).', 'error');
            } else {
                addToast(`ERROR AL GUARDAR: ${err.message}`, 'error');
            }
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
                            borderRadius: theme.borderRadius,
                            fontStyle: theme.fontStyle,
                            cardStyle: theme.cardStyle,
                            layout: theme.layout,
                            headerImage: theme.headerImage,
                            showImages: theme.showImages,
                            showPrices: theme.showPrices
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
            id: `var-${Date.now()}`,
            name: 'Nueva Variante',
            price_adjustment: 0,
            recipe_overrides: []
        };
        updateItem(selectedItem.id, { variants: [...(selectedItem.variants || []), newVariant] });
    };

    const handleUpdateVariant = (variantId: string, field: keyof ProductVariant, value: any) => {
        if (!selectedItem || !selectedItem.variants) return;
        const updatedVariants = selectedItem.variants.map(v =>
            v.id === variantId ? { ...v, [field]: value } : v
        );
        updateItem(selectedItem.id, { variants: updatedVariants });
    };

    const handleRemoveVariant = (variantId: string) => {
        if (!selectedItem || !selectedItem.variants) return;
        updateItem(selectedItem.id, { variants: selectedItem.variants.filter(v => v.id !== variantId) });
    };

    const handleAddAddon = () => {
        if (!selectedItem) return;
        const newAddon: ProductAddon = {
            id: `add-${Date.now()}`,
            name: 'Extra ...',
            price: 0,
            inventory_item_id: '',
            quantity_consumed: 0
        };
        // Update local state ONLY (Manual Save required)
        setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, addons: [...(i.addons || []), newAddon] } : i));
    };

    const handleUpdateAddon = (addonId: string, field: keyof ProductAddon, value: any) => {
        if (!selectedItem || !selectedItem.addons) return;
        const updatedAddons = selectedItem.addons.map(a =>
            a.id === addonId ? { ...a, [field]: value } : a
        );
        // Update local state ONLY (Manual Save required)
        setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, addons: updatedAddons } : i));
    };

    const handleRemoveAddon = (addonId: string) => {
        if (!selectedItem || !selectedItem.addons) return;
        const filteredAddons = selectedItem.addons.filter(a => a.id !== addonId);
        // Update local state ONLY (Manual Save required)
        setItems(prev => prev.map(i => i.id === selectedItem.id ? { ...i, addons: filteredAddons } : i));
        // Note: You might want to trigger a save for delete immediately, but for consistency we leave it manual?
        // Let's trigger save for delete to avoid confusion, or keep it manual?
        // User said "ir guardando los extras que voy CREANDO". Deleting is different.
        // But to be consistent with "Manual Save" mode, deletion should also be manual.
        // However, users expect delete to be instant. I'll leave it manual for now so they can "undo" by not saving? No, no undo button.
        // I will add a generic "Save Changes" button or per-row save.
    };

    // Explicit Save Helper
    const saveItemChanges = async () => {
        if (!selectedItem) return;
        await updateItem(selectedItem.id, { addons: selectedItem.addons });
        addToast('Extras guardados correctamente', 'success');
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
            const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
            const prompt = `Eres un experto redactor gourmet para cafeterías de especialidad. Escribe una descripción corta (máximo 120 caracteres), sensorial e irresistible para el producto: "${selectedItem.name}". Si el producto es café, menciona notas de cata. No uses comillas.`;
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();
            if (text) updateItem(selectedItem.id, { description: text.trim() });
        } catch (e) {
            console.error("AI Error:", e);
            alert('Error al contactar con SquadAI');
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
        console.log('[ImageUpload] Starting upload (Direct Fetch Mode) for item:', selectedItem.id);

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${selectedItem.id}-${Date.now()}.${fileExt}`;
            const filePath = `${storePrefix}/${fileName}`;
            console.log('[ImageUpload] Path:', filePath);

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const token = localStorage.getItem('access_token');
            const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

            // Construct Upload URL
            // Using /storage/v1/object/{bucket}/{filename}
            const uploadUrl = `${supabaseUrl}/storage/v1/object/product-images/${filePath}`;

            // Prepare Headers
            const headers: HeadersInit = {
                'x-upsert': 'true',
            };

            // Prefer Auth token, fallback to Anon Key if policy allows
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            } else if (apiKey) {
                headers['Authorization'] = `Bearer ${apiKey}`;
            }

            // Direct Fetch Upload
            const response = await fetch(uploadUrl, {
                method: 'POST',
                headers: headers,
                body: file
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Upload failed (${response.status}): ${errorText}`);
            }

            // Construct Public URL Manually
            const publicUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${filePath}`;
            const finalUrl = `${publicUrl}?t=${Date.now()}`;

            console.log('[ImageUpload] Success. URL:', finalUrl);

            await updateItem(selectedItem.id, { image_url: finalUrl });

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
        <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-background-light dark:bg-background-dark animate-in fade-in duration-700">

            {/* Columna de Configuración */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-white/[0.04]">

                <div className="p-8 lg:p-10 border-b border-white/[0.02] space-y-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 text-neon/60 font-bold text-[10px] uppercase tracking-[0.3em]">
                                <span className="size-1 rounded-full bg-neon animate-pulse"></span>
                                UX & Storefront Intelligence
                            </div>
                            <h1 className="text-4xl italic-black tracking-tighter text-text-main dark:text-white uppercase leading-none">
                                Diseño de <span className="text-neon/80">Menú</span>
                            </h1>
                        </div>
                        <div className="flex bg-white dark:bg-surface-dark p-1 rounded-xl border border-white/[0.04] shadow-soft items-center">
                            {storeSlug && (
                                <a
                                    href={`/#/m/${storeSlug}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[#36e27b] hover:underline mr-2 flex items-center gap-2"
                                >
                                    <span className="material-symbols-outlined text-sm">link</span>
                                    Ver Menú Online
                                </a>
                            )}
                            <div className="w-px h-4 bg-white/10 mx-1"></div>
                            <TabBtn active={activeTab === 'catalog'} onClick={() => setActiveTab('catalog')} icon="list_alt">Catálogo</TabBtn>
                            <TabBtn active={activeTab === 'logic'} onClick={() => setActiveTab('logic')} icon="settings_suggest">Lógica</TabBtn>
                            <TabBtn active={activeTab === 'styling'} onClick={() => setActiveTab('styling')} icon="palette">Estética</TabBtn>
                        </div>
                    </div>

                    <div className="relative group w-full">
                        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary opacity-40 text-lg">search</span>
                        <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full h-12 pl-11 pr-5 rounded-2xl bg-white dark:bg-surface-dark border border-white/[0.04] text-[11px] font-bold uppercase tracking-widest outline-none focus:ring-2 focus:ring-neon/10 transition-all shadow-sm" placeholder="Buscar en el inventario..." />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar p-8 lg:p-10 space-y-10">

                    {activeTab === 'catalog' && (
                        <div className="grid grid-cols-1 gap-3 animate-in slide-in-from-bottom-4">
                            <button
                                onClick={() => {
                                    // Use valid UUID for database compatibility
                                    const id = crypto.randomUUID();
                                    const newItem: InventoryItem = {
                                        id,
                                        cafe_id: profile?.store_id || 'c1',
                                        name: 'NUEVO COMBO', sku: 'COMBO-NEW', item_type: 'pack', unit_type: 'unit', image_url: '', is_active: true, min_stock: 0, current_stock: 0, cost: 0, price: 10, is_menu_visible: true, combo_items: [], presentations: [], closed_packages: [], open_packages: []
                                    };
                                    setItems([...items, newItem]);
                                    setEditingId(id);
                                }}
                                className="p-4 rounded-2xl border border-dashed border-neon/30 bg-neon/5 text-neon font-black text-[10px] uppercase tracking-widest hover:bg-neon/10 transition-all mb-4"
                            >
                                + Crear Nuevo Combo/Pack
                            </button>
                            {loading ? (
                                <div className="text-center py-20 opacity-20 italic">
                                    <p className="text-xs font-black uppercase tracking-[0.3em]">Cargando Catálogo Real...</p>
                                </div>
                            ) : filteredItems.length === 0 ? (
                                <div className="text-center py-20 opacity-20 italic bg-white/5 rounded-[3rem] border border-dashed border-white/10">
                                    <span className="material-symbols-outlined text-4xl mb-4">inventory_2</span>
                                    <p className="text-[10px] font-black uppercase tracking-widest px-10 leading-relaxed">No hay ítems registrados en el inventario que coincidan.</p>
                                </div>
                            ) : (
                                filteredItems.map(item => (
                                    <div key={item.id} onClick={() => setEditingId(item.id)} className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${editingId === item.id ? 'bg-neon/5 border-neon/30 ring-2 ring-neon/10' : 'bg-surface-dark border-white/[0.04] shadow-sm'}`}>
                                        <div className="flex items-center gap-5">
                                            <img src={item.image_url || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200'} className="size-14 rounded-xl object-cover" />
                                            <div>
                                                <h4 className={`text-sm font-black uppercase italic tracking-tight leading-none ${editingId === item.id ? 'text-neon' : 'text-white'}`}>{item.name}</h4>
                                                <p className="text-[9px] text-text-secondary font-black uppercase mt-1 opacity-40">
                                                    {item.item_type === 'pack' ? 'TIPO: COMBO' : `COSTO: $${item.cost.toFixed(2)}`}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="shrink-0" onClick={e => e.stopPropagation()}>
                                            <Toggle active={!!item.is_menu_visible} onToggle={() => updateItem(item.id, { is_menu_visible: !item.is_menu_visible })} />
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'logic' && (
                        <div className="space-y-10 animate-in slide-in-from-right-4">
                            <Section title="Protocolos de Venta" icon="settings_suggest">
                                <div className="space-y-4">
                                    <LogicRow title="Confirmación Automática" desc="Los pedidos pasan a preparación sin revisión" active={logicConfig.autoConfirm} onToggle={() => setLogicConfig({ ...logicConfig, autoConfirm: !logicConfig.autoConfirm })} />
                                    <LogicRow title="Precios con Impuestos" desc="El IVA/Tax ya está incluido en el precio final" active={logicConfig.taxInclusive} onToggle={() => setLogicConfig({ ...logicConfig, taxInclusive: !logicConfig.taxInclusive })} />
                                </div>
                            </Section>

                            <Section title="Canales Habilitados" icon="hub">
                                <div className="grid grid-cols-2 gap-4">
                                    <ChannelBtn label="Pedidos Mesa" icon="deck" active={logicConfig.allowTableOrder} onToggle={() => setLogicConfig({ ...logicConfig, allowTableOrder: !logicConfig.allowTableOrder })} />
                                    <ChannelBtn label="Takeaway / QR" icon="shopping_bag" active={logicConfig.allowTakeaway} onToggle={() => setLogicConfig({ ...logicConfig, allowTakeaway: !logicConfig.allowTakeaway })} />
                                </div>
                            </Section>
                        </div>
                    )}

                    {activeTab === 'styling' && (
                        <div className="space-y-8 animate-in slide-in-from-right-4 pb-20">

                            {/* IDENTIDAD DE MARCA */}
                            <Section title="Identidad de Marca" icon="verified">
                                <div className="space-y-6">
                                    {/* Logo Upload & Nombre */}
                                    <div className="flex gap-6 items-start">
                                        <div className="relative group">
                                            <div className="size-20 rounded-2xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center overflow-hidden hover:border-neon/50 transition-all">
                                                {theme.logoUrl ? (
                                                    <img src={theme.logoUrl} className="size-full object-cover" />
                                                ) : (
                                                    <span className="material-symbols-outlined text-white/20 text-2xl group-hover:text-neon">add_photo_alternate</span>
                                                )}
                                                <input type="file" accept="image/*" onChange={handleLogoSelect} className="absolute inset-0 opacity-0 cursor-pointer" />
                                            </div>
                                            <p className="text-[8px] font-black uppercase text-center mt-2 text-text-secondary tracking-widest">Logo</p>
                                        </div>
                                        <div className="flex-1 space-y-4">
                                            <div>
                                                <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest mb-1.5 block">Nombre del Local</label>
                                                <input
                                                    value={theme.storeName}
                                                    onChange={e => setTheme({ ...theme, storeName: e.target.value })}
                                                    className="w-full h-10 px-4 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-white uppercase outline-none focus:ring-1 focus:ring-neon/30 placeholder:text-white/20"
                                                    placeholder="EJ: COFFEE SQUAD"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="h-px bg-white/5"></div>

                                    {/* Color Maestro Custom */}
                                    <div>
                                        <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest mb-3 block">Color Maestro (Marca)</label>
                                        <div className="flex items-center gap-4">
                                            <div className="relative size-12 rounded-full overflow-hidden border-2 border-white/20 shadow-lg">
                                                <input
                                                    type="color"
                                                    value={theme.accentColor}
                                                    onChange={e => setTheme({ ...theme, accentColor: e.target.value })}
                                                    className="absolute -top-1/2 -left-1/2 w-[200%] h-[200%] p-0 m-0 border-none cursor-pointer"
                                                />
                                            </div>
                                            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                                                {['#4ADE80', '#B4965C', '#60A5FA', '#F87171', '#F472B6', '#A78BFA', '#FACC15', '#2DD4BF'].map(c => (
                                                    <button key={c} onClick={() => setTheme({ ...theme, accentColor: c })} className={`size-8 rounded-full border-2 transition-all shrink-0 ${theme.accentColor === c ? 'scale-110 border-white shadow-neon-soft' : 'border-transparent opacity-40 hover:opacity-100 hover:scale-105'}`} style={{ backgroundColor: c }} />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Section>

                            <Section title="Lenguaje Visual" icon="palette">
                                <div className="space-y-6">

                                    {/* Tipografía */}
                                    <div>
                                        <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest mb-3 block">Tipografía</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            <StyleBtn active={theme.fontStyle === 'modern'} onClick={() => setTheme({ ...theme, fontStyle: 'modern' })} label="Moderna" icon="font_download" />
                                            <StyleBtn active={theme.fontStyle === 'serif'} onClick={() => setTheme({ ...theme, fontStyle: 'serif' })} label="Elegante" icon="serif" />
                                            <StyleBtn active={theme.fontStyle === 'mono'} onClick={() => setTheme({ ...theme, fontStyle: 'mono' })} label="Táctica" icon="code" />
                                        </div>
                                    </div>

                                    {/* Estilo de Tarjetas */}
                                    <div>
                                        <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest mb-3 block">Estilo de Cards</label>
                                        <div className="grid grid-cols-4 gap-3">
                                            <StyleBtn active={theme.cardStyle === 'glass'} onClick={() => setTheme({ ...theme, cardStyle: 'glass' })} label="Glass" icon="blur_on" />
                                            <StyleBtn active={theme.cardStyle === 'solid'} onClick={() => setTheme({ ...theme, cardStyle: 'solid' })} label="Solid" icon="rectangle" />
                                            <StyleBtn active={theme.cardStyle === 'border'} onClick={() => setTheme({ ...theme, cardStyle: 'border' })} label="Line" icon="check_box_outline_blank" />
                                            <StyleBtn active={theme.cardStyle === 'minimal'} onClick={() => setTheme({ ...theme, cardStyle: 'minimal' })} label="Clean" icon="short_text" />
                                        </div>
                                    </div>

                                    {/* Radio de Borde */}
                                    <div>
                                        <label className="text-[9px] font-black uppercase text-text-secondary tracking-widest mb-3 block">Radio de Borde</label>
                                        <div className="flex bg-black/40 p-1 rounded-xl">
                                            <button onClick={() => setTheme({ ...theme, borderRadius: 'none' })} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${theme.borderRadius === 'none' ? 'bg-white/10 text-white' : 'text-white/20'}`}>Recto</button>
                                            <button onClick={() => setTheme({ ...theme, borderRadius: 'md' })} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${theme.borderRadius === 'md' ? 'bg-white/10 text-white' : 'text-white/20'}`}>Suave</button>
                                            <button onClick={() => setTheme({ ...theme, borderRadius: 'xl' })} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${theme.borderRadius === 'xl' ? 'bg-white/10 text-white' : 'text-white/20'}`}>Curvo</button>
                                            <button onClick={() => setTheme({ ...theme, borderRadius: 'full' })} className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase transition-all ${theme.borderRadius === 'full' ? 'bg-white/10 text-white' : 'text-white/20'}`}>Round</button>
                                        </div>
                                    </div>

                                </div>
                            </Section>
                        </div>
                    )}
                </div>

                <div className="p-8 border-t border-white/[0.04] flex justify-between items-center bg-surface-dark/50 backdrop-blur-md">
                    <button onClick={() => fetchData()} className="text-[10px] font-black uppercase text-text-secondary tracking-widest opacity-40 hover:opacity-100">Descartar</button>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            handlePublish();
                        }}
                        disabled={isSaving}
                        className="px-10 py-4 rounded-2xl bg-primary text-white font-black text-[11px] uppercase tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                        type="button"
                    >
                        {isSaving ? 'Guardando...' : 'Publicar Cambios'}
                    </button>
                </div>
            </div>

            {/* Editor Lateral (Variants, Addons) - Hidden if styling tab active on small screens for clarity */}
            {activeTab !== 'styling' && (
                <div className={`fixed inset-y-0 left-0 lg:static z-[100] w-full max-w-[650px] bg-surface-dark border-r border-white/[0.04] shadow-2xl transition-transform duration-500 ease-out flex flex-col ${editingId ? 'translate-x-0' : '-translate-x-full lg:hidden'}`}>
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
                                            onChange={(e) => updateItem(selectedItem.id, { name: e.target.value })}
                                            className="w-full h-11 px-4 rounded-xl bg-white/5 border border-white/10 text-white font-black text-sm outline-none focus:ring-1 focus:ring-neon/30 uppercase"
                                            placeholder="Nombre del producto en el menú..."
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Precio Base ($)</label>
                                            <input
                                                type="number"
                                                value={selectedItem.price || 0}
                                                onChange={(e) => updateItem(selectedItem.id, { price: parseFloat(e.target.value) || 0 })}
                                                className="w-full h-12 px-4 rounded-xl bg-white/5 border border-white/10 text-white font-black text-sm outline-none focus:ring-1 focus:ring-neon/30"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Imagen Cover</label>
                                            <div
                                                className={`h-12 rounded-xl bg-white/5 border border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:border-neon/40 transition-all overflow-hidden relative group/img ${isDragging ? 'bg-neon/10 border-neon' : ''}`}
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
                                            onChange={(e) => updateItem(selectedItem.id, { description: e.target.value })}
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
                                                    const currentCombo = selectedItem.combo_items || [];
                                                    const newItem = { inventory_item_id: '', quantity: 1 };
                                                    updateItem(selectedItem.id, { combo_items: [...currentCombo, newItem as any] });
                                                }}
                                                className="text-[8px] font-black bg-neon/10 hover:bg-neon/20 text-neon px-3 py-1.5 rounded-lg uppercase tracking-widest transition-all border border-neon/20"
                                            >
                                                + Agregar Item al Pack
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {(selectedItem.combo_items || []).map((comboItem: any, idx: number) => {
                                                const linkedItem = items.find(i => i.id === comboItem.inventory_item_id);
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
                                                                        value={comboItem.quantity || 1}
                                                                        onChange={(e) => {
                                                                            const newCombo = [...(selectedItem.combo_items || [])];
                                                                            newCombo[idx] = { ...newCombo[idx], quantity: parseFloat(e.target.value) || 1 };
                                                                            updateItem(selectedItem.id, { combo_items: newCombo });
                                                                        }}
                                                                        className="w-full h-9 pl-3 pr-2 rounded-lg bg-black/20 border border-white/10 text-[10px] font-black text-white outline-none focus:border-neon/30"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="col-span-1">
                                                                <button
                                                                    onClick={() => {
                                                                        const newCombo = (selectedItem.combo_items || []).filter((_, i) => i !== idx);
                                                                        updateItem(selectedItem.id, { combo_items: newCombo });
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
                                            {(!selectedItem.combo_items || selectedItem.combo_items.length === 0) && (
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
                                                        <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Impacto en Stock: Automático (Receta)</span>
                                                        <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">
                                                            Precio Final: <span className="text-white">${((selectedItem.price || 0) + variant.price_adjustment).toFixed(2)}</span>
                                                        </span>
                                                    </div>
                                                </div>
                                                <button onClick={() => handleRemoveVariant(variant.id)} className="size-9 rounded-lg bg-white/5 flex items-center justify-center text-white/20 hover:text-red-500 hover:bg-red-500/10 transition-all">
                                                    <span className="material-symbols-outlined text-base">delete</span>
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
                                        {selectedItem.addons?.map((addon, idx) => {
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
                                        {(!selectedItem.addons || selectedItem.addons.length === 0) && (
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
            )}

            {/* Live Preview (Dynamic) */}
            <div className={`hidden lg:flex w-[480px] bg-[#0a0c0a] border-l border-white/[0.04] items-center justify-center p-10 ${activeTab === 'styling' ? 'flex-1' : ''}`}>
                <div className="relative w-full max-w-[340px] aspect-[9/19] bg-background-dark rounded-[3rem] shadow-[0_40px_100px_rgba(0,0,0,0.5)] border-[12px] border-[#1a1c1a] overflow-hidden flex flex-col transition-all duration-500">
                    {/* Dynamic Header */}
                    <div className="relative h-48 shrink-0 overflow-hidden group">
                        <img src={theme.headerImage} className="absolute inset-0 size-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-700" />
                        <div className="absolute inset-0 bg-gradient-to-t from-background-dark via-background-dark/20 to-transparent"></div>
                        <div className="absolute bottom-6 left-6 right-6">
                            {theme.logoUrl ? (
                                <img src={theme.logoUrl} className="h-12 w-auto object-contain mb-2" alt="Logo" />
                            ) : null}
                            <h2 className={`text-3xl font-black uppercase tracking-tighter text-white leading-none mb-1 ${preview.font}`}>{theme.storeName}</h2>
                            <p className={`text-[9px] font-bold uppercase tracking-widest opacity-80 ${preview.font}`} style={{ color: theme.accentColor }}>Digital Storefront</p>
                        </div>
                    </div>

                    {/* Dynamic Content */}
                    <div className="flex-1 p-5 space-y-4 overflow-y-auto no-scrollbar bg-background-dark">
                        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                            {(previewCategories.length > 0 ? previewCategories : ['General']).map(cat => (
                                <button key={cat} className={`px-4 py-1.5 ${preview.rounded} text-[9px] font-black uppercase tracking-widest border transition-all whitespace-nowrap`} style={{ borderColor: theme.accentColor, color: theme.accentColor }}>{cat}</button>
                            ))}
                        </div>

                        {items.filter(i => i.is_menu_visible).slice(0, 4).map(item => (
                            <div key={item.id} className={`p-4 flex gap-4 items-start group transition-all ${preview.cardBase} ${preview.rounded}`}>
                                <img src={item.image_url || 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&q=80&w=200'} className={`size-16 object-cover ${preview.rounded}`} />
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <h4 className={`text-[11px] font-black uppercase text-white truncate pr-2 ${preview.font}`}>{item.name}</h4>
                                        {theme.showPrices && <p className={`text-[11px] font-black ${preview.font}`} style={{ color: theme.accentColor }}>${item.price?.toFixed(2)}</p>}
                                    </div>
                                    <p className={`text-[9px] text-white/40 line-clamp-2 mt-1 leading-relaxed ${preview.font} ${theme.fontStyle === 'serif' ? 'italic' : ''}`}>{item.description}</p>
                                    <button className={`mt-3 w-full py-2 ${preview.rounded} text-[8px] font-black uppercase tracking-widest text-black hover:opacity-90 transition-opacity`} style={{ backgroundColor: theme.accentColor }}>
                                        Agregar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Notch */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#1a1c1a] rounded-b-xl z-20"></div>
                </div>
            </div>
            {/* ITEM SELECTOR MODAL */}
            {showItemSelector && (
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
                                                const newCombo = [...(selectedItem.combo_items || [])];
                                                if (newCombo[editingComboItemId]) {
                                                    newCombo[editingComboItemId] = { ...newCombo[editingComboItemId], inventory_item_id: item.id };
                                                    updateItem(selectedItem.id, { combo_items: newCombo });
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
            )}

        </div>
    );
};

// Componentes Auxiliares
const StyleBtn: React.FC<{ active: boolean, onClick: () => void, label: string, icon: string }> = ({ active, onClick, label, icon }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center gap-2 p-3 rounded-xl border transition-all ${active ? 'bg-white/10 border-white text-white' : 'border-white/5 text-white/30 hover:bg-white/5'}`}>
        <span className="material-symbols-outlined text-lg">{icon}</span>
        <span className="text-[8px] font-black uppercase tracking-widest">{label}</span>
    </button>
);

const TabBtn: React.FC<{ active: boolean, onClick: () => void, icon: string, children: React.ReactNode }> = ({ active, onClick, icon, children }) => (
    <button onClick={onClick} className={`px-6 py-2.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-2.5 ${active ? 'bg-primary dark:bg-neon/10 text-white dark:text-neon border border-primary dark:border-neon/20' : 'text-text-secondary hover:text-neon'}`}>
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
        {children}
    </button>
);

const LogicRow: React.FC<{ title: string, desc: string, active: boolean, onToggle: () => void }> = ({ title, desc, active, onToggle }) => (
    <div className="flex items-center justify-between p-6 rounded-2xl bg-white/[0.02] border border-white/5">
        <div>
            <p className="text-sm font-black text-white uppercase italic tracking-tight">{title}</p>
            <p className="text-[9px] text-text-secondary uppercase mt-1 tracking-widest opacity-60">{desc}</p>
        </div>
        <Toggle active={active} onToggle={onToggle} />
    </div>
);

const ChannelBtn: React.FC<{ label: string, icon: string, active: boolean, onToggle: () => void }> = ({ label, icon, active, onToggle }) => (
    <button onClick={onToggle} className={`p-6 rounded-3xl border flex flex-col gap-4 items-center transition-all ${active ? 'border-neon bg-neon/5 text-neon shadow-neon-soft' : 'border-white/5 opacity-40 hover:opacity-100'}`}>
        <span className="material-symbols-outlined text-3xl">{icon}</span>
        <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </button>
);

const Section: React.FC<{ title: string, icon: string, children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-surface-dark p-8 rounded-[2.5rem] border border-white/5 space-y-8">
        <div className="flex items-center gap-4 border-b border-white/5 pb-6">
            <span className="material-symbols-outlined text-neon text-xl">{icon}</span>
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white italic leading-none">{title}</h3>
        </div>
        {children}
    </div>
);

const Toggle: React.FC<{ active: boolean, onToggle: () => void }> = ({ active, onToggle }) => (
    <button onClick={onToggle} className={`relative inline-flex h-6 w-12 cursor-pointer rounded-full transition-all duration-300 ${active ? 'bg-neon shadow-[0_0_10px_rgba(74,222,128,0.3)]' : 'bg-white/10'}`}>
        <span className={`h-5 w-5 transform rounded-full bg-white transition duration-300 ${active ? 'translate-x-6' : 'translate-x-1'} mt-0.5`} />
    </button>
);

export default MenuDesign;
