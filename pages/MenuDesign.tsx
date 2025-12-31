import React, { useState, useMemo, useRef, useEffect } from 'react';
import { InventoryItem, ProductVariant, ProductAddon, UnitType, RecipeComponent, Store } from '../types';
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
    Check
} from 'lucide-react';

interface MenuTheme {
    // Marca
    storeName: string;
    logoUrl: string;
    headerImage: string;
    headerOverlay: number;

    // Colores
    accentColor: string;
    backgroundColor: string;
    surfaceColor: string;
    textColor: string;

    // Layout & Forma
    layoutMode: 'grid' | 'list';
    columns: 1 | 2;
    cardStyle: 'glass' | 'solid' | 'minimal' | 'border' | 'floating';
    borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl' | 'full';

    // Visibilidad
    showImages: boolean;
    showPrices: boolean;
    showDescription: boolean;
    showAddButton: boolean;
    showBadges: boolean;

    // Preserved fields from previous version
    headerAlignment: 'left' | 'center';
    fontStyle: 'modern' | 'serif' | 'mono';
}

const MenuDesign: React.FC = () => {
    const { profile } = useAuth();
    const [items, setItems] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [editingId, setEditingId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'ESTÉTICA' | 'LÓGICA' | 'INVENTARIO'>('ESTÉTICA');
    const [searchTerm, setSearchTerm] = useState('');
    const [isGeneratingAI, setIsGeneratingAI] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [previewTab, setPreviewTab] = useState<'menu' | 'club' | 'profile'>('menu');

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

            // 2. Fetch INVENTORY items directly via REST
            console.log('[MenuDesign] Fetching inventory items via REST...');
            const inventoryItems = await fetchWithTimeout(
                `${baseUrl}/inventory_items?store_id=eq.${storeId}&order=name.asc`
            );

            // 3. Fetch CATEGORIES (New Sync)
            console.log('[MenuDesign] Fetching categories...');
            const categoriesData = await fetchWithTimeout(
                `${baseUrl}/categories?store_id=eq.${storeId}&is_active=eq.true&order=position.asc`
            );
            setCategories(categoriesData || []);

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

            // Complejos (JSONB columns)
            if (updates.variants !== undefined) dbUpdates.variants = updates.variants;
            if (updates.addon_links !== undefined) dbUpdates.addons = updates.addon_links;
            if (updates.combo_links !== undefined) dbUpdates.combo_items = updates.combo_links;

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
        // Consolidated: Push to addon_links
        updateItem(selectedItem.id, { addon_links: [...(selectedItem.addon_links || []), newAddon] });
    };

    const handleUpdateAddon = (addonId: string, field: keyof ProductAddon, value: any) => {
        if (!selectedItem || !selectedItem.addon_links) return;
        const updatedAddons = selectedItem.addon_links.map(a =>
            a.id === addonId ? { ...a, [field]: value } : a
        );
        updateItem(selectedItem.id, { addon_links: updatedAddons });
    };

    const handleRemoveAddon = (addonId: string) => {
        if (!selectedItem || !selectedItem.addon_links) return;
        const filteredAddons = selectedItem.addon_links.filter(a => a.id !== addonId);
        updateItem(selectedItem.id, { addon_links: filteredAddons });
    };

    // Explicit Save Helper
    const saveItemChanges = async () => {
        if (!selectedItem) return;
        // Force update to DB to ensure persistence
        await updateItem(selectedItem.id, {
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
            updateItem(selectedItem.id, {
                addon_links: [...(selectedItem.addon_links || []), newAddonLink]
            });
        } else if (linkType === 'combo') {
            const newComboLink = { id: crypto.randomUUID(), component_item_id: itemToLink.id, quantity: 1 };
            updateItem(selectedItem.id, {
                combo_links: [...(selectedItem.combo_links || []), newComboLink]
            });
        } else if ((linkType as string) === 'variant_override') {
            const variantId = editingAddonId; // reusing this state
            if (!variantId) return;
            const variant = selectedItem.variants?.find(v => v.id === variantId);
            if (!variant) return;

            const newOverride = { ingredient_id: itemToLink.id, quantity_delta: 1 };
            const updatedVariants = selectedItem.variants?.map(v =>
                v.id === variantId ? { ...v, recipe_overrides: [...(v.recipe_overrides || []), newOverride] } : v
            );
            updateItem(selectedItem.id, { variants: updatedVariants });
        }
        setShowItemSelector(false);
    };

    const handleDeleteLink = (itemId: string, linkId: string) => {
        const item = items.find(i => i.id === itemId);
        if (!item) return;

        if (linkType === 'addon') {
            const updatedAddonLinks = (item.addon_links || []).filter(link => link.id !== linkId);
            updateItem(itemId, { addon_links: updatedAddonLinks });
        } else if (linkType === 'combo') {
            const updatedComboLinks = (item.combo_links || []).filter(link => link.id !== linkId);
            updateItem(itemId, { combo_links: updatedComboLinks });
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
        <div className="min-h-screen bg-[#0D0F0D] text-white p-4 md:p-8 font-sans selection:bg-[#4ADE80]/30">
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
                        {(['ESTÉTICA', 'LÓGICA', 'INVENTARIO'] as const).map(tab => (
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
                                    <div>
                                        <label className="text-[9px] font-black text-[#52525B] uppercase tracking-widest mb-1.5 block">Cabecera (URL)</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={theme.headerImage}
                                                onChange={e => setTheme({ ...theme, headerImage: e.target.value })}
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs focus:border-[#4ADE80]/50 transition-all outline-none pr-8"
                                            />
                                            <Image className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#52525B]" />
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
                                        <div key={item.id} className="bg-black/30 border border-white/5 rounded-xl p-3 hover:border-[#4ADE80]/30 transition-all group">
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
                                                        onClick={() => updateItem(item.id, { is_menu_visible: !item.is_menu_visible })}
                                                        className={`w-6 h-3 rounded-full transition-colors relative ${item.is_menu_visible ? 'bg-[#4ADE80]' : 'bg-white/10'}`}
                                                    >
                                                        <div className={`absolute top-0.5 left-0.5 w-2 h-2 bg-white rounded-full transition-transform ${item.is_menu_visible ? 'translate-x-3' : ''}`} />
                                                    </button>
                                                </div>

                                                <div className="grid grid-cols-2 gap-1.5">
                                                    <button
                                                        onClick={() => { setEditingId(item.id); setLinkType('variant'); }}
                                                        className={`py-1.5 rounded-lg border ${item.variants && item.variants.length > 0 ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-white/5 border-white/10 text-white/40'} text-[8px] font-black uppercase tracking-widest hover:border-white/30 transition-all text-center`}
                                                    >
                                                        {item.variants?.length || 0} VAR
                                                    </button>
                                                    <button
                                                        onClick={() => { setEditingId(item.id); setLinkType('addon'); }}
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
                        <div className="flex-1 flex flex-col relative overflow-hidden bg-black">
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

                            {/* Bottom Nav Simulation (Exact Replica) */}
                            <div className="shrink-0 relative z-40">
                                <nav className="absolute bottom-0 left-0 right-0 bg-black/90 backdrop-blur-2xl border-t border-white/5 pb-6 pt-2 px-8">
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
                                                        const currentCombo = selectedItem.combo_links || [];
                                                        const newLink = { id: crypto.randomUUID(), component_item_id: '', quantity: 1 };
                                                        updateItem(selectedItem.id, { combo_links: [...currentCombo, newLink] });
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
                                                                                updateItem(selectedItem.id, { combo_links: newCombo });
                                                                            }}
                                                                            className="w-full h-9 pl-3 pr-2 rounded-lg bg-black/20 border border-white/10 text-[10px] font-black text-white outline-none focus:border-neon/30"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="col-span-1">
                                                                    <button
                                                                        onClick={() => {
                                                                            const newCombo = (selectedItem.combo_links || []).filter((_, i) => i !== idx);
                                                                            updateItem(selectedItem.id, { combo_links: newCombo });
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
                                                            <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Ajuste de Receta: {variant.recipe_overrides?.length || 0} ítems</span>
                                                            <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">
                                                                Precio Final: <span className="text-white">${((selectedItem.price || 0) + variant.price_adjustment).toFixed(2)}</span>
                                                            </span>
                                                        </div>

                                                        {/* STOCK OVERRIDES UI */}
                                                        <div className="pt-2 border-t border-white/5 space-y-2">
                                                            {variant.recipe_overrides?.map((ov, ovIdx) => {
                                                                const ovItem = items.find(i => i.id === ov.ingredient_id);
                                                                return (
                                                                    <div key={ovIdx} className="flex items-center gap-2 p-2 rounded-lg bg-black/40 border border-white/5 group/ov">
                                                                        <div className="flex-1 text-[9px] font-bold text-white/60 truncate">
                                                                            {ovItem?.name || 'Insumo Desconocido'}
                                                                        </div>
                                                                        <input
                                                                            type="number"
                                                                            value={ov.quantity_delta}
                                                                            onChange={(e) => {
                                                                                const newOverrides = [...(variant.recipe_overrides || [])];
                                                                                newOverrides[ovIdx] = { ...ov, quantity_delta: parseFloat(e.target.value) || 0 };
                                                                                handleUpdateVariant(variant.id, 'recipe_overrides', newOverrides);
                                                                            }}
                                                                            className="w-16 h-7 bg-white/5 border border-white/10 rounded px-2 text-[9px] font-black text-right outline-none focus:border-neon/30"
                                                                            step={0.01}
                                                                        />
                                                                        <span className="text-[8px] font-bold text-white/20 w-6 uppercase">{ovItem?.unit_type || 'un'}</span>
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
                                                                    setEditingId(selectedItem.id); // redundante pero seguro
                                                                    setEditingAddonId(variant.id); // REUTILIZAMOS para el ID de la variante
                                                                    setLinkType('variant_override' as any);
                                                                    setShowItemSelector(true);
                                                                }}
                                                                className="w-full h-7 border border-dashed border-white/10 rounded-lg text-[8px] font-bold text-white/30 hover:text-white/60 hover:border-white/20 transition-all uppercase tracking-widest"
                                                            >
                                                                + Añadir Impacto en Stock
                                                            </button>
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
                                                        updateItem(selectedItem.id, { combo_links: newCombo });
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
